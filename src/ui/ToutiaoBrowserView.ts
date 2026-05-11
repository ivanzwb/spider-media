import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type SpiderMediaPlugin from "../main";

export const VIEW_TYPE_TOUTIAO_BROWSER = "spider-media-toutiao-browser";

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

const TOUTIAO_HOME = "https://mp.toutiao.com/";
const TOUTIAO_PUBLISH = "https://mp.toutiao.com/profile_v4/graphic/publish";
const TOUTIAO_PARTITION = "persist:spider-media-toutiao";

/**
 * 头条号 Obsidian 内嵌 webview 视图。
 * 与 WeChatBrowserView 同构：partition 持久会话免重复登录，
 * 注入路径统一走 ProseMirror paste event。
 */
export class ToutiaoBrowserView extends ItemView {
	private webview!: WebviewElement;
	private statusEl!: HTMLElement;
	private pending: InjectionPayload | null = null;
	private isReady = false;

  constructor(leaf: WorkspaceLeaf, _plugin: SpiderMediaPlugin) {
		super(leaf);
	}

	getViewType(): string {
		return VIEW_TYPE_TOUTIAO_BROWSER;
	}

	getDisplayText(): string {
		return "头条号";
	}

	getIcon(): string {
		return "newspaper";
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
		this.btn(toolbar, "首页", () => void this.webview.loadURL(TOUTIAO_HOME));
		this.btn(toolbar, "发布图文", () => void this.webview.loadURL(TOUTIAO_PUBLISH));
		this.btn(toolbar, "注入正文", () => void this.runInject(true), "mod-cta");
		this.btn(toolbar, "刷新", () => this.webview.reload());
		this.btn(toolbar, "DevTools", () => this.webview.openDevTools());
		this.statusEl = toolbar.createSpan({ cls: "smb-status", text: "加载中…" });

		this.webview = document.createElement("webview") as unknown as WebviewElement;
		this.webview.setAttribute("src", TOUTIAO_HOME);
		this.webview.setAttribute("partition", TOUTIAO_PARTITION);
		this.webview.setAttribute("allowpopups", "true");
		this.webview.style.flex = "1";
		this.webview.style.width = "100%";
		this.webview.style.minHeight = "0";
		root.appendChild(this.webview);

		this.webview.addEventListener("dom-ready", () => {
			this.isReady = true;
			this.setStatus("已就绪。请登录后点击「发布图文」。");
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
			await new Promise((r) => setTimeout(r, 100));
		}
	}

	private async runInject(navigateIfNeeded: boolean): Promise<void> {
		if (!this.pending) {
			this.setStatus("没有待注入内容，请先在编辑器视图点「同步到平台」");
			return;
		}
		await this.waitReady();
		const url = this.webview.getURL();
		if (!/profile_v4\/graphic\/publish/.test(url)) {
			if (!navigateIfNeeded) {
				this.setStatus("当前不在发布页面，请先点「发布图文」");
				return;
			}
			await this.webview.loadURL(TOUTIAO_PUBLISH);
			await new Promise((r) => setTimeout(r, 4000));
		}

		const { title, html } = this.pending;
		const code = this.buildInjectionCode(title, html);
		try {
			const result = (await this.webview.executeJavaScript(code, true)) as InjectionResult;
			if (result?.ok) {
				this.setStatus("✅ 已注入正文，请在头条号后台预览/发布");
				new Notice("内容已注入头条号编辑器");
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
	 * 头条号正文编辑器是 ProseMirror（contenteditable）。
	 * 注入策略：
	 *   - 标题：同 wechat 的 React/Vue 兼容写法（execCommand insertText）
	 *   - 正文：构造 ClipboardEvent paste，把 HTML 投到编辑器；ProseMirror
	 *     的 paste handler 会自行解析并维护 doc state，不会被 watcher 回滚。
	 */
	private buildInjectionCode(title: string, html: string): string {
		return `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const TITLE = ${JSON.stringify(title)};
  const HTML = ${JSON.stringify(html)};
  const log = (...a) => { try { console.log("[spider-media][toutiao]", ...a); } catch (_) {} };

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
      'textarea[placeholder*="标题"]',
      'input[placeholder*="标题"]',
      'textarea[placeholder*="请输入标题"]',
      'input[placeholder*="请输入标题"]',
      ".title-area textarea",
      ".title-area input",
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
      ".ProseMirror[contenteditable='true']",
      "[contenteditable='true'].editor-content",
      ".article-editor [contenteditable='true']",
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

        // 构造 paste 事件，ProseMirror/tiptap 会自行处理 HTML
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

        // 兜底：直接 innerHTML（ProseMirror 会拒绝外部 DOM 改写，但试一下）
        hit.el.innerHTML = HTML;
        hit.el.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertFromPaste" }));
        await sleep(300);
        const txt2 = (hit.el.textContent || "").trim();
        bodyDiag += " fallback_len=" + txt2.length;
        if (txt2.length > 0) { bodyOk = true; break; }
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
