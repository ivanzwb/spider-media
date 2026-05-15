import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type SpiderMediaPlugin from "../main";

// Node / Electron 接口（无 @types/node，故用 require 取并窄类型化）
interface ElectronClipboardLike {
	writeImage(image: ElectronNativeImageLike): void;
}
interface ElectronNativeImageLike {
	__brand: "NativeImage";
}
interface ElectronNativeImageStaticLike {
	createFromDataURL(dataUrl: string): ElectronNativeImageLike;
}
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
const electronMod = nodeRequire?.("electron") as
	| { clipboard: ElectronClipboardLike; nativeImage: ElectronNativeImageStaticLike }
	| undefined;
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

		// 先尝试自动上传代码图（写剪贴板 → 在 webview 触发 paste）
		let autoUploaded = 0;
		if (dataUrls.length > 0 && electronMod) {
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
	 * 自动逐张粘贴：
	 *   1. 把图片写入系统剪贴板（Electron nativeImage）
	 *   2. 在 webview 内 focus 上传区 + execCommand('paste')，userGesture=true 授权
	 *   3. 等待页面上传完成后再处理下一张
	 *
	 * 返回实际成功触发粘贴的图片数量。
	 */
	private async autoPasteImages(dataUrls: string[]): Promise<number> {
		if (!electronMod) return 0;
		// 先尝试切到"上传图文"tab + focus 上传区一次
		try {
			await this.webview.executeJavaScript(
				`(() => {
  const click = (text) => {
    const all = document.querySelectorAll('button, span, div, a, [role="tab"]');
    for (const el of all) {
      const t = (el.textContent || '').trim();
      if (t === text || t === text + ' ') { try { el.click(); return true; } catch (_) {} }
    }
    return false;
  };
  click('上传图文') || click('图文') || click('发布图文');
})();`,
				true,
			);
			await new Promise((r) => window.setTimeout(r, 800));
		} catch {
			// 忽略
		}

		let success = 0;
		for (let i = 0; i < dataUrls.length; i++) {
			try {
				const img = electronMod.nativeImage.createFromDataURL(dataUrls[i]);
				electronMod.clipboard.writeImage(img);
			} catch (err) {
				console.warn("[spider-media] 写剪贴板失败", err);
				continue;
			}
			// 在 webview 内 focus 上传区并触发 paste。userGesture=true 让 execCommand('paste') 被授权。
			try {
				const pasteResult = (await this.webview.executeJavaScript(
					`(() => {
  const findUpload = () => {
    const sels = ['[class*="upload"]', '[class*="drag"]', '[class*="drop"]', '.upload-container', '.upload-wrapper'];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return document.body;
  };
  const target = findUpload();
  try { target.focus && target.focus(); } catch (_) {}
  try { target.click && target.click(); } catch (_) {}
  let ok = false;
  try { ok = document.execCommand('paste'); } catch (_) {}
  // 兜底：直接派发 paste 事件（部分页面有 document 级 paste 监听）
  if (!ok) {
    try {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      target.dispatchEvent(ev);
      ok = true;
    } catch (_) {}
  }
  return { ok, tag: target.tagName, cls: (target.className || '').toString().slice(0, 80) };
})();`,
					true,
				)) as { ok: boolean; tag: string; cls: string };
				if (pasteResult?.ok) success++;
				this.setStatus(`粘贴代码图 ${i + 1}/${dataUrls.length}…`);
			} catch (err) {
				console.warn("[spider-media] 执行 paste 失败", err);
			}
			// 等待上传完成（小红书图片上传 ~1.5-2.5s）
			await new Promise((r) => window.setTimeout(r, 2000));
		}
		return success;
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

  // ===== 代码块图片上传 =====
  // formatter 把 <pre> 转成了 <img data-codeblock-img="1" src="data:image/png;base64,...">
  // 这里把这些 dataURL 转成 File，喂给小红书的文件 input，触发上传流程。
  let codeImgDiag = "";
  let codeImgOk = true;
  try {
    const doc = new DOMParser().parseFromString(HTML, "text/html");
    const imgs = Array.from(doc.querySelectorAll('img[data-codeblock-img="1"]'));
    if (imgs.length > 0) {
      log("发现代码图片", imgs.length, "张，开始转 File");
      const files = [];
      for (let i = 0; i < imgs.length; i++) {
        const src = imgs[i].getAttribute("src") || "";
        const m = /^data:image\\/(png|jpeg);base64,(.+)$/.exec(src);
        if (!m) { log("跳过非 dataURL", src.slice(0, 40)); continue; }
        const mime = "image/" + m[1];
        const bin = atob(m[2]);
        const buf = new Uint8Array(bin.length);
        for (let j = 0; j < bin.length; j++) buf[j] = bin.charCodeAt(j);
        const blob = new Blob([buf], { type: mime });
        files.push(new File([blob], "code-block-" + (i + 1) + "." + m[1], { type: mime }));
      }
      log("生成 File 数量", files.length);

      // 0. 先尝试切换到「图文」tab（如果当前在视频/直播 tab）
      const tryClickTab = () => {
        const sel = [
          '.creator-tab',
          '[class*="tab"]',
          'button', 'span', 'div'
        ];
        const candidates = document.querySelectorAll(sel.join(','));
        for (const el of candidates) {
          const t = (el.textContent || '').trim();
          if (t === '上传图文' || t === '图文' || t === '发布图文') {
            try { el.click(); log("点击 tab", t); return true; } catch (_) {}
          }
        }
        return false;
      };
      tryClickTab();
      await sleep(500);

      // 1. 找文件上传 input（图片）。
      const findFileInputs = () => {
        const results = [];
        const sels = [
          'input[type="file"][accept*="image"]',
          'input[type="file"][multiple]',
          'input[type="file"]',
        ];
        const scan = (d) => {
          for (const s of sels) {
            const els = d.querySelectorAll(s);
            for (const el of els) results.push(el);
          }
        };
        scan(document);
        for (let i = 0; i < window.frames.length; i++) {
          try { scan(window.frames[i].document); } catch (_) {}
        }
        return results;
      };

      // 等文件 input 出现（可能需要先打开上传区）
      let fileInputs = [];
      const inputDeadline = Date.now() + 15000;
      while (Date.now() < inputDeadline) {
        fileInputs = findFileInputs();
        if (fileInputs.length > 0) break;
        await sleep(400);
      }
      log("找到 file input 数量", fileInputs.length);

      if (fileInputs.length === 0) {
        codeImgOk = false;
        codeImgDiag = "未找到文件上传 input，请手动上传 " + files.length + " 张代码图";
      } else {
        let uploaded = false;
        let lastErr = "";
        for (const fileInput of fileInputs) {
          try {
            const dt = new DataTransfer();
            for (const f of files) dt.items.add(f);
            // 策略 A: 设置 input.files + change/input
            try {
              fileInput.files = dt.files;
              fileInput.dispatchEvent(new Event("input", { bubbles: true }));
              fileInput.dispatchEvent(new Event("change", { bubbles: true }));
              log("策略 A: 已写入 input.files", fileInput.outerHTML.slice(0, 120));
            } catch (e1) {
              lastErr = "A:" + (e1 && e1.message || e1);
            }
            // 策略 B: 在最近的上传容器上模拟 drop
            try {
              const dropZone =
                fileInput.closest('[class*="upload"],[class*="drop"],[class*="drag"]') ||
                fileInput.parentElement ||
                fileInput;
              const dt2 = new DataTransfer();
              for (const f of files) dt2.items.add(f);
              const dragOver = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt2 });
              const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt2 });
              dropZone.dispatchEvent(dragOver);
              dropZone.dispatchEvent(drop);
              log("策略 B: drop 已派发到", dropZone.tagName, (dropZone.className || ""));
            } catch (e2) {
              lastErr = "B:" + (e2 && e2.message || e2);
            }
            uploaded = true;
            break;
          } catch (e) {
            lastErr = (e && e.message || e);
          }
        }
        if (uploaded) {
          codeImgDiag = "已尝试上传 " + files.length + " 张代码图（请确认编辑器中已出现图片）";
        } else {
          codeImgOk = false;
          codeImgDiag = "上传失败: " + lastErr + "，请手动上传 " + files.length + " 张代码图";
        }
      }
    }
  } catch (e) {
    codeImgOk = false;
    codeImgDiag = "代码图处理异常: " + (e && e.message || e);
  }
  log("codeImgOk", codeImgOk, "diag", codeImgDiag);

  return {
    ok: titled && bodyOk,
    msg: (titled ? "标题✓ " : "标题✗(" + titleDiag + ") ") +
         (bodyOk ? "正文✓" : "正文✗(" + bodyDiag + ")") +
         (codeImgDiag ? " | 代码图: " + codeImgDiag : ""),
  };

  return {
    ok: titled && bodyOk,
    msg: (titled ? "标题✓ " : "标题✗(" + titleDiag + ") ") +
         (bodyOk ? "正文✓" : "正文✗(" + bodyDiag + ")") +
         (codeImgDiag ? " | 代码图: " + codeImgDiag : ""),
  };
  } catch (e) {
    return { ok: false, msg: "注入脚本异常: " + (e && (e.stack || e.message) || String(e)) };
  }
})();`;
	}
}
