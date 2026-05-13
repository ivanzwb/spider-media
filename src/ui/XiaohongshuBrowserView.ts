import { ItemView, Notice, WorkspaceLeaf } from "obsidian";

import type SpiderMediaPlugin from "../main";

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
		const code = this.buildInjectionCode(title, html);
		try {
			const result = (await this.webview.executeJavaScript(code, true)) as InjectionResult;
			if (result?.ok) {
				this.setStatus("✅ 已注入文字内容，请手动上传图片并发布");
				new Notice("内容已注入小红书编辑器（图片需手动上传）");
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
      const walk = (node, prefix) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent || "";
          if (t.trim()) lines.push(prefix + t.trim());
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName.toLowerCase();
        if (tag === "br") { lines.push(""); return; }
        if (tag === "hr") { lines.push("———"); return; }
        if (tag === "img") {
          const alt = node.getAttribute("alt") || "";
          lines.push(prefix + "[图片" + (alt ? "：" + alt : "") + "]");
          return;
        }
        if (/^h[1-6]$/.test(tag)) {
          lines.push("");
          lines.push("✨ " + (node.textContent || "").trim());
          return;
        }
        if (tag === "li") {
          const t = (node.textContent || "").trim();
          if (t) lines.push(prefix + "• " + t);
          return;
        }
        if (tag === "blockquote") {
          const t = (node.textContent || "").trim();
          if (t) lines.push(prefix + "💭 " + t);
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
              lines.push("\u3010\u4ee3\u7801\u3011");
              lines.push(text);
              lines.push("\u2500\u2500\u2500");
            } else {
              lines.push(prefix + "\`" + text + "\`");
            }
          }
          return;
        }
        for (const child of node.childNodes) walk(child, prefix);
        if (tag === "p") lines.push("");
      };
      for (const child of doc.body.childNodes) walk(child, "");
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
