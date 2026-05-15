import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type SpiderMediaPlugin from "../main";

// Node 接口（无 @types/node，故用 require 取并窄类型化）
interface FsPromisesLike {
	mkdir(p: string, opts: { recursive: boolean }): Promise<void>;
	writeFile(p: string, data: Uint8Array): Promise<void>;
}
interface NodeBufferStatic {
	from(input: string, encoding: string): Uint8Array;
}
const nodeRequire =
	typeof window !== "undefined" && typeof (window as unknown as { require?: unknown }).require === "function"
		? ((window as unknown as { require: (m: string) => unknown }).require)
		: null;
const fsPromises = (nodeRequire?.("fs") as { promises?: FsPromisesLike } | undefined)?.promises;
const osMod = nodeRequire?.("os") as { tmpdir(): string } | undefined;
const pathMod = nodeRequire?.("path") as { join(...parts: string[]): string } | undefined;
const BufferCtor = (window as unknown as { Buffer?: NodeBufferStatic }).Buffer;

export const VIEW_TYPE_XIAOHONGSHU_BROWSER = "spider-media-xiaohongshu-browser";

interface WebviewElement extends HTMLElement {
	src: string;
	partition: string;
	allowpopups: string;
	loadURL(url: string): Promise<void>;
	executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
	getURL(): string;
	reload(): void;
	openDevTools(): void;
}

interface InjectionPayload {
	title: string;
	html: string;
}

interface InjectionResult {
	ok: boolean;
	msg?: string;
}

const XIAOHONGSHU_HOME = "https://creator.xiaohongshu.com/";
const XIAOHONGSHU_PUBLISH = "https://creator.xiaohongshu.com/publish/publish?source=official";
const XIAOHONGSHU_PARTITION = "persist:spider-media-xiaohongshu";

/**
 * 小红书创作中心 Obsidian 内嵌 webview 视图。
 *
 * 小红书目前公开能直接 web 发布的形态是「图文笔记」，编辑器是受控 textarea：
 *   - 标题：input[placeholder*="标题"]，限 20 字
 *   - 正文：textarea[placeholder*="正文"]（部分版本是 contenteditable 但同样仅接受文本）
 * 注入路径：把 HTML 退化为纯文本（保留换行 / 列表项前缀）后用 React 受控
 * setter 直接写值。视频/图片仍需用户手动上传——这是平台限制。
 */
export class XiaohongshuBrowserView extends ItemView {
	private webview!: WebviewElement;
	private statusEl!: HTMLElement;
	private pending: InjectionPayload | null = null;
	private isReady = false;

	constructor(leaf: WorkspaceLeaf, _plugin: SpiderMediaPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_XIAOHONGSHU_BROWSER;
	}

	getDisplayText(): string {
		return "小红书";
	}

	getIcon(): string {
		return "heart";
	}

	async submitPayload(payload: InjectionPayload): Promise<void> {
		this.pending = payload;
		this.setStatus("准备发布…");
		await this.runInject(true);
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass("spider-media-browser-view");

		const toolbar = root.createDiv({ cls: "smb-toolbar" });
		this.btn(toolbar, "首页", () => void this.webview.loadURL(XIAOHONGSHU_HOME));
		this.btn(toolbar, "发布笔记", () => void this.webview.loadURL(XIAOHONGSHU_PUBLISH));
		this.btn(toolbar, "注入正文", () => void this.runInject(true), "mod-cta");
		this.btn(toolbar, "刷新", () => this.webview.reload());
		this.btn(toolbar, "DevTools", () => this.webview.openDevTools());
		this.statusEl = toolbar.createSpan({ cls: "smb-status", text: "加载中…" });

		this.webview = activeDocument.createElement("webview") as unknown as WebviewElement;
		this.webview.setAttribute("src", XIAOHONGSHU_HOME);
		this.webview.setAttribute("partition", XIAOHONGSHU_PARTITION);
		this.webview.setAttribute("allowpopups", "true");
		root.appendChild(this.webview);

		this.webview.addEventListener("dom-ready", () => {
			this.isReady = true;
			this.setStatus("已就绪。请登录后点击「发布笔记」并先上传图片。");
		});
		this.webview.addEventListener("did-navigate", (e: Event) => {
			const url = (e as unknown as { url: string }).url;
			this.setStatus(`已跳转：${url}`);
		});
	}

