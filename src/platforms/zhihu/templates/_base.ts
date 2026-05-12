import type { Template } from "@/platforms/base";

/**
 * 知乎专栏模板共享基础样式（结构性）。
 * 知乎编辑器对 inline style 容忍度较高（兼容 Draft.js / ProseMirror），
 * 结构性样式由 juice 内联，主题色由各 theme 模板覆盖。
 */
export const zhihuBaseStyles = `
.zh-article {
	font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
	color: #1a1a1a;
	background: #fff;
	word-wrap: break-word;
	font-size: 16px;
	line-height: 1.8;
}
.zh-article h1, .zh-article h2, .zh-article h3,
.zh-article h4, .zh-article h5, .zh-article h6 {
	font-weight: 600;
	margin: 1.4em 0 0.7em;
	line-height: 1.4;
}
.zh-article h1 { font-size: 24px; }
.zh-article h2 { font-size: 20px; }
.zh-article h3 { font-size: 17px; }
.zh-article h4 { font-size: 16px; }
.zh-article p { text-align: justify; margin: 0.8em 0; }
.zh-article ul, .zh-article ol { padding-left: 1.6em; text-align: left; }
.zh-article li { margin: 0.3em 0; text-align: left; }
.zh-article hr { border: none; border-top: 1px solid #e5e5e5; margin: 24px 0; }
.zh-article table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }
.zh-article th, .zh-article td { border: 1px solid #e5e5e5; padding: 6px 10px; }
.zh-article th { background: #f6f6f6; }
.zh-article img { border-radius: 4px; }
.zh-article pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
.zh-article code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
`.trim();

export const ZHIHU_TEMPLATE_HTML = `<section class="zh-article">
{{TWEAK_STYLES}}
{{CONTENT}}
</section>`;

export function wrapTemplate(extraStyles: string): Pick<Template, "html" | "styles"> {
	return {
		html: ZHIHU_TEMPLATE_HTML,
		styles: `${zhihuBaseStyles}\n${extraStyles.trim()}`,
	};
}
