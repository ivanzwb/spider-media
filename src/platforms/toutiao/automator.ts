import { clipboardFallback } from "@/automator/clipboardFallback";
import type { Credentials, PublishResult } from "@/platforms/base";

export interface ToutiaoAutomatorOptions {
	timeoutMs?: number;
}

export type ToutiaoAutomatorOptionsProvider = () => ToutiaoAutomatorOptions;

/**
 * 头条号自动化（puppeteer 路径）。
 *
 * 当前实现：默认直接走剪贴板兜底。
 * 头条号的真正注入路径走 Obsidian 内嵌 webview（见 ToutiaoBrowserView），
 * 与微信一致 —— 因为 puppeteer-core 在 Obsidian 沙箱内有诸多限制。
 */
export class ToutiaoAutomator {
	constructor(private getOptions: ToutiaoAutomatorOptionsProvider) {
		void this.getOptions;
	}

	async publish(
		html: string,
		title: string,
		_credentials: Credentials,
	): Promise<PublishResult> {
		return clipboardFallback(
			html,
			title,
			"头条号 puppeteer 路径暂未启用，请使用嵌入式浏览器发布",
		);
	}
}
