import type { MarkedExtension } from "marked";
import { escapeHtml } from "@/core/utils";

/**
 * 小红书创作中心 marked 扩展。
 *
 * 小红书目前主战场是「图文笔记」，标题最多 20 字，正文以纯文本/换行为主，
 * 富文本支持非常有限（编辑器实际上是受控的多行 textarea，不接受标签）。
 * 这里输出的 HTML 主要服务于：
 *   - PlatformEditorView 的预览（保留视觉结构）；
 *   - 注入路径退化为 textContent（XiaohongshuBrowserView 内部完成）；
 * 因此结构性 HTML + 极少 inline-style 即可，模板侧再叠加品牌色。
 */
export class XiaohongshuFormatter {
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
						// 小红书长文编辑器在跨域 iframe 内，外部无法把图片注入到 ProseMirror。
						// 因此代码块降级为带语言标签的等宽预格式文本，由 htmlToText 在注入时
						// 还原为带缩进的换行段落。
						const langAttr = lang ? ` data-lang="${escapeHtml(lang)}"` : "";
						return `<pre${langAttr}><code>${escapeHtml(text)}</code></pre>\n`;
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
							const mark = checked ? "☑" : "☐";
							return `<li data-task="1">${mark} ${body}</li>`;
						}
						return `<li>${body}</li>`;
					},
					list({ ordered, start, items }) {
						const tag = ordered ? "ol" : "ul";
						const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
						const body = items.map((item: unknown) => this.listitem(item as never)).join("");
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
