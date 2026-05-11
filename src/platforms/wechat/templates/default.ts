import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 默认精简：微信品牌绿，h2 底线 / h3 着色 / 暗色代码块 */
export const wechatDefaultTemplate: Template = {
	id: "wechat-default",
	name: "默认精简",
	category: "general",
	...wrapTemplate(`
.mp-article h1 { color: #222; }
.mp-article h2 {
	color: #222;
	border-bottom: 2px solid var(--mp-theme-color, #07C160);
	padding-bottom: 4px;
}
.mp-article h3 { color: var(--mp-theme-color, #07C160); }
.mp-article blockquote {
	border-left: 4px solid var(--mp-theme-color, #07C160);
	padding: 8px 14px;
	margin: 12px 0;
	background: #f7f7f7;
	color: #555;
}
.mp-article pre {
	background: #2d2d2d;
	color: #f8f8f2;
	padding: 14px;
	border-radius: 6px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.55;
	margin: 12px 0;
}
.mp-article pre code { background: transparent; color: #f8f8f2; padding: 0; }
.mp-article :not(pre) > code {
	background: #f0f0f0;
	color: #d63384;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.mp-article a { color: var(--mp-theme-color, #07C160); text-decoration: underline; }
`),
};

