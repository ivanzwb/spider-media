import type { MarkedExtension } from "marked";
import { escapeHtml } from "@/core/utils";

/**
 * 微信公众号 marked 扩展。
 *
 * 设计：只输出**结构性** HTML 与少量结构性 inline-style（max-width、display 等），
 * 视觉色彩 / 字号 / 边框等全部交给 Template CSS（经 juice 内联到元素上）。
 * 这样切换模板才能产生真正不同的观感。
 */
export class WeChatFormatter {
	getExtensions(): MarkedExtension[] {
		return [
			{
				renderer: {
					heading({ tokens, depth }) {
						const text = this.parser.parseInline(tokens);
						return `<h${depth}>${text}</h${depth}>\n`;
					},
					paragraph({ tokens }) {
						const text = this.parser.parseInline(tokens);
						return `<p>${text}</p>\n`;
					},
					blockquote({ tokens }) {
						const body = this.parser.parse(tokens);
						return `<blockquote>${body}</blockquote>\n`;
					},
					code({ text, lang }) {
						const langAttr = lang ? ` class="language-${escapeHtml(lang)}"` : "";
						// 微信编辑器会把 <pre><code> 内的纯文本换行折叠成空格。
						// 解决：把每行用 <br/> 拼接，外层强制 white-space: pre-wrap。
						const lines = text.split("\n").map((l) => escapeHtml(l) || "&nbsp;");
						const html = lines.join("<br/>");
						return `<pre style="white-space:pre-wrap;word-break:break-all;"><code${langAttr} style="white-space:pre-wrap;">${html}</code></pre>\n`;
					},
					codespan({ text }) {
						return `<code>${escapeHtml(text)}</code>`;
					},
					listitem({ tokens, task, checked }) {
						// 注意：marked GFM 已在 tokens 首位放了 checkbox token，
						// 默认会渲染成 <input>，但 <input> 不在公众号白名单。
						// 这里把渲染后的 <input> 去掉，改用 ☐/☑ 字符显示。
						let body = this.parser.parse(tokens).trim();
						body = body.replace(/<input[^>]*type="checkbox"[^>]*\/?>(\s*)/gi, "");
						const allParas = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
						if (allParas.length > 0 && allParas.join("").length === body.replace(/<\/?p>/g, "").length) {
							body = allParas.join("<br/><br/>");
						}
						const prefix = task ? `${checked ? "☑" : "☐"} ` : "";
						// task 项隐藏 list 项标记（圆点/数字），只保留 ☐/☑ 与文本，对齐 Obsidian 视觉。
						const liStyle = task ? ` style="list-style:none;margin-left:-1.2em;"` : "";
						return `<li${liStyle}>${prefix}${body}</li>`;
					},
					list({ ordered, start, items }) {
						// 紧凑输出，li 之间不留 \n，避免 ProseMirror 把空白文本节点 normalize 成空 li。
						const tag = ordered ? "ol" : "ul";
						const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
						const body = items.map((item: unknown) => this.listitem(item as never)).join("");
						return `<${tag}${startAttr}>${body}</${tag}>\n`;
					},
					link({ href, title, tokens }) {
						const text = this.parser.parseInline(tokens);
						const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
						return `<a href="${escapeHtml(href)}"${titleAttr}>${text}</a>`;
					},
					image({ href, title, text }) {
						const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
						return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text ?? "")}" style="max-width:100%;display:block;margin:12px auto;"${titleAttr} />`;
					},
					hr() {
						return `<hr />\n`;
					},
				},
			},
		];
	}
}

