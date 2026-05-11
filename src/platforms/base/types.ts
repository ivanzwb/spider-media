import type { Vault } from "obsidian";

/** 平台元数据 */
export interface PlatformMeta {
	id: string;
	name: string;
	icon: string;
	color: string;
	isDesktopOnly: boolean;
}

/** 标题装饰风格（在模板基础上叠加） */
export type HeadingStyle = "template" | "numbered" | "underline" | "bordered";

/** 代码块配色（覆盖模板默认） */
export type CodeTheme = "template" | "dark" | "light" | "github" | "dracula";

/** 用户调优参数 (UI 滑块/开关绑定) */
export interface FormatTweaks {
	fontSize: number;
	lineHeight: number;
	paragraphSpacing: number;
	firstLineIndent: boolean;
	pagePadding: number;
	letterSpacing: number;
	imageRadius: number;
	themeColor: string;
	headingStyle: HeadingStyle;
	codeTheme: CodeTheme;
}

export const DEFAULT_TWEAKS: FormatTweaks = {
	fontSize: 16,
	lineHeight: 1.75,
	paragraphSpacing: 16,
	firstLineIndent: false,
	pagePadding: 16,
	letterSpacing: 0,
	imageRadius: 8,
	themeColor: "#07C160",
	headingStyle: "template",
	codeTheme: "template",
};

/** 样式模板 */
export interface Template {
	id: string;
	name: string;
	category: string;
	/** 模板 HTML 骨架，必须包含 {{CONTENT}} 与 {{TWEAK_STYLES}} 占位符 */
	html: string;
	/** 模板基础 CSS (会被 juice 内联) */
	styles: string;
}

/** 平台凭据 */
export interface Credentials {
	type: "cookie" | "token" | "password" | "manual";
	data: Record<string, string>;
}

/** 发布结果 */
export interface PublishResult {
	success: boolean;
	stage: "login" | "fill" | "preview" | "done" | "fallback";
	message: string;
	url?: string;
}

/** 平台上下文 (注入运行时依赖) */
export interface PlatformContext {
	vault: Vault;
}
