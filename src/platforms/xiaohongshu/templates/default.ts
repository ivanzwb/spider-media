import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 小红书默认模板：粉色品牌强调，软糯标题 + 装饰引用 */
export const xiaohongshuDefaultTemplate: Template = {
	id: "xiaohongshu-default",
	name: "默认粉调",
	category: "general",
	...wrapTemplate(`
.xhs-article h1 { color: #ff2442; }
.xhs-article h2 {
	color: #ff2442;
	border-left: 4px solid var(--mp-theme-color, #ff2442);
	padding-left: 10px;
}
.xhs-article h3 { color: var(--mp-theme-color, #ff2442); }
.xhs-article blockquote {
	border-left: 4px solid var(--mp-theme-color, #ff2442);
	background: #fff5f7;
	padding: 8px 14px;
	margin: 12px 0;
	color: #777;
	border-radius: 4px;
}
.xhs-article pre {
	background: #fff5f7;
	color: #5b2333;
	padding: 14px;
	border-radius: 8px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.55;
	margin: 12px 0;
	border: 1px solid #ffd6df;
}
.xhs-article pre code { background: transparent; color: #5b2333; padding: 0; }
.xhs-article :not(pre) > code {
	background: #ffe9ee;
	color: #ff2442;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.xhs-article a { color: var(--mp-theme-color, #ff2442); text-decoration: underline; }
`),
};
