import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import type SpiderMediaPlugin from "@/main";

export const VIEW_TYPE_WECHAT_BROWSER = "spider-media-wechat-browser";

/**
 * Electron <webview> 接口（仅声明用到的部分）。
 * Obsidian 基于 Electron，启用了 webviewTag。会话通过 partition="persist:..."
 * 持久化，扫码登录一次即可长期免登。
 */
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

const WECHAT_HOME = "https://mp.weixin.qq.com/";
const WECHAT_PARTITION = "persist:spider-media-wechat";

export class WeChatBrowserView extends ItemView {
	private webview!: WebviewElement;
	private statusEl!: HTMLElement;
	private pending: InjectionPayload | null = null;
	private isReady = false;

	constructor(leaf: WorkspaceLeaf, private plugin: SpiderMediaPlugin) {
		super(leaf);
		void plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_WECHAT_BROWSER;
	}

	getDisplayText(): string {
		return "微信公众号";
	}

	getIcon(): string {
		return "globe";
	}

	/** 由发布视图调用，把待注入内容暂存，自动跳转/注入 */
	async submitPayload(payload: InjectionPayload): Promise<void> {
		this.pending = payload;
		this.setStatus("准备发布…");
		await this.runInject(/*navigateIfNeeded*/ true);
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass("spider-media-browser-view");

		const toolbar = root.createDiv({ cls: "smb-toolbar" });
		this.btn(toolbar, "首页", () => void this.webview.loadURL(WECHAT_HOME));
		this.btn(toolbar, "新建图文", () => void this.gotoNewAppMsg());
		this.btn(toolbar, "注入正文", () => void this.runInject(true), "mod-cta");
		this.btn(toolbar, "刷新", () => this.webview.reload());
		this.btn(toolbar, "DevTools", () => this.webview.openDevTools());
		this.statusEl = toolbar.createSpan({ cls: "smb-status", text: "加载中…" });

		this.webview = document.createElement("webview") as unknown as WebviewElement;
		this.webview.setAttribute("src", WECHAT_HOME);
		this.webview.setAttribute("partition", WECHAT_PARTITION);
		this.webview.setAttribute("allowpopups", "true");
		this.webview.style.flex = "1";
		this.webview.style.width = "100%";
		this.webview.style.minHeight = "0";
		root.appendChild(this.webview);

		this.webview.addEventListener("dom-ready", () => {
			this.isReady = true;
			this.setStatus("已就绪。请扫码登录后点击「新建图文」。");
		});
		this.webview.addEventListener("did-navigate", (e: Event) => {
			const url = (e as unknown as { url: string }).url;
			this.setStatus(`已跳转：${url}`);
		});
	}

