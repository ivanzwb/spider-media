import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type SpiderMediaPlugin from "../main";

export const VIEW_TYPE_ZHIHU_BROWSER = "spider-media-zhihu-browser";

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

const ZHIHU_HOME = "https://www.zhihu.com/";
const ZHIHU_PUBLISH = "https://zhuanlan.zhihu.com/write";
const ZHIHU_PARTITION = "persist:spider-media-zhihu";

/**
 * 知乎 Obsidian 内嵌 webview 视图。
 * 与 WeChatBrowserView / ToutiaoBrowserView 同构：partition 持久会话免重复登录。
 *
 * 知乎专栏编辑器：
 *   - 标题：textarea[placeholder*="请输入标题"]
 *   - 正文：Draft.js 的 .public-DraftEditor-content[contenteditable="true"]
 *     （部分新版本切到 ProseMirror，selector 兜底覆盖）
 * 注入路径：构造 ClipboardEvent paste 事件 → 编辑器自身 paste handler 解析 HTML。
 */
export class ZhihuBrowserView extends ItemView {
	private webview!: WebviewElement;
	private statusEl!: HTMLElement;
	private pending: InjectionPayload | null = null;
	private isReady = false;

	constructor(leaf: WorkspaceLeaf, _plugin: SpiderMediaPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_ZHIHU_BROWSER;
	}

	getDisplayText(): string {
		return "知乎";
	}

	getIcon(): string {
		return "book-open";
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
		this.btn(toolbar, "首页", () => void this.webview.loadURL(ZHIHU_HOME));
		this.btn(toolbar, "写文章", () => void this.webview.loadURL(ZHIHU_PUBLISH));
		this.btn(toolbar, "注入正文", () => void this.runInject(true), "mod-cta");
		this.btn(toolbar, "刷新", () => this.webview.reload());
		this.btn(toolbar, "DevTools", () => this.webview.openDevTools());
		this.statusEl = toolbar.createSpan({ cls: "smb-status", text: "加载中…" });

		this.webview = activeDocument.createElement("webview") as unknown as WebviewElement;
		this.webview.setAttribute("src", ZHIHU_HOME);
		this.webview.setAttribute("partition", ZHIHU_PARTITION);
		this.webview.setAttribute("allowpopups", "true");
		root.appendChild(this.webview);

		this.webview.addEventListener("dom-ready", () => {
			this.isReady = true;
			this.setStatus("已就绪。请登录后点击「写文章」。");
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
		if (!/zhuanlan\.zhihu\.com\/write/.test(url)) {
			if (!navigateIfNeeded) {
				this.setStatus("当前不在写文章页面，请先点「写文章」");
				return;
			}
			await this.webview.loadURL(ZHIHU_PUBLISH);
			await new Promise((r) => window.setTimeout(r, 4000));
		}

		const { title, html } = this.pending;
		const code = this.buildInjectionCode(title, html);
		try {
			const result = (await this.webview.executeJavaScript(code, true)) as InjectionResult;
			if (result?.ok) {
				this.setStatus("✅ 已注入正文，请在知乎后台预览/发布");
				new Notice("内容已注入知乎编辑器");
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

	/**
	 * 知乎专栏编辑器：
	 *   - 标题：textarea，写入后触发 input/change（React controlled component）
	 *   - 正文：Draft.js 的 contenteditable，paste handler 自行解析 HTML 维护
	 *     EditorState；ProseMirror 兜底亦同。
	 */
	private buildInjectionCode(title: string, html: string): string {
		return `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TITLE = ${JSON.stringify(title)};
  const HTML = ${JSON.stringify(html)};
  const log = (...a) => { try { console.log("[spider-media][zhihu]", ...a); } catch (_) {} };

  // ===== 标题 =====
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
  const findTitleInput = () => {
    const sels = [
      'textarea[placeholder*="请输入标题"]',
      'textarea[placeholder*="标题"]',
      'input[placeholder*="请输入标题"]',
      'input[placeholder*="标题"]',
      ".WriteIndex-titleInput textarea",
      ".WriteIndex-titleInput input",
      ".PostEditor-titleInput textarea",
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
    const hit = findTitleInput();
    if (hit) {
      log("title found", hit.sel, "frame=", hit.frame ?? "main");
      writeInputLike(hit.el, TITLE);
      await sleep(300);
      if (hit.el.value !== TITLE) writeInputLike(hit.el, TITLE);
      titleDiag = "sel=" + hit.sel + " value=" + JSON.stringify(hit.el.value);
      if (hit.el.value === TITLE) { titled = true; break; }
    }
    await sleep(400);
  }

  // ===== 正文 =====
  const findEditor = () => {
    const sels = [
      ".public-DraftEditor-content[contenteditable='true']",
      ".public-DraftEditor-content",
      ".DraftEditor-editorContainer [contenteditable='true']",
      ".ProseMirror[contenteditable='true']",
      ".Editable[contenteditable='true']",
      ".PostEditor [contenteditable='true']",
      "[contenteditable='true']",
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
    const hit = findEditor();
    if (hit) {
      log("editor found", hit.sel);
      try {
        hit.el.focus();
        // 选中现有内容并删除（避免追加在占位符之后）
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(hit.el);
        sel.removeAllRanges();
        sel.addRange(range);
        try { document.execCommand("delete", false); } catch (_) {}

        // 构造 paste 事件，Draft.js / ProseMirror 都会通过 paste handler 解析 HTML
        const dt = new DataTransfer();
        dt.setData("text/html", HTML);
        dt.setData("text/plain", hit.el.textContent || "");
        const ev = new ClipboardEvent("paste", {
          clipboardData: dt,
          bubbles: true,
          cancelable: true,
        });
        const dispatched = hit.el.dispatchEvent(ev);
        log("paste dispatched", dispatched);

        await sleep(500);
        const txt = (hit.el.textContent || "").trim();
        bodyDiag = "sel=" + hit.sel + " len=" + txt.length;
        if (txt.length > 0) { bodyOk = true; break; }

        // 兜底：beforeinput insertFromPaste（部分 Draft.js 版本只听 beforeinput）
        try {
          const be = new InputEvent("beforeinput", {
            bubbles: true,
            cancelable: true,
            inputType: "insertFromPaste",
            data: HTML,
          });
          hit.el.dispatchEvent(be);
          await sleep(300);
          const txt2 = (hit.el.textContent || "").trim();
          bodyDiag += " bi_len=" + txt2.length;
          if (txt2.length > 0) { bodyOk = true; break; }
        } catch (_) {}

        // 最终兜底：直接 innerHTML 改写（Draft.js 通常会拒绝，但 ProseMirror 兜底有效）
        hit.el.innerHTML = HTML;
        hit.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
        await sleep(300);
        const txt3 = (hit.el.textContent || "").trim();
        bodyDiag += " fb_len=" + txt3.length;
        if (txt3.length > 0) { bodyOk = true; break; }
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
})();`;
	}
}
