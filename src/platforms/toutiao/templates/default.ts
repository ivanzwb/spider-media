import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 头条号默认模板：红色品牌强调，h2 底线 / h3 着色 */
export const toutiaoDefaultTemplate: Template = {
	id: "toutiao-default",
	name: "默认精简",
	category: "general",
	...wrapTemplate(`
.tt-article h1 { color: #1a1a1a; }
.tt-article h2 {
	color: #1a1a1a;
	border-bottom: 2px solid var(--mp-theme-color, #f04142);
	padding-bottom: 4px;
}
.tt-article h3 { color: var(--mp-theme-color, #f04142); }
.tt-article blockquote {
	border-left: 4px solid var(--mp-theme-color, #f04142);
	padding: 8px 14px;
	margin: 12px 0;
	background: #fafafa;
	color: #555;
}
.tt-article pre {
	background: #2d2d2d;
	color: #f8f8f2;
	padding: 14px;
	border-radius: 6px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.55;
	margin: 12px 0;
}
.tt-article pre code { background: transparent; color: #f8f8f2; padding: 0; }
.tt-article :not(pre) > code {
	background: #f0f0f0;
	color: #d63384;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.tt-article a { color: var(--mp-theme-color, #f04142); text-decoration: underline; }
`),
};
