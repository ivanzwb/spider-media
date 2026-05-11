import type { Template } from "@/platforms/base";

/**
 * 头条号模板共享基础样式（结构性）。颜色 / 字体由各 theme 模板覆盖。
 */
export const toutiaoBaseStyles = `
.tt-article {
	font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;
	color: #222;
	background: #fff;
	word-wrap: break-word;
	font-size: 17px;
	line-height: 1.75;
}
.tt-article h1, .tt-article h2, .tt-article h3,
.tt-article h4, .tt-article h5, .tt-article h6 {
	font-weight: bold;
	margin: 1.4em 0 0.7em;
	line-height: 1.35;
}
.tt-article h1 { font-size: 24px; }
.tt-article h2 { font-size: 20px; }
.tt-article h3 { font-size: 18px; }
.tt-article h4 { font-size: 16px; }
.tt-article p { text-align: justify; margin: 0.8em 0; }
.tt-article ul, .tt-article ol { padding-left: 1.6em; text-align: left; }
.tt-article li { margin: 0.3em 0; text-align: left; }
.tt-article hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
.tt-article table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }
.tt-article th, .tt-article td { border: 1px solid #ddd; padding: 6px 10px; }
.tt-article th { background: #f5f5f5; }
.tt-article img { border-radius: 6px; }
.tt-article pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
.tt-article code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }
`.trim();

export const TOUTIAO_TEMPLATE_HTML = `<section class="tt-article">
{{TWEAK_STYLES}}
{{CONTENT}}
</section>`;

export function wrapTemplate(extraStyles: string): Pick<Template, "html" | "styles"> {
	return {
		html: TOUTIAO_TEMPLATE_HTML,
		styles: `${toutiaoBaseStyles}\n${extraStyles.trim()}`,
	};
}
