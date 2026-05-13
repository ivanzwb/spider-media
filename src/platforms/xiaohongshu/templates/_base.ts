import type { Template } from "@/platforms/base";

/**
 * 小红书图文笔记模板共享基础样式（结构性）。
 * 小红书正文实际不接受 HTML 标签，这里的样式主要用于
 * PlatformEditorView 预览，让创作者所见即所得评估视觉效果。
 */
export const xiaohongshuBaseStyles = `
.xhs-article {
	font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
	color: #333;
	background: #fff;
	word-wrap: break-word;
	font-size: 16px;
	line-height: 1.75;
}
.xhs-article h1, .xhs-article h2, .xhs-article h3,
.xhs-article h4, .xhs-article h5, .xhs-article h6 {
	font-weight: 700;
	margin: 1.2em 0 0.6em;
	line-height: 1.4;
}
.xhs-article h1 { font-size: 22px; }
.xhs-article h2 { font-size: 19px; }
.xhs-article h3 { font-size: 17px; }
.xhs-article h4 { font-size: 16px; }
.xhs-article p { margin: 0.7em 0; }
.xhs-article ul, .xhs-article ol { padding-left: 1.4em; }
.xhs-article li { margin: 0.25em 0; }
.xhs-article hr { border: none; border-top: 1px dashed #f0afc0; margin: 18px 0; }
.xhs-article img { border-radius: 8px; }
`.trim();

export const XIAOHONGSHU_TEMPLATE_HTML = `<section class="xhs-article">
{{TWEAK_STYLES}}
{{CONTENT}}
</section>`;

export function wrapTemplate(extraStyles: string): Pick<Template, "html" | "styles"> {
	return {
		html: XIAOHONGSHU_TEMPLATE_HTML,
		styles: `${xiaohongshuBaseStyles}\n${extraStyles.trim()}`,
	};
}
