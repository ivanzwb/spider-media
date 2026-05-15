/**
 * 代码块 → PNG 图片渲染器。
 *
 * 小红书创作中心编辑器只接受纯文本，无法保留代码块的等宽字体 / 缩进 / 高亮。
 * 因此发布到小红书时把代码块栅格化成 PNG，再由 BrowserView 注入脚本
 * 通过文件 input 自动上传到笔记图片区。
 *
 * Formatter 端先把 ```code``` 输出为占位符：
 *   <div class="mp-codeblock" data-code="<encoded>" data-lang="<lang>"></div>
 * 再由本 Renderer 扫描占位符并替换为 <img class="mp-codeblock-img" data-codeblock-img="1" src="data:..." />
 */
export interface CodeBlockImageOptions {
	/** 字体大小，单位 px。默认 14 */
	fontSize?: number;
	/** 行高倍数。默认 1.5 */
	lineHeight?: number;
	/** 图片内边距，单位 px。默认 16 */
	padding?: number;
	/** 图片最大宽度（CSS px，会乘 devicePixelRatio）。默认 720 */
	maxWidth?: number;
	/** 背景色。默认 #282c34（One Dark） */
	background?: string;
	/** 文字颜色。默认 #abb2bf */
	foreground?: string;
	/** 语言标签颜色。默认 #61afef */
	langColor?: string;
}

const DEFAULT_OPTIONS: Required<CodeBlockImageOptions> = {
	fontSize: 14,
	lineHeight: 1.5,
	padding: 16,
	maxWidth: 720,
	background: "#282c34",
	foreground: "#abb2bf",
	langColor: "#61afef",
};

export class CodeBlockImageRenderer {
	constructor(private opts: CodeBlockImageOptions = {}) {}

