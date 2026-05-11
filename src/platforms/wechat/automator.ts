import { BrowserAutomator } from "@/automator/BrowserAutomator";
import { clipboardFallback } from "@/automator/clipboardFallback";
import type { Credentials, PublishResult } from "@/platforms/base";
import type { Frame, Page } from "puppeteer-core";

export interface WeChatAutomatorOptions {
	/** 已开远程调试 (--remote-debugging-port=9222) 的 Chrome */
	browserURL?: string;
	/** 本地 Chrome 可执行文件路径 (后备) */
	executablePath?: string;
	/** puppeteer-core 模块绝对路径（未配置时强制走剪贴板兜底）*/
	puppeteerModulePath?: string;
	timeoutMs?: number;
}

export type WeChatAutomatorOptionsProvider = () => WeChatAutomatorOptions;

const WECHAT_HOME = "https://mp.weixin.qq.com/";
const WECHAT_NEW_APPMSG =
	"https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=";
const SELECTOR_LOGIN_DONE = ".weui-desktop-account__info";

// 编辑器候选选择器（公众号后台多次改版，做容错）
const SELECTOR_TITLE_CANDIDATES = [
	"#title",
	"textarea#title",
	"input[placeholder='请在这里输入标题']",
	"textarea[placeholder*='标题']",
];

/**
 * 微信公众号发布流程。
 *
 *  1. 启动 / 连接浏览器，打开公众号后台首页
 *  2. 等待登录（扫码或已登录）
 *  3. 轮询等待用户进入「新建图文」页面（URL 含 appmsg + ueditor iframe）
 *  4. 注入标题 + 正文 HTML
 *  5. 浏览器保持打开，用户审查 → 手动发布
 *
 * 任何步骤失败都会走 clipboardFallback。
 */
export class WeChatAutomator {
	constructor(private getOptions: WeChatAutomatorOptionsProvider) {}

	async publish(
		html: string,
		title: string,
		_credentials: Credentials,
	): Promise<PublishResult> {
		const options = this.getOptions();
		const automator = new BrowserAutomator();
		try {
			const page = await automator.launch({
				browserURL: options.browserURL,
				executablePath: options.executablePath,
				puppeteerModulePath: options.puppeteerModulePath,
				headless: false,
				timeoutMs: options.timeoutMs ?? 30_000,
			});

			// 已在公众号域名下就不动；否则跳到首页
			if (!page.url().includes("mp.weixin.qq.com")) {
				await page.goto(WECHAT_HOME, { waitUntil: "networkidle2" });
			}

			// 等登录态（扫码 3 分钟内有效）
			await page.waitForSelector(SELECTOR_LOGIN_DONE, { timeout: 180_000 });

			// 登录后从当前 URL 抓 token，直接跳转新建图文页面
			const token = this.extractToken(page.url());
			const editorUrl = token ? `${WECHAT_NEW_APPMSG}${token}` : WECHAT_NEW_APPMSG;
			await page.goto(editorUrl, { waitUntil: "networkidle2" });

			// 等待编辑器 iframe 就绪
			const editorTarget = await this.waitForEditor(page, 60_000);

			await this.fillTitle(page, title);
			await this.injectContent(page, editorTarget, html);

			return {
				success: true,
				stage: "fill",
				message: "已自动填充标题和正文。请在公众号后台审查后手动点击发布。",
				url: page.url(),
			};
		} catch (err) {
			const reason = err instanceof Error ? err.message : String(err);
			return clipboardFallback(html, title, `公众号自动化失败：${reason}`);
		}
	}

	/** 轮询直到找到编辑器（iframe 内的 ueditor body，或主页面的 contenteditable）。 */
	private async waitForEditor(
		page: Page,
		timeoutMs: number,
	): Promise<{ frame: Frame; selector: string }> {
		const deadline = Date.now() + timeoutMs;
		let lastDump = "";
		while (Date.now() < deadline) {
			const found = await this.findEditor(page);
			if (found) return found;
			lastDump = await this.dumpFrames(page);
			await new Promise((r) => setTimeout(r, 800));
		}
		throw new Error(
			`等待编辑器加载超时。页面 frame 列表：\n${lastDump}\n（请把以上信息发给开发者帮助适配最新版公众号后台）`,
		);
	}

	/** 从公众号后台 URL 中抽取 token 参数 (登录后才会带) */
	private extractToken(url: string): string | null {
		const m = url.match(/[?&]token=(\d+)/);
		return m ? m[1] : null;
	}

