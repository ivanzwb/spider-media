import type { Browser, Page } from "puppeteer-core";

export interface LaunchOptions {
	/** 优先连接已开启远程调试 (默认 9222 端口) 的 Chrome */
	browserURL?: string;
	/** 用户指定的 Chrome 可执行文件路径 */
	executablePath?: string;
	/** puppeteer-core 安装路径 (绝对路径)。Obsidian 沙箱无法解析 bare 模块名，必须显式指定 */
	puppeteerModulePath?: string;
	headless?: boolean;
	timeoutMs?: number;
}

/**
 * 浏览器自动化包装。
 *
 * 关键约束（见 .github/instructions/automator.instructions.md）：
 * - 不得在模块顶层 import puppeteer-core；必须延迟动态加载
 * - 所有调用方必须包裹 try/catch 并使用 clipboardFallback 兜底
 * - 所有 page 操作必须显式 timeout
 */
export class BrowserAutomator {
	private browser: Browser | null = null;
	private page: Page | null = null;

	async launch(options: LaunchOptions): Promise<Page> {
		const timeout = options.timeoutMs ?? 30_000;
		const puppeteer = await this.loadPuppeteer(options.puppeteerModulePath);

		if (options.browserURL) {
			this.browser = await puppeteer.connect({
				browserURL: options.browserURL,
				// null 表示沿用窗口实际大小，不强制 1280x800 视口
				defaultViewport: null,
			});
		} else {
			if (!options.executablePath) {
				throw new Error("未配置 Chrome 路径，且未启用 CDP 远程连接");
			}
			this.browser = await puppeteer.launch({
				headless: options.headless ?? false,
				executablePath: options.executablePath,
				// --start-maximized 启动即最大化；defaultViewport: null 让页面跟随窗口尺寸
				args: ["--no-sandbox", "--disable-gpu", "--start-maximized"],
				defaultViewport: null,
				timeout,
			});
		}

		// puppeteer.launch 启动时 Chrome 自带一个 about:blank 页；再 newPage 会变成两个 tab。
		// 优先复用首个已有页，没有再 newPage。
		const existing = await this.browser.pages();
		this.page = existing.find((p) => !p.isClosed()) ?? (await this.browser.newPage());
		this.page.setDefaultTimeout(timeout);
		this.page.setDefaultNavigationTimeout(timeout);
		// 兜底：用 CDP 把窗口设为屏幕大小（macOS / Linux 上 --start-maximized 偶尔失效）
		try {
			const session = await this.page.target().createCDPSession();
			const { windowId } = (await session.send("Browser.getWindowForTarget")) as {
				windowId: number;
			};
			await session.send("Browser.setWindowBounds", {
				windowId,
				bounds: { windowState: "maximized" },
			});
		} catch {
			// 远程 connect 或非 Chrome target 时忽略
		}
		return this.page;
	}

	page$(): Page {
		if (!this.page) throw new Error("浏览器未启动");
		return this.page;
	}

	async close(): Promise<void> {
		try {
			await this.page?.close();
		} catch {
			/* ignore */
		}
		try {
			await this.browser?.close();
		} catch {
			/* ignore */
		}
		this.page = null;
		this.browser = null;
	}

	/**
	 * 通过 Electron 的 Node require 加载 puppeteer-core。
	 *
	 * 注意:
	 * - 不能用浏览器侧的 `import('puppeteer-core')`：Obsidian 渲染进程会把 bare 名当 URL 解析，必然失败。
	 * - esbuild 已将 puppeteer-core 标为 external，但默认输出是动态 import，仍走浏览器 loader；
	 *   所以这里通过 `eval('require')` 取到真正的 Node require，绕过打包器静态分析。
	 * - 用户必须配置一个绝对路径（指向某个 node_modules/puppeteer-core 或包根目录），否则直接抛错。
	 */
	private async loadPuppeteer(
		modulePath: string | undefined,
	): Promise<typeof import("puppeteer-core")> {
		if (!modulePath) {
			throw new Error(
				"未配置 puppeteer-core 模块路径；请在设置中填写绝对路径（例如 D:/tools/puppeteer-core），或保持剪贴板手动粘贴模式。",
			);
		}
		const nodeRequire = (0, eval)("require") as NodeRequire | undefined;
		if (typeof nodeRequire !== "function") {
			throw new Error("当前运行环境不支持 Node require（非 Electron 渲染进程？）");
		}
		try {
			const mod = nodeRequire(modulePath) as unknown;
			const m = mod as { default?: typeof import("puppeteer-core") } & typeof import("puppeteer-core");
			return m.default ?? m;
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			throw new Error(`加载 puppeteer-core 失败 (${modulePath}): ${msg}`);
		}
	}
}
