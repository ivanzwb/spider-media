import { DEFAULT_TWEAKS, type FormatTweaks } from "@/platforms/base";

export interface WeChatPlatformSettings {
	defaultTemplateId: string;
}

export interface ToutiaoPlatformSettings {
	defaultTemplateId: string;
}

export interface ZhihuPlatformSettings {
	defaultTemplateId: string;
}

export interface SpiderMediaSettings {
	defaultPlatform: string;
	imageInlineThresholdKB: number;
	tweaks: FormatTweaks;
	wechat: WeChatPlatformSettings;
	toutiao: ToutiaoPlatformSettings;
	zhihu: ZhihuPlatformSettings;
}

export const DEFAULT_SETTINGS: SpiderMediaSettings = {
	defaultPlatform: "wechat",
	imageInlineThresholdKB: 100,
	tweaks: { ...DEFAULT_TWEAKS },
	wechat: {
		defaultTemplateId: "wechat-default",
	},
	toutiao: {
		defaultTemplateId: "toutiao-default",
	},
	zhihu: {
		defaultTemplateId: "zhihu-default",
	},
};
