import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 知乎默认模板：蓝色品牌强调，左竖条引用 / h2 蓝色下划 */
export const zhihuDefaultTemplate: Template = {
	id: "zhihu-default",
	name: "默认精简",
	category: "general",
	...wrapTemplate(`
.zh-article h1 { color: #1a1a1a; }
.zh-article h2 {
	color: #1a1a1a;
	border-bottom: 2px solid var(--mp-theme-color, #0084FF);
	padding-bottom: 4px;
}
.zh-article h3 { color: var(--mp-theme-color, #0084FF); }
.zh-article blockquote {
	border-left: 4px solid var(--mp-theme-color, #0084FF);
	padding: 8px 14px;
	margin: 12px 0;
	background: #f6f8fa;
	color: #555;
}
.zh-article pre {
	background: #f6f8fa;
	color: #1f2328;
	padding: 14px;
	border-radius: 6px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.55;
	margin: 12px 0;
	border: 1px solid #e5e5e5;
}
.zh-article pre code { background: transparent; color: #1f2328; padding: 0; }
.zh-article :not(pre) > code {
	background: #f0f0f0;
	color: #d63384;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.zh-article a { color: var(--mp-theme-color, #0084FF); text-decoration: underline; }
`),
};
