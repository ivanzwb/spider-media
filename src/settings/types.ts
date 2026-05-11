import { DEFAULT_TWEAKS, type FormatTweaks } from "@/platforms/base";

export interface WeChatPlatformSettings {
	defaultTemplateId: string;
	browserURL: string;
	executablePath: string;
	puppeteerModulePath: string;
	timeoutMs: number;
}

export interface ToutiaoPlatformSettings {
	defaultTemplateId: string;
	timeoutMs: number;
}

export interface SpiderMediaSettings {
	defaultPlatform: string;
	imageInlineThresholdKB: number;
	tweaks: FormatTweaks;
	wechat: WeChatPlatformSettings;
	toutiao: ToutiaoPlatformSettings;
}

export const DEFAULT_SETTINGS: SpiderMediaSettings = {
	defaultPlatform: "wechat",
	imageInlineThresholdKB: 100,
	tweaks: { ...DEFAULT_TWEAKS },
	wechat: {
		defaultTemplateId: "wechat-default",
		browserURL: "",
		executablePath: "",
		puppeteerModulePath: "",
		timeoutMs: 30_000,
	},
	toutiao: {
		defaultTemplateId: "toutiao-default",
		timeoutMs: 30_000,
	},
};
