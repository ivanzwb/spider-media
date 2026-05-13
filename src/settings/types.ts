import { DEFAULT_TWEAKS, type FormatTweaks } from "@/platforms/base";
import type { TemplatePack } from "@/core/templates";

export interface WeChatPlatformSettings {
	defaultTemplateId: string;
}

export interface ToutiaoPlatformSettings {
	defaultTemplateId: string;
}

export interface ZhihuPlatformSettings {
	defaultTemplateId: string;
}

export interface XiaohongshuPlatformSettings {
	defaultTemplateId: string;
}

export interface TemplateSettings {
	/** 用户自定义模板包列表 */
	userPacks: TemplatePack[];
	/** 全局默认模板 ID（可以是 builtin 或 user 包） */
	defaultPackId: string;
}

export interface SpiderMediaSettings {
	defaultPlatform: string;
	imageInlineThresholdKB: number;
	tweaks: FormatTweaks;
	templates: TemplateSettings;
	// 保留旧 per-platform 设置用于向后兼容，新系统统一走 templates.defaultPackId
	wechat: WeChatPlatformSettings;
	toutiao: ToutiaoPlatformSettings;
	zhihu: ZhihuPlatformSettings;
	xiaohongshu: XiaohongshuPlatformSettings;
}

export const DEFAULT_SETTINGS: SpiderMediaSettings = {
	defaultPlatform: "wechat",
	imageInlineThresholdKB: 100,
	tweaks: { ...DEFAULT_TWEAKS },
	templates: {
		userPacks: [],
		defaultPackId: "wechat-default",
	},
	wechat: {
		defaultTemplateId: "wechat-default",
	},
	toutiao: {
		defaultTemplateId: "toutiao-default",
	},
	zhihu: {
		defaultTemplateId: "zhihu-default",
	},
	xiaohongshu: {
		defaultTemplateId: "xiaohongshu-default",
	},
};
