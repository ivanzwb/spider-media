import type { Template } from "@/platforms/base";

/**
 * 微信公众号模板共享的结构性基础样式。
 *
 * 注意：颜色、字体、边框等"主题相关"样式不放这里 —— 留给各 theme 模板覆盖。
 * 这里只保留所有主题都通用的排版基线（间距、表格边线、列表缩进等）。
 */
export const wechatBaseStyles = `
.mp-article {
	font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
	color: #333;
	background: #fff;
	word-wrap: break-word;
}
.mp-article h1, .mp-article h2, .mp-article h3,
.mp-article h4, .mp-article h5, .mp-article h6 {
	font-weight: bold;
	margin: 1.4em 0 0.7em;
	line-height: 1.35;
}
.mp-article h1 { font-size: 22px; }
.mp-article h2 { font-size: 19px; }
.mp-article h3 { font-size: 17px; }
.mp-article h4 { font-size: 16px; }
.mp-article p { text-align: justify; }
.mp-article ul, .mp-article ol { padding-left: 1.6em; text-align: left; }
.mp-article li { margin: 0.3em 0; text-align: left; }
.mp-article hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
.mp-article table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }
.mp-article th, .mp-article td { border: 1px solid #ddd; padding: 6px 10px; }
.mp-article th { background: #f5f5f5; }
.mp-article img { border-radius: 8px; }
.mp-article pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
.mp-article code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
`.trim();

export const WECHAT_TEMPLATE_HTML = `<section class="mp-article">
{{TWEAK_STYLES}}
{{CONTENT}}
</section>`;

export function wrapTemplate(extraStyles: string): Pick<Template, "html" | "styles"> {
	return {
		html: WECHAT_TEMPLATE_HTML,
		styles: `${wechatBaseStyles}\n${extraStyles.trim()}`,
	};
}