	async onClose(): Promise<void> {
		// webview 随 DOM 释放
	}

	private btn(parent: HTMLElement, text: string, onClick: () => void, extra = ""): void {
		const b = parent.createEl("button", { text, cls: `smb-btn ${extra}`.trim() });
		b.addEventListener("click", onClick);
	}

	private setStatus(text: string): void {
		this.statusEl?.setText(text);
	}

	private async waitReady(timeoutMs = 10_000): Promise<void> {
		const deadline = Date.now() + timeoutMs;
		while (!this.isReady && Date.now() < deadline) {
			await new Promise((r) => window.setTimeout(r, 100));
		}
	}

	private async runInject(navigateIfNeeded: boolean): Promise<void> {
		if (!this.pending) {
			this.setStatus("没有待注入内容，请先在编辑器视图点「同步到平台」");
			return;
		}
		await this.waitReady();
		const url = this.webview.getURL();
		if (!/creator\.xiaohongshu\.com\/publish/.test(url)) {
			if (!navigateIfNeeded) {
				this.setStatus("当前不在发布页面，请先点「发布笔记」");
				return;
			}
			await this.webview.loadURL(XIAOHONGSHU_PUBLISH);
			await new Promise((r) => window.setTimeout(r, 4000));
		}

		const { title, html } = this.pending;

		// 抽取代码块图片：保存到磁盘 + 自动逐张粘贴上传。
		const dataUrls = this.extractCodeImageDataUrls(html);
		await this.dumpCodeBlockImagesToDisk(dataUrls);

		// 先尝试自动上传代码图（页面侧合成 File + 派发 change/drop 事件）
		let autoUploaded = 0;
		if (dataUrls.length > 0) {
			this.setStatus(`正在自动上传 ${dataUrls.length} 张代码图…`);
			autoUploaded = await this.autoPasteImages(dataUrls);
		}

		const code = this.buildInjectionCode(title, html);
		try {
			const result = (await this.webview.executeJavaScript(code, true)) as InjectionResult;
			if (result?.ok) {
				const imgMsg = dataUrls.length === 0
					? ""
					: autoUploaded === dataUrls.length
						? `；已自动上传 ${autoUploaded} 张代码图`
						: `；自动上传 ${autoUploaded}/${dataUrls.length} 张代码图（其余可在编辑器中 Ctrl+V 或从临时目录拖入）`;
				this.setStatus(`✅ 已注入文字内容${imgMsg}`);
				new Notice(`内容已注入小红书编辑器${imgMsg}`);
			} else {
				this.setStatus(`❌ 注入失败：${result?.msg ?? "未知错误"}`);
				new Notice(`注入失败：${result?.msg ?? ""}`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStatus(`❌ 执行脚本失败：${msg}`);
			new Notice(`执行脚本失败：${msg}`);
		}
	}

	/** 提取 HTML 中所有代码块图片的 dataURL（按顺序） */
	private extractCodeImageDataUrls(html: string): string[] {
		const re = /<img[^>]*data-codeblock-img="1"[^>]*src="(data:image\/(?:png|jpeg);base64,[^"]+)"/g;
		const urls: string[] = [];
		for (const m of html.matchAll(re)) urls.push(m[1]);
		return urls;
	}

