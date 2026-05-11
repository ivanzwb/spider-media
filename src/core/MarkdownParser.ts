import { Marked, type MarkedExtension } from "marked";

export interface ParserOptions {
	platformExtensions?: MarkedExtension[];
}

/**
 * 平台无关的 Markdown 解析器。
 *
 * 全局负责: Mermaid 占位符化（实际渲染由 MermaidConverter 后处理替换）。
 * 平台特定的 renderer 通过 platformExtensions 注入。
 */
export class MarkdownParser {
	private marked: Marked;

	constructor(options: ParserOptions = {}) {
		this.marked = new Marked();
		this.marked.use(this.createMermaidExtension());
		if (options.platformExtensions) {
			for (const ext of options.platformExtensions) {
				this.marked.use(ext);
			}
		}
	}

	async parse(markdown: string): Promise<string> {
		const result = await this.marked.parse(markdown, { async: true });
		return typeof result === "string" ? result : await result;
	}

	/**
	 * 将 ```mermaid 代码块转为占位符 <div data-mermaid="..."></div>
	 * 后续由 MermaidConverter 扫描并替换为 <img>。
	 */
	private createMermaidExtension(): MarkedExtension {
		return {
			extensions: [
				{
					name: "mermaid",
					level: "block",
					start(src: string): number | undefined {
						const idx = src.indexOf("```mermaid");
						return idx < 0 ? undefined : idx;
					},
					tokenizer(src: string) {
						const match = src.match(/^```mermaid\n([\s\S]*?)```\n?/);
						if (!match) return undefined;
						return {
							type: "mermaid",
							raw: match[0],
							code: match[1],
						};
					},
					renderer(token) {
						const code = (token as unknown as { code: string }).code;
						const encoded = encodeURIComponent(code);
						return `<div class="mp-mermaid" data-mermaid="${encoded}"></div>\n`;
					},
				},
			],
		};
	}
}
