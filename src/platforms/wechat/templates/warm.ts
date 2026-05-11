import type { Template } from "@/platforms/base";
import { wrapTemplate } from "./_base";

/** 橙心：温暖橙调，h2 左侧粗竖条，h3 圆角胶囊 */
export const wechatWarmTemplate: Template = {
	id: "wechat-warm",
	name: "橙心 · 温暖",
	category: "color",
	...wrapTemplate(`
.mp-article {
	--mp-warm: #F36C39;
}
.mp-article h1 { color: #2c2c2c; text-align: center; }
.mp-article h2 {
	color: #2c2c2c;
	padding: 4px 0 4px 12px;
	border-left: 5px solid var(--mp-theme-color, #F36C39);
	background: linear-gradient(90deg, rgba(243,108,57,0.08), transparent);
}
.mp-article h3 {
	display: inline-block;
	color: #fff;
	background: var(--mp-theme-color, #F36C39);
	padding: 2px 12px;
	border-radius: 14px;
	font-size: 15px;
}
.mp-article blockquote {
	border-left: 4px solid var(--mp-theme-color, #F36C39);
	background: #FFF6F1;
	color: #5C3D32;
	padding: 10px 14px;
	margin: 14px 0;
	border-radius: 0 6px 6px 0;
}
.mp-article pre {
	background: #2B2B2B;
	color: #FFE8DC;
	padding: 14px;
	border-radius: 8px;
	overflow-x: auto;
	font-size: 14px;
	line-height: 1.55;
	margin: 12px 0;
}
.mp-article pre code { background: transparent; color: #FFE8DC; padding: 0; }
.mp-article :not(pre) > code {
	background: #FFE8DC;
	color: #C0432F;
	padding: 1px 5px;
	border-radius: 3px;
	font-size: 0.9em;
}
.mp-article a {
	color: var(--mp-theme-color, #F36C39);
	border-bottom: 1px dashed var(--mp-theme-color, #F36C39);
	text-decoration: none;
}
`),
};
