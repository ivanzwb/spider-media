import type { HeadingStyle } from "@/platforms/base";

/** 已知平台 ID */
export type PlatformId = "wechat" | "toutiao" | "zhihu" | "xiaohongshu";

/** 模板来源 */
export type TemplateSource = "builtin" | "user";

/** 正文字体族 */
export type BodyFont = "system" | "serif" | "sans";

/** 引用块样式 */
export type BlockquoteStyle = "card" | "border-left" | "minimal";

/** 代码主题（模板层，非用户覆盖） */
export type TemplateCodeTheme = "atom-one-dark" | "github" | "github-dark" | "dracula" | "light";

/** 间距紧凑度 */
export type Spacing = "compact" | "normal" | "loose";

/**
 * 模板设计令牌 —— 跨平台语义化参数。
 *
 * 每个 TemplatePack 包含一套 tokens，编译时转为各平台特定的 CSS。
 * 用户可在 TemplateManagerModal 中调整这些值。
 */
export interface TemplateTokens {
	/** 主题色 hex */
	themeColor: string;
	/** 标题装饰风格 */
	headingStyle: HeadingStyle;
	/** 正文字体族 */
	bodyFont: BodyFont;
	/** 正文字号 (px) */
	fontSize: number;
	/** 行高 */
	lineHeight: number;
	/** 代码块配色 */
	codeTheme: TemplateCodeTheme;
	/** 引用块样式 */
	blockquoteStyle: BlockquoteStyle;
	/** 链接颜色（空字符串=跟随主题色） */
	linkColor: string;
	/** 间距紧凑度 */
	spacing: Spacing;
}

/** 平台级覆盖（内置模板保留原始 CSS 用 extraCss） */
export interface PlatformOverride {
	/** 额外 CSS 片段，追加到 tokens 编译结果之后。内置模板专用。 */
	extraCss?: string;
	/** 在该平台禁用此模板 */
	disabled?: boolean;
}

/**
 * 跨平台模板包 —— 新模板管理系统的核心抽象。
 *
 * 对比旧 `Template`（{ id, name, category, html, styles }）：
 * - TemplatePack 是"声明式"的，携带语义化 tokens
 * - 编译时通过 TemplateCompiler 转为平台特定的 Template
 * - 同一 pack 可在多平台得到风格一致的展现
 */
export interface TemplatePack {
	id: string;
	name: string;
	category: string;
	source: TemplateSource;
	tokens: TemplateTokens;
	overrides?: Partial<Record<PlatformId, PlatformOverride>>;
}

/** 导入/导出 JSON 的外层包装，带版本号 */
export interface TemplatePackExport {
	version: 1;
	pack: TemplatePack;
}

/** 默认 tokens（作为新建用户模板的初始值） */
export const DEFAULT_TEMPLATE_TOKENS: TemplateTokens = {
	themeColor: "#07C160",
	headingStyle: "underline",
	bodyFont: "system",
	fontSize: 16,
	lineHeight: 1.75,
	codeTheme: "atom-one-dark",
	blockquoteStyle: "border-left",
	linkColor: "",
	spacing: "normal",
};