	/**
	 * 自动上传代码块图片到小红书：
	 *   1. 在 webview 内把 dataURL 还原为 File 对象
	 *   2. 优先策略：找到 input[type=file]，赋值 files + 派发 change
	 *   3. 兜底策略：找上传区，派发完整 dragenter/dragover/drop 事件
	 *   4. 再兜底：剪贴板 + paste 事件
	 *
	 * 返回成功触发上传的图片数量。
	 */
	private async autoPasteImages(dataUrls: string[]): Promise<number> {
		if (dataUrls.length === 0) return 0;

		// 把所有 dataURL 一次性传进 webview，由页面侧轮询/找上传组件/触发上传
		const code = `(async () => {
  const dataUrls = ${JSON.stringify(dataUrls)};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...a) => { try { console.log("[spider-media][xhs-upload]", ...a); } catch {} };

  // 0. 切到 "上传图文" tab（如有）。多种文案兜底。
  const clickTab = (text) => {
    const all = document.querySelectorAll('button, span, div, a, [role="tab"], [class*="tab"]');
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (t === text || t === text + ' ') { try { el.click(); log('clicked tab', text); return true; } catch {} }
    }
    return false;
  };
  clickTab('上传图文') || clickTab('图文') || clickTab('发布图文') || clickTab('上传视频');
  await sleep(800);
  // 再次尝试图文（视频→图文）
  clickTab('上传图文') || clickTab('图文');
  await sleep(800);

  // 1. 轮询查找 file input（最多 15s）。优先 accept 含 image 的。
  const findFileInputs = () => {
    const out = [];
    const scan = (d) => {
      try {
        const els = d.querySelectorAll('input[type="file"]');
        for (const el of els) out.push(el);
      } catch {}
    };
    scan(document);
    for (let i = 0; i < window.frames.length; i++) {
      try { scan(window.frames[i].document); } catch {}
    }
    return out;
  };
  const findDropZone = () => {
    const sels = [
      '.upload-input', '.upload-wrapper', '.upload-container', '.drag-over',
      '[class*="upload"]', '[class*="dropzone"]', '[class*="drag"]',
    ];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };

  let inputs = [];
  let zone = null;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    inputs = findFileInputs();
    zone = findDropZone();
    if (inputs.length > 0 || zone) break;
    await sleep(400);
  }
  log('found inputs=' + inputs.length + ' zone=' + (zone ? (zone.className || zone.tagName) : 'null'));

  if (inputs.length === 0 && !zone) {
    return { uploaded: 0, total: dataUrls.length, strategy: 'none', reason: '未找到上传 input 或拖拽区' };
  }

  // 2. 把所有 dataURL 转 File，一次性灌入（小红书支持批量上传）。
  const files = [];
  for (let i = 0; i < dataUrls.length; i++) {
    try {
      const res = await fetch(dataUrls[i]);
      const blob = await res.blob();
      files.push(new File([blob], 'code-' + (i + 1) + '.png', { type: blob.type || 'image/png' }));
    } catch (e) {
      log('fetch dataUrl failed idx=' + i, e && e.message);
    }
  }
  log('built files=' + files.length);
  if (files.length === 0) return { uploaded: 0, total: dataUrls.length, strategy: 'no-files' };

  // 3. 策略 A：input.files + change（accept=image 优先）
  let strategy = '';
  let ok = false;
  const sortedInputs = inputs.slice().sort((a, b) => {
    const score = (el) => ((el.accept || '').includes('image') ? 0 : 1);
    return score(a) - score(b);
  });
  for (const input of sortedInputs) {
    try {
      const dt = new DataTransfer();
      for (const f of files) dt.items.add(f);
      // input 可能被禁用或不可写：尝试两种方式
      try { input.files = dt.files; } catch {
        Object.defineProperty(input, 'files', { value: dt.files, writable: false, configurable: true });
      }
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      strategy = 'input(accept=' + (input.accept || '*') + ')';
      ok = true;
      log('strategy A ok', strategy);
      break;
    } catch (e) {
      log('input strategy failed', e && e.message);
    }
  }

  // 4. 策略 B：drop 事件（无论 A 是否成功，再触发一次以最大化命中率）
  const dropTarget = zone || (sortedInputs[0] && sortedInputs[0].closest('[class*="upload"],[class*="drag"],[class*="drop"]')) || document.body;
  try {
    const dt = new DataTransfer();
    for (const f of files) dt.items.add(f);
    for (const type of ['dragenter', 'dragover', 'drop']) {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt });
      dropTarget.dispatchEvent(ev);
    }
    if (!ok) {
      strategy = 'drop(' + (dropTarget.className || dropTarget.tagName) + ')';
      ok = true;
    } else {
      strategy += '+drop';
    }
    log('strategy B ok', strategy);
  } catch (e) {
    log('drop strategy failed', e && e.message);
  }

  // 5. 等待上传完成
  await sleep(2500 + files.length * 500);

  return { uploaded: ok ? files.length : 0, total: dataUrls.length, strategy };
})();`;

		try {
			const result = (await this.webview.executeJavaScript(code, true)) as {
				uploaded: number;
				total: number;
				strategy: string;
				reason?: string;
			};
			const reason = result?.reason ? `（${result.reason}）` : "";
			this.setStatus(
				`代码图上传 ${result?.uploaded ?? 0}/${result?.total ?? dataUrls.length}（策略：${result?.strategy || "未知"}）${reason}`,
			);
			return result?.uploaded ?? 0;
		} catch (err) {
			console.warn("[spider-media] autoPasteImages 执行失败", err);
			return 0;
		}
	}

