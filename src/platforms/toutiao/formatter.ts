import type { MarkedExtension } from "marked";
import { escapeHtml } from "@/core/utils";

/**
 * 头条号 marked 扩展。
 *
 * 设计与微信一致：只输出结构性 HTML + 极少结构性 inline-style，
 * 视觉样式交给模板 CSS（juice 内联）。头条号编辑器（基于 tiptap/ProseMirror）
 * 对 inline style 容忍度比公众号高，所以模板可以更自由。
 */
export class ToutiaoFormatter {
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
						const lines = text.split("\n").map((l) => escapeHtml(l) || "&nbsp;");
						const html = lines.join("<br/>");
						return `<pre style="white-space:pre-wrap;word-break:break-all;"><code${langAttr} style="white-space:pre-wrap;">${html}</code></pre>\n`;
					},
					codespan({ text }) {
						return `<code>${escapeHtml(text)}</code>`;
					},
					listitem({ tokens, task, checked }) {
						let body = this.parser.parse(tokens).trim();
						body = body.replace(/<input[^>]*type="checkbox"[^>]*\/?>(\s*)/gi, "");
						const allParas = [...body.matchAll(/<p>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
						if (allParas.length > 0 && allParas.join("").length === body.replace(/<\/?p>/g, "").length) {
							body = allParas.join("<br/><br/>");
						}
						if (task) {
							// 用占位元素标记 task 项，list 渲染时识别后输出为段落而非 <li>。
							// 头条号 ProseMirror 的 listItem 节点会强制重渲圆点，inline style 失效。
							const mark = checked ? "☑" : "☐";
							return `<li data-task="1">${mark} ${body}</li>`;
						}
						return `<li>${body}</li>`;
					},
					list({ ordered, start, items }) {
						const tag = ordered ? "ol" : "ul";
						const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
						const body = items.map((item: unknown) => this.listitem(item as never)).join("");
						// 全部为 task 项 → 输出为普通段落（避开 ProseMirror 的 listItem schema）
						if (!ordered && /^<li data-task="1">/.test(body) && !/<li(?! data-task)/.test(body)) {
							const lines = [...body.matchAll(/<li data-task="1">([\s\S]*?)<\/li>/g)]
								.map((m) => `<p>${m[1]}</p>`)
								.join("");
							return `${lines}\n`;
						}
						// 混合或纯普通 list：去掉 task 标记 attr，正常 li
						const cleaned = body.replace(/ data-task="1"/g, "");
						return `<${tag}${startAttr}>${cleaned}</${tag}>\n`;
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