	/** 扫描 HTML 中所有 .mp-codeblock 占位符，替换为渲染好的 <img> */
	async renderAll(html: string): Promise<string> {
		const re = /<div class="mp-codeblock" data-code="([^"]*)"(?: data-lang="([^"]*)")?><\/div>/g;
		const matches = Array.from(html.matchAll(re));
		if (matches.length === 0) return html;

		let out = html;
		for (let i = 0; i < matches.length; i++) {
			const raw = matches[i][0];
			const code = decodeURIComponent(matches[i][1] ?? "");
			const lang = matches[i][2] ? decodeURIComponent(matches[i][2]) : "";
			const replacement = await this.renderOne(code, lang, i);
			out = out.replace(raw, replacement);
		}
		return out;
	}

	private async renderOne(code: string, lang: string, index: number): Promise<string> {
		try {
			const png = this.codeToPng(code, lang);
			if (!png) {
				// 渲染失败，退化为转义后的 <pre>
				return this.fallback(code, lang);
			}
			return `<p class="mp-codeblock-wrap" style="text-align:center;margin:16px 0;"><img class="mp-codeblock-img" data-codeblock-img="1" data-index="${index}" src="${png.dataUrl}" alt="代码片段${lang ? "(" + lang + ")" : ""}" style="max-width:100%;width:${png.cssWidth}px;height:auto;display:inline-block;" /></p>\n`;
		} catch (err) {
			console.warn("[spider-media] 代码块栅格化失败", err);
			return this.fallback(code, lang);
		}
	}

	private fallback(code: string, lang: string): string {
		const langAttr = lang ? ` class="language-${this.escape(lang)}"` : "";
		return `<pre><code${langAttr}>${this.escape(code)}</code></pre>`;
	}

	private codeToPng(code: string, lang: string): { dataUrl: string; cssWidth: number } | null {
		const o = { ...DEFAULT_OPTIONS, ...this.opts };
		const lines = code.replace(/\r\n/g, "\n").replace(/\t/g, "    ").split("\n");
		// 去掉尾部空行
		while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
		if (lines.length === 0) lines.push("");

		const dpr = Math.max(1, window.devicePixelRatio || 1);
		const fontFamily =
			'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';
		const font = `${o.fontSize}px ${fontFamily}`;

		// 1) 量测文本宽度，决定 canvas 宽度
		const measure = activeDocument.createElement("canvas");
		const mctx = measure.getContext("2d");
		if (!mctx) return null;
		mctx.font = font;

		// 自动换行：超过 maxContentWidth 的行按字符切分
		const maxContentWidth = o.maxWidth - o.padding * 2 - 40; // 行号区 ~40px
		const wrapped: string[] = [];
		for (const line of lines) {
			if (mctx.measureText(line).width <= maxContentWidth) {
				wrapped.push(line);
				continue;
			}
			// 按字符贪心换行
			let cur = "";
			for (const ch of line) {
				if (mctx.measureText(cur + ch).width > maxContentWidth) {
					wrapped.push(cur);
					cur = ch;
				} else {
					cur += ch;
				}
			}
			if (cur) wrapped.push(cur);
		}

		// 2) 计算实际宽度（语言标签也可能更宽）
		const headerH = lang ? o.fontSize * 1.6 : 0;
		const contentH = wrapped.length * o.fontSize * o.lineHeight;
		const lineNumberWidth = 40;
		const maxLineW = wrapped.reduce((m, l) => Math.max(m, mctx.measureText(l).width), 0);
		const cssWidth = Math.min(
			o.maxWidth,
			Math.ceil(o.padding * 2 + lineNumberWidth + maxLineW + 8),
		);
		const cssHeight = Math.ceil(o.padding * 2 + headerH + contentH);

		// 3) 绘制
		const canvas = activeDocument.createElement("canvas");
		canvas.width = Math.max(1, Math.round(cssWidth * dpr));
		canvas.height = Math.max(1, Math.round(cssHeight * dpr));
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.scale(dpr, dpr);

		// 背景 + 圆角
		const radius = 8;
		ctx.fillStyle = o.background;
		this.roundRect(ctx, 0, 0, cssWidth, cssHeight, radius);
		ctx.fill();

		let y = o.padding;
		ctx.font = font;
		ctx.textBaseline = "top";

		// 语言标签
		if (lang) {
			ctx.fillStyle = o.langColor;
			ctx.fillText(lang.toUpperCase(), o.padding, y);
			y += o.fontSize * 1.6;
		}

		// 行号区背景
		ctx.fillStyle = this.darken(o.background, 0.06);
		ctx.fillRect(o.padding, y, lineNumberWidth, contentH);

		// 行号
		ctx.fillStyle = this.lighten(o.foreground, -0.25);
		for (let i = 0; i < wrapped.length; i++) {
			const num = String(i + 1);
			const numW = ctx.measureText(num).width;
			ctx.fillText(num, o.padding + lineNumberWidth - 8 - numW, y + i * o.fontSize * o.lineHeight);
		}

		// 代码文本
		ctx.fillStyle = o.foreground;
		const codeX = o.padding + lineNumberWidth + 8;
		for (let i = 0; i < wrapped.length; i++) {
			ctx.fillText(wrapped[i], codeX, y + i * o.fontSize * o.lineHeight);
		}

		const dataUrl = canvas.toDataURL("image/png");
		return { dataUrl, cssWidth };
	}

	private roundRect(
		ctx: CanvasRenderingContext2D,
		x: number,
		y: number,
		w: number,
		h: number,
		r: number,
	): void {
		ctx.beginPath();
		ctx.moveTo(x + r, y);
		ctx.lineTo(x + w - r, y);
		ctx.quadraticCurveTo(x + w, y, x + w, y + r);
		ctx.lineTo(x + w, y + h - r);
		ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
		ctx.lineTo(x + r, y + h);
		ctx.quadraticCurveTo(x, y + h, x, y + h - r);
		ctx.lineTo(x, y + r);
		ctx.quadraticCurveTo(x, y, x + r, y);
		ctx.closePath();
	}

	private darken(hex: string, amt: number): string {
		return this.lighten(hex, -Math.abs(amt));
	}

	private lighten(hex: string, amt: number): string {
		const m = /^#([0-9a-f]{6})$/i.exec(hex);
		if (!m) return hex;
		const n = parseInt(m[1], 16);
		const r = Math.max(0, Math.min(255, ((n >> 16) & 0xff) + Math.round(255 * amt)));
		const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + Math.round(255 * amt)));
		const b = Math.max(0, Math.min(255, (n & 0xff) + Math.round(255 * amt)));
		return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
	}

	private escape(s: string): string {
		return s
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#39;");
	}
}