	/** 把 dataURL 数组写到 OS 临时目录（用户兜底） */
	private async dumpCodeBlockImagesToDisk(dataUrls: string[]): Promise<string[]> {
		if (dataUrls.length === 0) return [];
		if (!fsPromises || !osMod || !pathMod || !BufferCtor) {
			console.warn("[spider-media] Node fs/os/path/Buffer 不可用，跳过保存代码图");
			return [];
		}

		const dir = pathMod.join(osMod.tmpdir(), "spider-media-xhs-code");
		try {
			await fsPromises.mkdir(dir, { recursive: true });
		} catch (err) {
			console.warn("[spider-media] 无法创建临时目录", err);
			return [];
		}

		const saved: string[] = [];
		const stamp = Date.now();
		for (let i = 0; i < dataUrls.length; i++) {
			const match = /^data:image\/(png|jpeg);base64,(.+)$/.exec(dataUrls[i]);
			if (!match) continue;
			const ext = match[1];
			const buf = BufferCtor.from(match[2], "base64");
			const file = pathMod.join(dir, `code-${stamp}-${i + 1}.${ext}`);
			try {
				await fsPromises.writeFile(file, buf);
				saved.push(file);
			} catch (err) {
				console.warn("[spider-media] 写入代码图失败", err);
			}
		}

		return saved;
	}

