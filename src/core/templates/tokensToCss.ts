import type { TemplateTokens, PlatformId, Spacing, TemplateCodeTheme, BlockquoteStyle, BodyFont } from "./types";

/**
 * 将 TemplateTokens 编译为平台特定的 CSS。
 *
 * 每个平台的 CSS 类名前缀不同，由 platformId 决定：
 * - wechat → .mp-article
 * - toutiao → .tt-article
 * - zhihu → .zh-article
 * - xiaohongshu → .xhs-article
 */

const ARTICLE_CLASS: Record<PlatformId, string> = {
	wechat: ".mp-article",
	toutiao: ".tt-article",
	zhihu: ".zh-article",
	xiaohongshu: ".xhs-article",
};

export function tokensToCss(tokens: TemplateTokens, platformId: PlatformId): string {
	const A = ARTICLE_CLASS[platformId] ?? ".mp-article";
	const linkColor = tokens.linkColor || tokens.themeColor;

	const lines: string[] = [];

	// Body font
	lines.push(bodyFontCss(A, tokens.bodyFont));

	// Base spacing
	lines.push(spacingCss(A, tokens.spacing));

	// Heading styles
	lines.push(headingCss(A, tokens.headingStyle, tokens.themeColor));

	// Blockquote
	lines.push(blockquoteCss(A, tokens.blockquoteStyle, tokens.themeColor));

	// Code theme
	lines.push(codeCss(A, tokens.codeTheme));

	// Links
	lines.push(`${A} a { color: ${linkColor}; text-decoration: underline; }`);

	return lines.filter(Boolean).join("\n");
}

function bodyFontCss(A: string, font: BodyFont): string {
	switch (font) {
		case "serif":
			return `${A} { font-family: "Source Han Serif SC", "Songti SC", "Noto Serif CJK SC", "SimSun", "STSong", serif; }`;
		case "sans":
			return `${A} { font-family: "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif; }`;
		case "system":
		default:
			return `${A} { font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif; }`;
	}
}

function spacingCss(A: string, spacing: Spacing): string {
	switch (spacing) {
		case "compact":
			return [
				`${A} h1, ${A} h2, ${A} h3, ${A} h4, ${A} h5, ${A} h6 { margin: 0.8em 0 0.4em; }`,
				`${A} p { margin: 0.4em 0; }`,
				`${A} li { margin: 0.15em 0; }`,
			].join("\n");
		case "loose":
			return [
				`${A} h1, ${A} h2, ${A} h3, ${A} h4, ${A} h5, ${A} h6 { margin: 2em 0 1em; }`,
				`${A} p { margin: 1.2em 0; }`,
				`${A} li { margin: 0.5em 0; }`,
			].join("\n");
		case "normal":
		default:
			return [
				`${A} h1, ${A} h2, ${A} h3, ${A} h4, ${A} h5, ${A} h6 { margin: 1.4em 0 0.7em; }`,
				`${A} p { margin: 0.8em 0; }`,
				`${A} li { margin: 0.3em 0; }`,
			].join("\n");
	}
}

function headingCss(A: string, style: string, theme: string): string {
	switch (style) {
		case "underline":
			return [
				`${A} h1 { color: #222; }`,
				`${A} h2 { color: #222; border-bottom: 2px solid ${theme}; padding-bottom: 4px; }`,
				`${A} h3 { color: ${theme}; }`,
			].join("\n");
		case "bordered":
			return [
				`${A} h1 { color: #222; }`,
				`${A} h2 { border: 1px solid ${theme}; border-radius: 4px; padding: 4px 10px; display: inline-block; }`,
				`${A} h3 { color: ${theme}; border-left: 3px solid ${theme}; padding-left: 8px; }`,
			].join("\n");
		case "numbered":
			return [
				`${A} h1 { color: #222; }`,
				`${A} h2 { border-left: 4px solid ${theme}; background: linear-gradient(90deg, ${theme}1a, transparent); padding: 4px 10px; }`,
				`${A} h3 { color: ${theme}; padding-left: 8px; border-left: 2px solid ${theme}; }`,
			].join("\n");
		case "template":
		default:
			// Minimal — only color/font-size from base styles
			return [
				`${A} h1 { color: #222; }`,
				`${A} h2 { color: #333; }`,
				`${A} h3 { color: #555; }`,
			].join("\n");
	}
}

function blockquoteCss(A: string, style: BlockquoteStyle, theme: string): string {
	switch (style) {
		case "card":
			return [
				`${A} blockquote {`,
				`  border-left: 4px solid ${theme};`,
				`  padding: 8px 14px;`,
				`  margin: 12px 0;`,
				`  background: #f7f7f7;`,
				`  color: #555;`,
				`  border-radius: 0 4px 4px 0;`,
				`}`,
			].join("\n");
		case "minimal":
			return [
				`${A} blockquote {`,
				`  border-left: 2px solid #ccc;`,
				`  padding: 4px 12px;`,
				`  margin: 12px 0;`,
				`  color: #666;`,
				`  background: transparent;`,
				`}`,
			].join("\n");
		case "border-left":
		default:
			return [
				`${A} blockquote {`,
				`  border-left: 4px solid ${theme};`,
				`  padding: 8px 14px;`,
				`  margin: 12px 0;`,
				`  color: #555;`,
				`  background: transparent;`,
				`}`,
			].join("\n");
	}
}

const CODE_THEMES: Record<TemplateCodeTheme, { bg: string; fg: string; border?: string }> = {
	"atom-one-dark": { bg: "#2d2d2d", fg: "#f8f8f2" },
	github: { bg: "#F6F8FA", fg: "#24292E", border: "#E1E4E8" },
	"github-dark": { bg: "#1b1f23", fg: "#e1e4e8", border: "#444d56" },
	dracula: { bg: "#282A36", fg: "#F8F8F2" },
	light: { bg: "#FAFAFA", fg: "#24292E", border: "#E1E4E8" },
};

function codeCss(A: string, theme: TemplateCodeTheme): string {
	const c = CODE_THEMES[theme] ?? CODE_THEMES["atom-one-dark"];
	const border = c.border ? `border: 1px solid ${c.border};` : "";
	return [
		`${A} pre {`,
		`  background: ${c.bg};`,
		`  color: ${c.fg};`,
		`  padding: 14px;`,
		`  border-radius: 6px;`,
		`  overflow-x: auto;`,
		`  font-size: 14px;`,
		`  line-height: 1.55;`,
		`  margin: 12px 0;`,
		`  ${border}`,
		`}`,
		`${A} pre code { background: transparent; color: ${c.fg}; padding: 0; }`,
		`${A} :not(pre) > code {`,
		`  background: ${c.bg === "#2d2d2d" ? "#f0f0f0" : `${c.bg}`};`,
		`  color: ${c.fg === "#f8f8f2" ? "#d63384" : c.fg};`,
		`  padding: 1px 5px;`,
		`  border-radius: 3px;`,
		`  font-size: 0.9em;`,
		`}`,
	].join("\n");
}
