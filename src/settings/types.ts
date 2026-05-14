import { DEFAULT_TWEAKS, type FormatTweaks } from "@/platforms/base";

export interface TemplateSettings {
	/** 用户自定义模板包列表 */
	userPacks: import("@/core/templates").TemplatePack[];
	/** 全局默认模板 ID（可以是 builtin 或 user 包） */
	defaultPackId: string;
}

export interface SpiderMediaSettings {
	defaultPlatform: string;
	tweaks: FormatTweaks;
	templates: TemplateSettings;
}

export const DEFAULT_SETTINGS: SpiderMediaSettings = {
	defaultPlatform: "wechat",
	tweaks: { ...DEFAULT_TWEAKS },
	templates: {
		userPacks: [],
		defaultPackId: "wechat-default",
	},
};
