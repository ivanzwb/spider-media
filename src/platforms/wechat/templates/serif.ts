import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 雅黑 · 文艺：宋体衬线，h2 居中带前后短杠，引用块仿书摘 */
export const wechatSerifTemplate: Template = {
	id: "wechat-serif",
	name: "雅黑 · 文艺",
	category: "literary",
	...wrapTemplate(`
.mp-article {
	font-family: "Source Han Serif SC", "Songti SC", "Noto Serif CJK SC", "SimSun", "STSong", serif;
	color: #2b2b2b;
}
.mp-article h1 {
	text-align: center;
	font-weight: normal;
	letter-spacing: 4px;
	color: #1a1a1a;
}
.mp-article h2 {
	text-align: center;
	font-weight: normal;
	letter-spacing: 2px;
	color: #1a1a1a;
}
.mp-article h2::before, .mp-article h2::after {
	content: "—";
	color: #B59A5F;
	margin: 0 0.6em;
	font-weight: normal;
}
.mp-article h3 { color: var(--mp-theme-color, #8B5E3C); border-left: 3px solid var(--mp-theme-color, #8B5E3C); padding-left: 8px; }
.mp-article p { text-indent: 2em; }
.mp-article blockquote {
	border: none;
	margin: 16px 24px;
	padding: 6px 16px;
	color: #6b6b6b;
	font-style: italic;
	background: transparent;
	border-left: 2px solid #B59A5F;
	border-right: 2px solid #B59A5F;
	text-align: center;
}
.mp-article pre {
	background: #F4EFE6;
	color: #3a2f25;
	padding: 14px;
	border-radius: 4px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.6;
	margin: 12px 0;
	border: 1px dashed #B59A5F;
}
.mp-article pre code { background: transparent; color: #3a2f25; padding: 0; }
.mp-article :not(pre) > code {
	background: #F4EFE6;
	color: #8B5E3C;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.mp-article a { color: var(--mp-theme-color, #8B5E3C); text-decoration: none; border-bottom: 1px solid var(--mp-theme-color, #8B5E3C); }
.mp-article hr { border-top: 1px solid #B59A5F; }
`),
};
