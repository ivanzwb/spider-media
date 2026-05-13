import { Marked, type MarkedExtension } from "marked";

export interface ParserOptions {
	platformExtensions?: MarkedExtension[];
}

/** 常见图片扩展名集合（不包含后缀分隔符 .） */
export const IMAGE_EXTENSIONS = new Set([
	"png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico",
]);

/**
 * 将 Obsidian `![[path|alt]]` 图片 wikilink 转换为标准 Markdown 图片语法。
 *
 * 支持的语法：
 *   ![[image.png]]          →  ![image](image.png)
 *   ![[attachments/x.jpg]]  →  ![attachments/x.jpg](attachments/x.jpg)
 *   ![[image.png|alt text]] →  ![alt text](image.png)
 *   ![[image.png|200]]      →  ![image](image.png)     # 尺寸参数丢弃
 *   ![[image.png|200x300]]  →  ![image](image.png)     # 尺寸参数丢弃
 *
 * 仅对图片扩展名做转换，非图片 wikilink（如 [[note]]）保持不变。
 */
export function convertImageWikilinks(text: string): string {
	return text.replace(
		/!\[\[([^\[\]]+?)(?:\|([^\[\]]*?))?\]\]/g,
		(_match: string, link: string, alt: string | undefined): string => {
			const altText = (alt ?? "").trim() || link.replace(/.*[/\\]/, "").replace(/\.[^.]+$/, "");
			const pipeIdx = link.indexOf("|");
			const path = pipeIdx > 0 ? link.slice(0, pipeIdx) : link;
			const ext = path.split(".").pop()?.toLowerCase() ?? "";
			if (IMAGE_EXTENSIONS.has(ext)) {
				return `![${altText}](${encodeURI(path)})`;
			}
			// 非图片 wikilink，原样保留
			return _match;
		},
	);
}

/**
 * 将标准 Markdown 图片 `![alt](url)` / `![](url)` 中的空格编码为 %20。
 *
 * marked v18 不处理图片 URL 中的空格 —— `![](a b.png)` 会原样输出而非解析为 `<img>`。
 * 此函数在 marked 解析前将空格转义，保证后续 ImageManager 的 decodeURIComponent 能还原。
 */
export function encodeImageUrlSpaces(text: string): string {
	return text.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		(_match: string, alt: string, url: string): string => {
			return `![${alt}](${url.replace(/ /g, "%20")})`;
		},
	);
}

/**
 * 平台无关的 Markdown 解析器。
 *
 * 全局负责: Mermaid 占位符化（实际渲染由 MermaidConverter 后处理替换）。
 * 平台特定的 renderer 通过 platformExtensions 注入。
 *
 * 预处理：自动将 Obsidian `![[wikilink]]` 图片语法转为标准 Markdown 图片。
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
		const preprocessed = encodeImageUrlSpaces(convertImageWikilinks(markdown));
		const result = await this.marked.parse(preprocessed, { async: true });
		return result;
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
