import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type SpiderMediaPlugin from "../main";

// Node / Electron 接口（无 @types/node，故用 require 取并窄类型化）
interface FsPromisesLike {
	mkdir(p: string, opts: { recursive: boolean }): Promise<void>;
	writeFile(p: string, data: Uint8Array): Promise<void>;
}
interface NodeBufferStatic {
	from(input: string, encoding: string): Uint8Array;
}
interface ElectronNativeImageLike { __brand: "NativeImage" }
interface ElectronModule {
	clipboard: { writeImage(img: ElectronNativeImageLike): void };
	nativeImage: { createFromDataURL(dataUrl: string): ElectronNativeImageLike };
}
const nodeRequire =
	typeof window !== "undefined" && typeof (window as unknown as { require?: unknown }).require === "function"
		? ((window as unknown as { require: (m: string) => unknown }).require)
		: null;
const fsPromises = (nodeRequire?.("fs") as { promises?: FsPromisesLike } | undefined)?.promises;
const osMod = nodeRequire?.("os") as { tmpdir(): string } | undefined;
const pathMod = nodeRequire?.("path") as { join(...parts: string[]): string } | undefined;
const BufferCtor = (window as unknown as { Buffer?: NodeBufferStatic }).Buffer;
const electronMod = nodeRequire?.("electron") as ElectronModule | undefined;

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
	focus(): void;
	sendInputEvent(event: Record<string, unknown>): void;
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
// 注：小红书强制重定向 target=image → target=article。我们接受落在长文编辑器，
// 然后用系统级 Ctrl+V 把代码块图片粘贴进 ProseMirror 编辑器（iframe 内）。
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
		const onPublish = /creator\.xiaohongshu\.com\/publish/.test(url);
		if (!onPublish) {
			if (!navigateIfNeeded) {
				this.setStatus("当前不在发布页面，请先点「发布笔记」");
				return;
			}
			await this.webview.loadURL(XIAOHONGSHU_PUBLISH);
			await new Promise((r) => window.setTimeout(r, 4500));
		}
		const { title, html } = this.pending;

		// 抽取代码块图片：保存到磁盘 + 自动上传。
		const dataUrls = this.extractCodeImageDataUrls(html);
		await this.dumpCodeBlockImagesToDisk(dataUrls);

		// 小红书的发布 UI（无论图文还是长文）都渲染在跨源 iframe 内，DOM 级 file input / drop
		// 都无法直达。统一用系统级 Ctrl+V：把图片写入剪贴板，再用 sendInputEvent 发键盘事件，
		// 这是唯一能穿透跨源 iframe 的方式（被编辑器的 paste 监听器接住）。
		let autoUploaded = 0;
		if (dataUrls.length > 0) {
			this.setStatus(`正在自动粘贴 ${dataUrls.length} 张代码图（系统级 Ctrl+V）…`);
			autoUploaded = await this.pasteImagesViaKeyboard(dataUrls);
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
	 * 长文编辑器专用：用系统级 Ctrl+V 把图片粘贴进 iframe 内的 ProseMirror。
	 *   1. 用 sendInputEvent 在 iframe 中心位置模拟鼠标点击，让编辑器获取焦点
	 *   2. 每张图：Electron clipboard.writeImage 写系统剪贴板
	 *   3. sendInputEvent 发 Ctrl+V（系统级事件穿透 iframe 跨域限制）
	 *   4. 等待 XHS 上传完成
	 *
	 * 返回成功粘贴的图片数量。
	 */
	private async pasteImagesViaKeyboard(dataUrls: string[]): Promise<number> {
		if (dataUrls.length === 0) return 0;
		if (!electronMod) {
			this.setStatus("Electron 模块不可用，无法自动粘贴；请手动 Ctrl+V");
			return 0;
		}

		// 1. 找 iframe 中心点，让编辑器获取焦点
		let clickX = 400;
		let clickY = 500;
		try {
			const coords = (await this.webview.executeJavaScript(
				`(() => {
  const ifr = document.querySelector('iframe');
  if (!ifr) return null;
  const r = ifr.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height * 0.55) };
})();`,
				false,
			)) as { x: number; y: number } | null;
			if (coords) {
				clickX = coords.x;
				clickY = coords.y;
			}
		} catch (err) {
			console.warn("[spider-media] 获取 iframe 坐标失败", err);
		}

		this.webview.focus();
		try {
			this.webview.sendInputEvent({ type: "mouseDown", x: clickX, y: clickY, button: "left", clickCount: 1 });
			this.webview.sendInputEvent({ type: "mouseUp", x: clickX, y: clickY, button: "left", clickCount: 1 });
		} catch (err) {
			console.warn("[spider-media] 模拟点击失败", err);
		}
		await new Promise((r) => window.setTimeout(r, 600));

		let uploaded = 0;
		for (let i = 0; i < dataUrls.length; i++) {
			try {
				const img = electronMod.nativeImage.createFromDataURL(dataUrls[i]);
				electronMod.clipboard.writeImage(img);
			} catch (err) {
				console.warn("[spider-media] 写剪贴板失败", err);
				continue;
			}
			try {
				this.webview.focus();
				// 模拟 Ctrl+V：keyDown + char + keyUp，三段都带 control modifier
				this.webview.sendInputEvent({ type: "keyDown", keyCode: "V", modifiers: ["control"] });
				this.webview.sendInputEvent({ type: "char", keyCode: "V", modifiers: ["control"] });
				this.webview.sendInputEvent({ type: "keyUp", keyCode: "V", modifiers: ["control"] });
				uploaded++;
				this.setStatus(`粘贴代码图 ${i + 1}/${dataUrls.length}…`);
			} catch (err) {
				console.warn("[spider-media] sendInputEvent 失败", err);
			}
			// 等待 XHS 上传 + Vue/ProseMirror 渲染
			await new Promise((r) => window.setTimeout(r, 2500));
		}
		return uploaded;
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
