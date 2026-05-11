import { DEFAULT_TWEAKS, type FormatTweaks } from "@/platforms/base";

export interface WeChatPlatformSettings {
	defaultTemplateId: string;
}

export interface ToutiaoPlatformSettings {
	defaultTemplateId: string;
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
	},
	toutiao: {
		defaultTemplateId: "toutiao-default",
	},
};