	/**
	 * 小红书发布页编辑器：
	 *   - 标题 input：限 20 字，超出会被自动截断。
	 *   - 正文 textarea / contenteditable：只接受文本，不会渲染 HTML 标签。
	 * 因此本地先用 DOMParser 把 HTML 降级为带 emoji 列表前缀的纯文本。
	 */
	private buildInjectionCode(title: string, html: string): string {
		return `(async () => {
  try {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TITLE = ${JSON.stringify(title)}.slice(0, 20);
  const HTML = ${JSON.stringify(html)};
  const log = (...a) => { try { console.log("[spider-media][xiaohongshu]", ...a); } catch (_) {} };

  // ===== HTML 实体解码（不依赖 innerHTML，避免 Trusted Types CSP）=====
  const decodeEntities = (s) => {
    const named = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
    return String(s)
      .replace(/&#(x?)([0-9a-fA-F]+);/g, (_, hex, code) => {
        const n = parseInt(code, hex ? 16 : 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : "";
      })
      .replace(/&([a-zA-Z]+);/g, (m, name) => (name in named ? named[name] : m));
  };

  // ===== HTML → 纯文本 =====
  const htmlToText = (src) => {
    try {
      const doc = new DOMParser().parseFromString(src, "text/html");
      const lines = [];
      let codeImgCounter = 0;

      // 收集块级元素的"行内内容"为单行字符串（保留 <br> 换行 / <img> 占位）。
      // 这样 <p>Hello <strong>world</strong>!</p> 输出 "Hello world!" 而不是被拆成 3 行。
      const getInlineText = (node) => {
        if (node.nodeType === Node.TEXT_NODE) return node.textContent || "";
        if (node.nodeType !== Node.ELEMENT_NODE) return "";
        const tag = node.tagName.toLowerCase();
        if (tag === "br") return "\\n";
        if (tag === "img") {
          // 代码块图片占位：实际图片通过文件上传，这里只放序号标记
          if (node.getAttribute("data-codeblock-img") === "1") {
            codeImgCounter++;
            return "[代码图片 " + codeImgCounter + "]";
          }
          const alt = node.getAttribute("alt") || "";
          return "[图片" + (alt ? "：" + alt : "") + "]";
        }
        let out = "";
        for (const child of node.childNodes) out += getInlineText(child);
        return out;
      };

      const pushBlock = (text) => {
        const t = text.replace(/[ \\t]+/g, " ").replace(/ *\\n */g, "\\n").trim();
        if (t) lines.push(t);
      };

      const walk = (node, ctx) => {
        if (node.nodeType === Node.TEXT_NODE) {
          // 顶层裸文本节点（少见）
          const t = (node.textContent || "").trim();
          if (t) lines.push(t);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();

        if (tag === "br") { lines.push(""); return; }
        if (tag === "hr") { lines.push("———"); return; }
        if (tag === "img") {
          if (node.getAttribute("data-codeblock-img") === "1") {
            codeImgCounter++;
            lines.push("[代码图片 " + codeImgCounter + "]");
            return;
          }
          const alt = node.getAttribute("alt") || "";
          lines.push("[图片" + (alt ? "：" + alt : "") + "]");
          return;
        }
        if (/^h[1-6]$/.test(tag)) {
          const text = getInlineText(node).trim();
          if (text) {
            lines.push("");
            // 用层级数量调整 emoji，让用户在小红书上仍能看出标题层级
            const depth = parseInt(tag[1], 10);
            const marker = depth <= 2 ? "✨ " : depth === 3 ? "🔹 " : "▫️ ";
            lines.push(marker + text);
            lines.push("");
          }
          return;
        }
        if (tag === "p") {
          pushBlock(getInlineText(node));
          lines.push("");
          return;
        }
        if (tag === "blockquote") {
          const text = getInlineText(node).replace(/\\s+/g, " ").trim();
          if (text) {
            lines.push("💭 " + text);
            lines.push("");
          }
          return;
        }
        if (tag === "ul" || tag === "ol") {
          const ordered = tag === "ol";
          let idx = parseInt(node.getAttribute("start") || "1", 10);
          if (!Number.isFinite(idx)) idx = 1;
          for (const child of node.childNodes) {
            if (child.nodeType !== Node.ELEMENT_NODE) continue;
            if (child.tagName.toLowerCase() !== "li") continue;
            const text = getInlineText(child).replace(/\\s+/g, " ").trim();
            if (!text) continue;
            const prefix = ordered ? (idx++) + ". " : "• ";
            lines.push(prefix + text);
          }
          lines.push("");
          return;
        }
        if (tag === "li") {
          // 兼容直接出现的 <li>（无父 ul/ol 容器）
          const text = getInlineText(node).replace(/\\s+/g, " ").trim();
          if (text) lines.push("• " + text);
          return;
        }
        if (tag === "pre" || tag === "code") {
          // formatter 内部把代码块用 <br/> 分行 + &nbsp; 保留缩进，
          // textContent 会丢掉这些；先把 <br> 还原成换行，剥标签后用纯函数解实体，
          // 避免任何 innerHTML 写入（Xiaohongshu 创作中心启用了 Trusted Types CSP）。
          const raw = (node.innerHTML || "")
            .replace(/<br\\s*\\/?>(\\n)?/gi, "\\n")
            .replace(/<[^>]+>/g, "");
          const text = decodeEntities(raw)
            .replace(/\\u00a0/g, " ")
            .replace(/\\n+$/, "");
          if (text.trim()) {
            if (tag === "pre") {
              lines.push("【代码】");
              lines.push(text);
              lines.push("———");
            } else {
              lines.push("\`" + text + "\`");
            }
          }
          return;
        }

        // 容器元素（div / section 等）：继续遍历子节点
        for (const child of node.childNodes) walk(child, ctx);
      };
      for (const child of doc.body.childNodes) walk(child, {});
      return lines.join("\\n").replace(/\\n{3,}/g, "\\n\\n").trim();
    } catch (e) {
      log("htmlToText failed", e && e.message || e);
      return src.replace(/<[^>]+>/g, "");
    }
  };
  let BODY;
  try { BODY = htmlToText(HTML); }
  catch (e) { return { ok: false, msg: "htmlToText threw: " + (e && e.message || e) }; }

  // ===== 受控 input/textarea 写值 =====
  const setNativeValue = (el, val) => {
    const proto = el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, val);
    else el.value = val;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  const writeInputLike = (el, val) => {
    try { el.focus(); el.select && el.select(); } catch (_) {}
    try {
      if (document.execCommand("insertText", false, val) && el.value === val) return el.value;
    } catch (_) {}
    setNativeValue(el, val);
    return el.value;
  };

  // ===== 标题 =====
  const findTitle = () => {
    const sels = [
      'input[placeholder*="填写标题"]',
      'input[placeholder*="标题"]',
      'textarea[placeholder*="填写标题"]',
      'textarea[placeholder*="标题"]',
      ".d-input input.d-text",
      ".title-input input",
    ];
    const scan = (doc) => {
      for (const s of sels) {
        const el = doc.querySelector(s);
        if (el) return { el, sel: s };
      }
      return null;
    };
    let hit = scan(document);
    if (hit) return hit;
    for (let i = 0; i < window.frames.length; i++) {
      try { hit = scan(window.frames[i].document); if (hit) return { ...hit, frame: i }; } catch (_) {}
    }
    return null;
  };

  let titled = false;
  let titleDiag = "未找到标题输入框";
  const titleDeadline = Date.now() + 20000;
  while (Date.now() < titleDeadline) {
    const hit = findTitle();
    if (hit) {
      writeInputLike(hit.el, TITLE);
      await sleep(300);
      if (hit.el.value !== TITLE) writeInputLike(hit.el, TITLE);
      titleDiag = "sel=" + hit.sel + " value=" + JSON.stringify(hit.el.value);
      if (hit.el.value === TITLE) { titled = true; break; }
    }
    await sleep(400);
  }

  // ===== 正文 =====
  const findBody = () => {
    const sels = [
      'textarea[placeholder*="填写正文"]',
      'textarea[placeholder*="正文"]',
      'textarea[placeholder*="描述"]',
      ".content-input textarea",
      ".ql-editor[contenteditable='true']",
      "div[contenteditable='true'][data-placeholder*='正文']",
      "div[contenteditable='true']",
    ];
    const scan = (doc) => {
      for (const s of sels) {
        const el = doc.querySelector(s);
        if (el) return { el, sel: s };
      }
      return null;
    };
    let hit = scan(document);
    if (hit) return hit;
    for (let i = 0; i < window.frames.length; i++) {
      try { hit = scan(window.frames[i].document); if (hit) return { ...hit, frame: i }; } catch (_) {}
    }
    return null;
  };

  let bodyOk = false;
  let bodyDiag = "未找到正文编辑器";
  const bodyDeadline = Date.now() + 20000;
  while (Date.now() < bodyDeadline) {
    const hit = findBody();
    if (hit) {
      try {
        hit.el.focus();
        if (hit.el.tagName === "TEXTAREA" || hit.el.tagName === "INPUT") {
          writeInputLike(hit.el, BODY);
          await sleep(300);
          if (hit.el.value !== BODY) writeInputLike(hit.el, BODY);
          bodyDiag = "sel=" + hit.sel + " len=" + (hit.el.value || "").length;
          if ((hit.el.value || "").length > 0) { bodyOk = true; break; }
        } else {
          // contenteditable：用 execCommand insertText 触发 React onInput
          const sel = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(hit.el);
          sel.removeAllRanges();
          sel.addRange(range);
          try { document.execCommand("delete", false); } catch (_) {}
          let inserted = false;
          try { inserted = document.execCommand("insertText", false, BODY); } catch (_) {}
          if (!inserted) {
            hit.el.textContent = BODY;
            hit.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: BODY }));
          }
          await sleep(300);
          const txt = (hit.el.textContent || "").trim();
          bodyDiag = "sel=" + hit.sel + " len=" + txt.length;
          if (txt.length > 0) { bodyOk = true; break; }
        }
      } catch (e) {
        bodyDiag += " err=" + String(e && e.message || e);
      }
    }
    await sleep(400);
  }

  return {
    ok: titled && bodyOk,
    msg: (titled ? "标题✓ " : "标题✗(" + titleDiag + ") ") +
         (bodyOk ? "正文✓" : "正文✗(" + bodyDiag + ")"),
  };
  } catch (e) {
    return { ok: false, msg: "注入脚本异常: " + (e && (e.stack || e.message) || String(e)) };
  }
})();`;
	}
}
