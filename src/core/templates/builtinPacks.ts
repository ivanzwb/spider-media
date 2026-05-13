import type { TemplatePack } from "./types";

/**
 * 所有内置模板的 TemplatePack 定义。
 *
 * 每个 pack 包含：
 * - tokens：语义化设计令牌（用户复制为自定义模板时以此为初始值）
 * - overrides.<platform>.extraCss：该平台额外 CSS（保留原始模板独有的精细样式）
 *
 * 编译流程：platform baseStyles + tokensToCss + extraCss → styles
 * extraCss 中的样式会覆盖 tokensToCss 的同名规则（CSS 优先级），与旧行为一致。
 */

export const BUILTIN_PACKS: TemplatePack[] = [
	// ─── 微信公众号 ───────────────────────────────────────
	{
		id: "wechat-default",
		name: "默认精简",
		category: "general",
		source: "builtin",
		tokens: {
			themeColor: "#07C160",
			headingStyle: "underline",
			bodyFont: "system",
			fontSize: 16,
			lineHeight: 1.75,
			codeTheme: "atom-one-dark",
			blockquoteStyle: "card",
			linkColor: "#07C160",
			spacing: "normal",
		},
		overrides: {
			wechat: {
				extraCss: [
					".mp-article blockquote { background: #f7f7f7; }",
					".mp-article pre code { background: transparent; color: #f8f8f2; padding: 0; }",
					".mp-article :not(pre) > code { background: #f0f0f0; color: #d63384; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
				].join("\n"),
			},
		},
	},
	{
		id: "wechat-warm",
		name: "橙心 · 温暖",
		category: "color",
		source: "builtin",
		tokens: {
			themeColor: "#F36C39",
			headingStyle: "numbered",
			bodyFont: "system",
			fontSize: 16,
			lineHeight: 1.75,
			codeTheme: "atom-one-dark",
			blockquoteStyle: "card",
			linkColor: "#F36C39",
			spacing: "normal",
		},
		overrides: {
			wechat: {
				extraCss: [
					".mp-article h1 { color: #2c2c2c; text-align: center; }",
					".mp-article h2 { color: #2c2c2c; }",
					".mp-article h3 { display: inline-block; color: #fff; background: var(--mp-theme-color, #F36C39); padding: 2px 12px; border-radius: 14px; font-size: 15px; }",
					".mp-article blockquote { background: #FFF6F1; color: #5C3D32; border-radius: 0 6px 6px 0; }",
					".mp-article pre code { background: transparent; color: #FFE8DC; padding: 0; }",
					".mp-article :not(pre) > code { background: #FFE8DC; color: #C0432F; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
					".mp-article a { border-bottom: 1px dashed var(--mp-theme-color, #F36C39); text-decoration: none; }",
					".mp-article pre { background: #2B2B2B; color: #FFE8DC; }",
				].join("\n"),
			},
		},
	},
	{
		id: "wechat-blue",
		name: "蓝调 · 科技",
		category: "color",
		source: "builtin",
		tokens: {
			themeColor: "#1E88E5",
			headingStyle: "numbered",
			bodyFont: "system",
			fontSize: 16,
			lineHeight: 1.75,
			codeTheme: "github",
			blockquoteStyle: "card",
			linkColor: "#1E88E5",
			spacing: "normal",
		},
		overrides: {
			wechat: {
				extraCss: [
					".mp-article h1 { color: #0B3D91; text-align: center; border-bottom: 2px solid var(--mp-theme-color, #1E88E5); padding-bottom: 8px; }",
					".mp-article h2 { color: #0B3D91; padding-left: 10px; position: relative; }",
					'.mp-article h2::before { content: ""; display: inline-block; width: 4px; height: 1em; background: var(--mp-theme-color, #1E88E5); margin-right: 8px; vertical-align: -2px; border-radius: 2px; }',
					".mp-article h3 { color: var(--mp-theme-color, #1E88E5); }",
					".mp-article blockquote { background: #F2F8FE; color: #2A4A6B; }",
					".mp-article :not(pre) > code { background: #EAF3FB; color: #0B5FFF; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
					".mp-article strong { color: #0B3D91; }",
				].join("\n"),
			},
		},
	},
	{
		id: "wechat-serif",
		name: "雅黑 · 文艺",
		category: "literary",
		source: "builtin",
		tokens: {
			themeColor: "#8B5E3C",
			headingStyle: "template",
			bodyFont: "serif",
			fontSize: 16,
			lineHeight: 1.8,
			codeTheme: "light",
			blockquoteStyle: "minimal",
			linkColor: "#8B5E3C",
			spacing: "loose",
		},
		overrides: {
			wechat: {
				extraCss: [
					'.mp-article { font-family: "Source Han Serif SC", "Songti SC", "Noto Serif CJK SC", "SimSun", "STSong", serif; color: #2b2b2b; }',
					".mp-article h1 { text-align: center; font-weight: normal; letter-spacing: 4px; color: #1a1a1a; }",
					".mp-article h2 { text-align: center; font-weight: normal; letter-spacing: 2px; color: #1a1a1a; }",
					'.mp-article h2::before, .mp-article h2::after { content: "—"; color: #B59A5F; margin: 0 0.6em; font-weight: normal; }',
					".mp-article h3 { color: var(--mp-theme-color, #8B5E3C); border-left: 3px solid var(--mp-theme-color, #8B5E3C); padding-left: 8px; }",
					".mp-article p { text-indent: 2em; }",
					".mp-article blockquote { border: none; margin: 16px 24px; padding: 6px 16px; color: #6b6b6b; font-style: italic; background: transparent; border-left: 2px solid #B59A5F; border-right: 2px solid #B59A5F; text-align: center; }",
					".mp-article pre { background: #F4EFE6; color: #3a2f25; border: 1px dashed #B59A5F; }",
					".mp-article pre code { background: transparent; color: #3a2f25; padding: 0; }",
					".mp-article :not(pre) > code { background: #F4EFE6; color: #8B5E3C; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
					".mp-article a { color: var(--mp-theme-color, #8B5E3C); text-decoration: none; border-bottom: 1px solid var(--mp-theme-color, #8B5E3C); }",
					".mp-article hr { border-top: 1px solid #B59A5F; }",
				].join("\n"),
			},
		},
	},
	{
		id: "wechat-minimal",
		name: "极简 · 黑白",
		category: "minimal",
		source: "builtin",
		tokens: {
			themeColor: "#333333",
			headingStyle: "template",
			bodyFont: "system",
			fontSize: 16,
			lineHeight: 1.75,
			codeTheme: "light",
			blockquoteStyle: "minimal",
			linkColor: "#111111",
			spacing: "normal",
		},
		overrides: {
			wechat: {
				extraCss: [
					".mp-article { color: #2b2b2b; }",
					".mp-article h1, .mp-article h2, .mp-article h3 { color: #111; }",
					".mp-article h2 { border-bottom: 1px solid #e1e1e1; }",
					".mp-article h3 { color: #555; }",
					".mp-article pre { background: #FAFAFA; color: #222; border: 1px solid #ECECEC; }",
					".mp-article pre code { background: transparent; color: #222; padding: 0; }",
					".mp-article :not(pre) > code { background: #F2F2F2; color: #222; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
					".mp-article a { color: #111; text-decoration: underline; text-underline-offset: 3px; }",
					".mp-article strong { color: #000; }",
				].join("\n"),
			},
		},
	},

	// ─── 头条号 ──────────────────────────────────────────
	{
		id: "toutiao-default",
		name: "默认精简",
		category: "general",
		source: "builtin",
		tokens: {
			themeColor: "#f04142",
			headingStyle: "underline",
			bodyFont: "system",
			fontSize: 17,
			lineHeight: 1.75,
			codeTheme: "atom-one-dark",
			blockquoteStyle: "card",
			linkColor: "#f04142",
			spacing: "normal",
		},
		overrides: {
			toutiao: {
				extraCss: [
					".tt-article blockquote { background: #fafafa; }",
					".tt-article pre code { background: transparent; color: #f8f8f2; padding: 0; }",
					".tt-article :not(pre) > code { background: #f0f0f0; color: #d63384; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
				].join("\n"),
			},
		},
	},

	// ─── 知乎 ────────────────────────────────────────────
	{
		id: "zhihu-default",
		name: "默认精简",
		category: "general",
		source: "builtin",
		tokens: {
			themeColor: "#0084FF",
			headingStyle: "underline",
			bodyFont: "system",
			fontSize: 16,
			lineHeight: 1.8,
			codeTheme: "github",
			blockquoteStyle: "card",
			linkColor: "#0084FF",
			spacing: "normal",
		},
		overrides: {
			zhihu: {
				extraCss: [
					".zh-article blockquote { background: #f6f8fa; }",
					".zh-article pre code { background: transparent; color: #1f2328; padding: 0; }",
					".zh-article :not(pre) > code { background: #f0f0f0; color: #d63384; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
				].join("\n"),
			},
		},
	},

	// ─── 小红书 ──────────────────────────────────────────
	{
		id: "xiaohongshu-default",
		name: "默认粉调",
		category: "general",
		source: "builtin",
		tokens: {
			themeColor: "#FF2442",
			headingStyle: "numbered",
			bodyFont: "system",
			fontSize: 16,
			lineHeight: 1.75,
			codeTheme: "light",
			blockquoteStyle: "card",
			linkColor: "#FF2442",
			spacing: "normal",
		},
		overrides: {
			xiaohongshu: {
				extraCss: [
					".xhs-article h2 { color: #ff2442; border-left: 4px solid var(--mp-theme-color, #ff2442); padding-left: 10px; }",
					".xhs-article h3 { color: var(--mp-theme-color, #ff2442); }",
					".xhs-article blockquote { background: #fff5f7; border-radius: 4px; color: #777; }",
					".xhs-article pre { background: #fff5f7; color: #5b2333; border: 1px solid #ffd6df; }",
					".xhs-article pre code { background: transparent; color: #5b2333; padding: 0; }",
					".xhs-article :not(pre) > code { background: #ffe9ee; color: #ff2442; padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }",
				].join("\n"),
			},
		},
	},
];

/** 通过 pack ID 查找内置模板 */
export function findBuiltinPack(id: string): TemplatePack | undefined {
	return BUILTIN_PACKS.find((p) => p.id === id);
}

/** 获取所有内置 pack ID 集合 */
export function builtinPackIds(): Set<string> {
	return new Set(BUILTIN_PACKS.map((p) => p.id));
}

/** 根据平台 ID 过滤内置 packs（惯例：pack.id 以 "${platformId}-" 开头） */
export function getBuiltinPacksForPlatform(platformId: string): TemplatePack[] {
	return BUILTIN_PACKS.filter((p) => p.id.startsWith(`${platformId}-`));
}

/** 获取所有内置 packs 的扁平列表 */
export function getAllBuiltinPacks(): TemplatePack[] {
	return BUILTIN_PACKS;
}
