import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 蓝调 · 科技：冷色调，h2 左短粗块 + 编号感，代码使用 GitHub light */
export const wechatBlueTemplate: Template = {
	id: "wechat-blue",
	name: "蓝调 · 科技",
	category: "color",
	...wrapTemplate(`
.mp-article h1 {
	color: #0B3D91;
	text-align: center;
	border-bottom: 2px solid var(--mp-theme-color, #1E88E5);
	padding-bottom: 8px;
}
.mp-article h2 {
	color: #0B3D91;
	padding-left: 10px;
	position: relative;
}
.mp-article h2::before {
	content: "";
	display: inline-block;
	width: 4px;
	height: 1em;
	background: var(--mp-theme-color, #1E88E5);
	margin-right: 8px;
	vertical-align: -2px;
	border-radius: 2px;
}
.mp-article h3 { color: var(--mp-theme-color, #1E88E5); }
.mp-article blockquote {
	border-left: 4px solid var(--mp-theme-color, #1E88E5);
	background: #F2F8FE;
	color: #2A4A6B;
	padding: 8px 14px;
	margin: 12px 0;
}
.mp-article pre {
	background: #F6F8FA;
	color: #24292E;
	padding: 14px;
	border-radius: 6px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.55;
	margin: 12px 0;
	border: 1px solid #E1E4E8;
}
.mp-article pre code { background: transparent; color: #24292E; padding: 0; }
.mp-article :not(pre) > code {
	background: #EAF3FB;
	color: #0B5FFF;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.mp-article a { color: var(--mp-theme-color, #1E88E5); text-decoration: underline; }
.mp-article strong { color: #0B3D91; }
`),
};
