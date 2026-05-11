import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 极简 · 黑白：无主题色装饰，仅排版与字号区分层级，适合纯文字长文 */
export const wechatMinimalTemplate: Template = {
	id: "wechat-minimal",
	name: "极简 · 黑白",
	category: "minimal",
	...wrapTemplate(`
.mp-article {
	color: #2b2b2b;
}
.mp-article h1, .mp-article h2, .mp-article h3 { color: #111; }
.mp-article h2 { border-bottom: 1px solid #e1e1e1; padding-bottom: 4px; }
.mp-article h3 { color: #555; }
.mp-article blockquote {
	border-left: 3px solid #bbb;
	padding: 4px 12px;
	margin: 12px 0;
	color: #666;
	background: transparent;
}
.mp-article pre {
	background: #FAFAFA;
	color: #222;
	padding: 12px;
	border-radius: 4px;
	overflow-x: auto;
	font-size: 13.5px;
	line-height: 1.55;
	margin: 12px 0;
	border: 1px solid #ECECEC;
}
.mp-article pre code { background: transparent; color: #222; padding: 0; }
.mp-article :not(pre) > code {
	background: #F2F2F2;
	color: #222;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.mp-article a { color: #111; text-decoration: underline; text-underline-offset: 3px; }
.mp-article strong { color: #000; }
`),
};
