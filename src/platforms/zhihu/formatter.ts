import type { MarkedExtension } from "marked";
import { escapeHtml } from "@/core/utils";

/**
 * 知乎专栏 marked 扩展。
 *
 * 与头条号同构：结构性 HTML + 极少 inline-style。
 * 知乎编辑器历史上用 Draft.js（block-level contenteditable），
 * 当前部分场景已切换到 ProseMirror；两者都依赖 ClipboardEvent paste 解析 HTML。
 */
export class ZhihuFormatter {
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
							// 知乎编辑器对 task list 支持有限，统一退化为段落 + 符号前缀
							const mark = checked ? "☑" : "☐";
							return `<li data-task="1">${mark} ${body}</li>`;
						}
						return `<li>${body}</li>`;
					},
					list({ ordered, start, items }) {
						const tag = ordered ? "ol" : "ul";
						const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
						const body = items.map((item: unknown) => this.listitem(item as never)).join("");
						if (!ordered && /^<li data-task="1">/.test(body) && !/<li(?! data-task)/.test(body)) {
							const lines = [...body.matchAll(/<li data-task="1">([\s\S]*?)<\/li>/g)]
								.map((m) => `<p>${m[1]}</p>`)
								.join("");
							return `${lines}\n`;
						}
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
