import juice from "juice";
import type { CodeTheme, FormatTweaks, HeadingStyle } from "@/platforms/base";

export interface PostProcessOptions {
	template: string;
	templateStyles: string;
	tweaks: FormatTweaks;
}

/** HTML 后处理：模板包装 + CSS 内联 */
export class PostProcessor {
	process(contentHtml: string, options: PostProcessOptions): string {
		const tweakCss = this.buildTweakCss(options.tweaks);
		const overrideCss = [
			this.buildHeadingOverride(options.tweaks.headingStyle, options.tweaks.themeColor),
			this.buildCodeOverride(options.tweaks.codeTheme),
		]
			.filter(Boolean)
			.join("\n");

		let output = options.template
			.replace("{{CONTENT}}", contentHtml)
			.replace("{{TWEAK_STYLES}}", `<style>${tweakCss}\n${overrideCss}</style>`);

		try {
			output = juice(output, {
				removeStyleTags: false,
				preserveImportant: true,
				extraCss: `${options.templateStyles}\n${tweakCss}\n${overrideCss}`,
			});
		} catch (err) {
			console.warn("[spider-media] juice 内联失败，返回原始 HTML", err);
		}
		return this.trimLeading(this.glueCjkPunctuation(this.compactLists(output)));
	}

	/**
	 * 去掉首尾多余空白与空块。
	 * 微信 ProseMirror 在 set_content 时，如果首个块是 <section>...</section>，
	 * 且 section 内开头有 <style> 或纯空白文本节点，会自动补一个空 <p>，
	 * 造成正文开头多一行空白。这里直接清掉。
	 */
	private trimLeading(html: string): string {
		let s = html.trim();
		// 1) 把 <section> 内紧跟开头的 <style>...</style> 后续空白去掉
		s = s.replace(/(<section[^>]*>)\s*(<style[\s\S]*?<\/style>)\s*/i, "$1$2");
		// 2) 移除 section 开头的空白文本节点 / 空段落
		s = s.replace(/(<section[^>]*>(?:<style[\s\S]*?<\/style>)?)\s*(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+/i, "$1");
		// 3) 同样处理结尾空段落
		s = s.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+(<\/section>)/i, "$1");
		return s;
	}

	/**
	 * 压实 ol/ul/li 之间的空白文本节点。
	 * 微信编辑器的 ProseMirror schema 在 list 容器里只接受 li 子节点，
	 * 浏览器解析 `<ol>\n  <li>...</li>\n</ol>` 时产生的空白 text node 会被
	 * normalize 成额外的空 li，造成"序号在、内容空白"的间隔现象。
	 */
	private compactLists(html: string): string {
		return html
			.replace(/(<\/?(?:ol|ul|li)[^>]*>)\s+(?=<)/g, "$1")
			.replace(/>\s+(<\/(?:ol|ul|li)>)/g, ">$1");
	}

	/**
	 * 把紧跟在 </strong>/</em>/</a>/</code> 后的 CJK 标点收进对应标签内，
	 * 避免微信编辑器在标签边界换行（典型现象：`**讲解**：` 的冒号被甩到下一行）。
	 */
	private glueCjkPunctuation(html: string): string {
		const cjkPunct = "：。，、；！？）】》」』";
		const re = new RegExp(`</(strong|em|a|code)>([${cjkPunct}]+)`, "g");
		return html.replace(re, (_m, tag, punct) => `${punct}</${tag}>`);
	}

	private buildTweakCss(t: FormatTweaks): string {
		return `
.mp-article {
	font-size: ${t.fontSize}px;
	line-height: ${t.lineHeight};
	letter-spacing: ${t.letterSpacing}px;
	padding: ${t.pagePadding}px;
	--mp-theme-color: ${t.themeColor};
}
.mp-article p {
	margin-bottom: ${t.paragraphSpacing}px;
	${t.firstLineIndent ? "text-indent: 2em;" : ""}
}
.mp-article img {
	border-radius: ${t.imageRadius}px;
	max-width: 100%;
}
`.trim();
	}

	private buildHeadingOverride(style: HeadingStyle, theme: string): string {
		switch (style) {
			case "numbered":
				// CSS counter 在公众号被剥离 class 后会失效，这里用纯样式 + 重号靠模板默认
				return `
.mp-article h2 {
	border-left: 4px solid ${theme};
	background: linear-gradient(90deg, ${theme}1a, transparent);
	padding: 4px 10px;
}
.mp-article h3 {
	color: ${theme};
	padding-left: 8px;
	border-left: 2px solid ${theme};
}`.trim();
			case "underline":
				return `
.mp-article h2 {
	border-bottom: 2px solid ${theme};
	padding-bottom: 4px;
	background: transparent;
}
.mp-article h3 {
	color: ${theme};
	border-bottom: 1px dashed ${theme};
	display: inline-block;
	padding-bottom: 2px;
}`.trim();
			case "bordered":
				return `
.mp-article h2 {
	border: 1px solid ${theme};
	border-radius: 4px;
	padding: 4px 10px;
	display: inline-block;
	background: transparent;
}
.mp-article h3 {
	color: ${theme};
	border-left: 3px solid ${theme};
	padding-left: 8px;
}`.trim();
			case "template":
			default:
				return "";
		}
	}

	private buildCodeOverride(theme: CodeTheme): string {
		const themes: Record<Exclude<CodeTheme, "template">, { bg: string; fg: string; border?: string }> = {
			dark: { bg: "#2d2d2d", fg: "#f8f8f2" },
			light: { bg: "#FAFAFA", fg: "#24292E", border: "#E1E4E8" },
			github: { bg: "#F6F8FA", fg: "#24292E", border: "#E1E4E8" },
			dracula: { bg: "#282A36", fg: "#F8F8F2" },
		};
		if (theme === "template") return "";
		const c = themes[theme];
		const border = c.border ? `border: 1px solid ${c.border};` : "border: none;";
		return `
.mp-article pre {
	background: ${c.bg};
	color: ${c.fg};
	${border}
}
.mp-article pre code {
	background: transparent;
	color: ${c.fg};
}`.trim();
	}
}