	/**
	 * 在所有 frame 里寻找编辑器：
	 *  - 优先 ueditor iframe 内的 body
	 *  - 然后任何 frame 内的 [contenteditable=true] / .ProseMirror / #js_editor 容器
	 */
	private async findEditor(
		page: Page,
	): Promise<{ frame: Frame; selector: string } | null> {
		const frames = page.frames();
		const selectorCandidates = [
			"body[contenteditable='true']",
			"#ueditor_0",
			".ProseMirror",
			"#js_editor_insertcontent",
			"#js_editor",
			".rich_media_content",
			"div[contenteditable='true']",
		];
		for (const frame of frames) {
			for (const sel of selectorCandidates) {
				const handle = await frame.$(sel).catch(() => null);
				if (handle) {
					await handle.dispose().catch(() => undefined);
					return { frame, selector: sel };
				}
			}
		}
		return null;
	}

	/** 把所有 frame 的 name / url / 内含可编辑元素信息序列化，便于诊断 */
	private async dumpFrames(page: Page): Promise<string> {
		const lines: string[] = [];
		for (const f of page.frames()) {
			const url = f.url();
			const editableCount = await f
				.evaluate(
					() => document.querySelectorAll("[contenteditable='true']").length,
				)
				.catch(() => -1);
			const iframeCount = await f
				.evaluate(() => document.querySelectorAll("iframe").length)
				.catch(() => -1);
			lines.push(
				`  - url=${url || "(empty)"} editable=${editableCount} iframes=${iframeCount}`,
			);
		}
		return lines.join("\n");
	}

	private async fillTitle(page: Page, title: string): Promise<void> {
		let titleEl = null;
		for (const sel of SELECTOR_TITLE_CANDIDATES) {
			titleEl = await page.$(sel).catch(() => null);
			if (titleEl) break;
		}
		if (!titleEl) {
			console.warn("[spider-media] 未找到标题输入框，跳过标题注入");
			return;
		}
		await titleEl.click({ clickCount: 3 }).catch(() => undefined);
		await page.keyboard.press("Backspace").catch(() => undefined);
		await titleEl.type(title, { delay: 10 });
	}

	private async injectContent(
		page: Page,
		target: { frame: Frame; selector: string },
		html: string,
	): Promise<void> {
		// 优先用公众号官方 JS API（ProseMirror 时代）。若主页面提供则用主页面，
		// 否则在编辑器所在 frame 里调用。
		const candidateFrames: Frame[] = [page.mainFrame()];
		if (!candidateFrames.includes(target.frame)) candidateFrames.push(target.frame);

		for (const frame of candidateFrames) {
			const ok = await this.tryMpEditorJsApi(frame, html);
			if (ok) return;
		}

		// 回退：直接写 DOM（旧版 UEditor / 极端情况）
		const { frame, selector } = target;
		await frame.waitForSelector(selector, { timeout: 10_000 });
		await frame.evaluate(
			(sel: string, content: string) => {
				const el = document.querySelector(sel) as HTMLElement | null;
				if (!el) return;
				el.innerHTML = content;
				el.dispatchEvent(new Event("input", { bubbles: true }));
				el.dispatchEvent(new Event("change", { bubbles: true }));
			},
			selector,
			html,
		);
	}

	/**
	 * 调用公众平台官方编辑器 JS API：
	 *   mp_editor_get_isready → 等就绪 → mp_editor_set_content
	 * 文档：https://developers.weixin.qq.com/doc/offiaccount/MP_Editor_JsApi/mp_editor_jsapi.html
	 */
	private async tryMpEditorJsApi(frame: Frame, html: string): Promise<boolean> {
		try {
			return await frame.evaluate(async (content: string) => {
				type Invoke = (args: {
					apiName: string;
					apiParam?: Record<string, unknown>;
					sucCb?: (res: unknown) => void;
					errCb?: (err: unknown) => void;
				}) => void;
				const api = (window as unknown as {
					__MP_Editor_JSAPI__?: { invoke: Invoke };
				}).__MP_Editor_JSAPI__;
				if (!api?.invoke) return false;

				const invoke = (apiName: string, apiParam?: Record<string, unknown>) =>
					new Promise<unknown>((resolve, reject) => {
						api.invoke({
							apiName,
							apiParam,
							sucCb: resolve,
							errCb: reject,
						});
					});

				// 等待编辑器就绪 (最多 30s)
				const deadline = Date.now() + 30_000;
				while (Date.now() < deadline) {
					try {
						const res = (await invoke("mp_editor_get_isready")) as {
							isReady?: boolean;
							isNew?: boolean;
						};
						if (res?.isReady && res?.isNew) break;
					} catch {
						/* retry */
					}
					await new Promise((r) => setTimeout(r, 500));
				}

				await invoke("mp_editor_set_content", { content });
				return true;
			}, html);
		} catch (err) {
			console.warn("[spider-media] MpEditor JS API 调用失败", err);
			return false;
		}
	}
}