	async onClose(): Promise<void> {
		// webview 随 DOM 释放，无需手动清理
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

	private async getToken(): Promise<string | null> {
		await this.waitReady();
		const url = this.webview.getURL();
		const m = url.match(/[?&]token=(\d+)/);
		return m ? m[1] : null;
	}

	private async gotoNewAppMsg(): Promise<void> {
		const token = await this.getToken();
		if (!token) {
			this.setStatus("未检测到 token，请先扫码登录公众号后台");
			new Notice("请先在 webview 中扫码登录");
			return;
		}
		const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${token}`;
		await this.webview.loadURL(url);
		this.setStatus("已进入新建图文页面，等待编辑器就绪…");
	}

	private async runInject(navigateIfNeeded: boolean): Promise<void> {
		if (!this.pending) {
			this.setStatus("没有待注入内容，请先在编辑器视图点「同步到平台」");
			return;
		}
		await this.waitReady();
		const url = this.webview.getURL();
		if (!/appmsg.*action=edit/.test(url)) {
			if (!navigateIfNeeded) {
				this.setStatus("当前不在新建图文页，请先点「新建图文」");
				return;
			}
			await this.gotoNewAppMsg();
			// 等编辑器 iframe 加载
			await new Promise((r) => setTimeout(r, 3500));
		}

		const { title, html } = this.pending;
		const code = this.buildInjectionCode(title, html);
		try {
			const result = (await this.webview.executeJavaScript(code, true)) as InjectionResult;
			if (result?.ok) {
				this.setStatus("✅ 已注入正文，请在公众号后台预览/发布");
				new Notice("内容已注入公众号编辑器");
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
	 * 构造在 webview 主世界执行的注入脚本。
	 * 关键点：
	 *   - 微信编辑器在 iframe 内（同源），可递归 window.frames 找到 __MP_Editor_JSAPI__
	 *   - 用 mp_editor_get_isready 轮询 → mp_editor_set_content
	 *   - 标题输入框尝试多种选择器
	 */
	private buildInjectionCode(title: string, html: string): string {
		return `(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const findInvoke = () => {
    const find = (w) => {
      try {
        if (w && w.__MP_Editor_JSAPI__ && typeof w.__MP_Editor_JSAPI__.invoke === "function") {
          return w.__MP_Editor_JSAPI__.invoke;
        }
      } catch (_) {}
      try {
        for (let i = 0; i < w.frames.length; i++) {
          const r = find(w.frames[i]);
          if (r) return r;
        }
      } catch (_) {}
      return null;
    };
    return find(window);
  };
  let invoke = null;
  for (let i = 0; i < 60; i++) {
    invoke = findInvoke();
    if (invoke) break;
    await sleep(500);
  }
  if (!invoke) return { ok: false, msg: "未找到 __MP_Editor_JSAPI__（编辑器未加载？）" };

  const call = (apiName, apiParam) => new Promise((resolve, reject) => {
    invoke({ apiName, apiParam: apiParam || {}, sucCb: resolve, errCb: reject });
  });

  try {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const r = await call("mp_editor_get_isready").catch(() => null);
      if (r && r.isReady && r.isNew) break;
      await sleep(500);
    }
    await call("mp_editor_set_content", { content: ${JSON.stringify(html)} });

    // 标题注入：公众号没有公开的 set_title JsApi，必须走 DOM。
    // 标题输入框可能延迟渲染或位于异步 iframe，使用轮询 + 重试。
    // 同时兼容 input / textarea / contenteditable 三种实现。
    const TITLE = ${JSON.stringify(title)};
    const log = (...args) => { try { console.log("[spider-media][title]", ...args); } catch (_) {} };
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
    const writeTitle = (el, val) => {
      try { el.focus(); } catch (_) {}
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
        // 优先用 execCommand 模拟真实输入：Vue v-model 会通过 input 事件读取，
        // 而 native value setter 设置的值常被 Vue watcher 异步覆盖回 data。
        try {
          el.select();
          const ok = document.execCommand("insertText", false, val);
          if (ok && el.value === val) return el.value;
        } catch (_) {}
        setNativeValue(el, val);
        return el.value;
      }
      // contenteditable（含 ProseMirror）
      try {
        el.focus();
        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        // 先删空内容（含 ProseMirror-trailingBreak），再插入文本
        document.execCommand("delete", false);
        if (!document.execCommand("insertText", false, val)) {
          el.textContent = val;
          el.dispatchEvent(new InputEvent("input", { bubbles: true, data: val, inputType: "insertText" }));
        }
      } catch (_) {}
      return (el.textContent || "").trim();
    };
    const readTitle = (el) => {
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
      return (el.textContent || "").trim();
    };
    const findTitleInput = () => {
      // 公众号标题实际由 ProseMirror contenteditable 渲染，textarea#title 仅作 form mirror（隐藏）。
      // 必须优先选 ProseMirror 节点，否则写到隐藏 textarea 不会反映到 UI。
      const sels = [
        ".title-editor__input .ProseMirror[contenteditable='true']",
        ".title-editor-overlay .ProseMirror[contenteditable='true']",
        "[data-placeholder='请在这里输入标题'][contenteditable='true']",
        ".ProseMirror[contenteditable='true'][data-placeholder*='标题']",
        "#title",
        "textarea#title",
        'input[placeholder*="请在这里输入标题"]',
        'textarea[placeholder*="请在这里输入标题"]',
        'input[placeholder*="标题"]',
        'textarea[placeholder*="标题"]',
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
        try {
          hit = scan(window.frames[i].document);
          if (hit) return { ...hit, frame: i };
        } catch (_) {}
      }
      return null;
    };
    let titled = false;
    let titleDiag = "未找到标题输入框";
    const titleDeadline = Date.now() + 20000;
    while (Date.now() < titleDeadline) {
      const hit = findTitleInput();
      if (hit) {
        log("found", hit.sel, "frame=", hit.frame ?? "main", "tag=", hit.el.tagName);
        writeTitle(hit.el, TITLE);
        await sleep(300);
        let after = readTitle(hit.el);
        // 至多重试 3 次抵抗 Vue watcher 回滚
        for (let k = 0; k < 3 && after !== TITLE; k++) {
          log("clobbered, retry", k, "value=", after);
          writeTitle(hit.el, TITLE);
          await sleep(300);
          after = readTitle(hit.el);
        }
        // 不 dispatch blur —— blur 可能触发框架校验并清值
        titleDiag = "sel=" + hit.sel + " tag=" + hit.el.tagName + " value=" + JSON.stringify(after);
        log("final", titleDiag);
        if (after === TITLE) { titled = true; break; }
      }
      await sleep(400);
    }
    // -- 作者默认填公众号名称 --
    // 公众号名称从页面顶部账号信息读取，找不到则跳过。
    const readAccountName = () => {
      const sels = [
        ".weui-desktop-account__nickname",
        ".weui-desktop-account__info strong",
        ".account_setting_nickname",
      ];
      for (const s of sels) {
        const el = document.querySelector(s);
        const text = el && (el.textContent || "").trim();
        if (text) return text;
      }
      return "";
    };
    const findAuthorInput = (doc) => {
      const sels = [
        "#author",
        'input[placeholder*="作者"]',
        'input[placeholder*="请输入作者"]',
      ];
      for (const s of sels) {
        const el = doc.querySelector(s);
        if (el) return el;
      }
      return null;
    };
    const accountName = readAccountName();
    if (accountName) {
      const setReactValue2 = (el, val) => {
        const proto = el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
        const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
        if (setter) setter.call(el, val);
        else el.value = val;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
      };
      let authorEl = findAuthorInput(document);
      if (!authorEl) {
        for (let i = 0; i < window.frames.length; i++) {
          try {
            authorEl = findAuthorInput(window.frames[i].document);
            if (authorEl) break;
          } catch (_) {}
        }
      }
      if (authorEl && !authorEl.value) {
        authorEl.focus();
        setReactValue2(authorEl, accountName);
      }
    }

    return { ok: true, msg: titled ? "正文+标题+作者已注入" : ("正文+作者已注入（标题未填：" + titleDiag + "）") };
  } catch (e) {
    return { ok: false, msg: String(e && e.message || e) };
  }
})();`;
	}
}
