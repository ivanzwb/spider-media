import { escapeHtml } from "./utils";

interface MermaidGlobal {
	render(id: string, code: string): Promise<{ svg: string }>;
	initialize?(config: Record<string, unknown>): void;
}

/**
 * Mermaid → PNG 内嵌图（base64 data URL）。
 *
 * 利用 Obsidian 已加载的全局 mermaid 实例先渲染出 SVG，
 * 再用 canvas 栅格化成 PNG —— 微信公众号编辑器会过滤 inline <svg>，
 * 必须转成 <img> 才能在发布后保留图形。失败时退化为代码块。
 */
export class MermaidConverter {
	/** 渲染 HTML 中所有 .mp-mermaid 占位符 */
	async renderAll(html: string): Promise<string> {
		const placeholders = Array.from(
			html.matchAll(/<div class="mp-mermaid" data-mermaid="([^"]+)"><\/div>/g),
		);
		if (placeholders.length === 0) return html;

		let out = html;
		for (let i = 0; i < placeholders.length; i++) {
			const raw = placeholders[i][0];
			const code = decodeURIComponent(placeholders[i][1]);
			const replacement = await this.renderOne(code, i);
			out = out.replace(raw, replacement);
		}
		return out;
	}

	private async renderOne(code: string, index: number): Promise<string> {
		const mermaid = this.getMermaid();
		if (!mermaid) {
			console.warn("[spider-media] mermaid 未加载，回退为代码块");
			return this.fallback(code);
		}
		try {
			// 关键：保留 htmlLabels=true，mermaid 才会用浏览器实测宽度排版节点 —— 否则 CJK 文字
			// 会溢出节点框且无法居中。栅格化前再把 <foreignObject> 转成绝对定位的 <text>。
			mermaid.initialize?.({
				startOnLoad: false,
				flowchart: { htmlLabels: true, useMaxWidth: false },
				sequence: { useMaxWidth: false },
				gantt: { useMaxWidth: false },
				class: { useMaxWidth: false },
			});
			const { svg } = await mermaid.render(`mp-mermaid-${Date.now()}-${index}`, code);
			const sanitized = this.foreignObjectToText(svg);
			const png = await this.svgToPng(sanitized);
			if (!png) {
				return `<div class="mp-mermaid-rendered" style="text-align:center;margin:16px 0;">${sanitized}</div>`;
			}
			return `<p style="text-align:center;margin:16px 0;"><img src="${png.dataUrl}" alt="mermaid diagram" style="max-width:100%;width:${png.width}px;height:auto;display:inline-block;" /></p>`;
		} catch (err) {
			console.warn("[spider-media] mermaid 渲染失败", err);
			return this.fallback(code);
		}
	}

	/**
	 * 把 mermaid flowchart 用的 <foreignObject> 块替换成绝对定位的 SVG <text>。
	 * 解决两件事：
	 *   1. canvas 绘制含 foreignObject 的 SVG 会污染画布，toDataURL 抛 SecurityError
	 *   2. 直接丢弃 foreignObject 会让文字飘到 (0,0)，必须用 foreignObject 自带的
	 *      x/y/width/height 算出居中坐标，并按行拆分用 <tspan dy>
	 */
	private foreignObjectToText(svg: string): string {
		return svg.replace(
			/<foreignObject\s+([^>]*?)>([\s\S]*?)<\/foreignObject>/g,
			(_match, attrs: string, inner: string) => {
				const x = Number(/(?:^|\s)x="([\d.-]+)"/.exec(attrs)?.[1] ?? 0);
				const y = Number(/(?:^|\s)y="([\d.-]+)"/.exec(attrs)?.[1] ?? 0);
				const width = Number(/(?:^|\s)width="([\d.-]+)"/.exec(attrs)?.[1] ?? 0);
				const height = Number(/(?:^|\s)height="([\d.-]+)"/.exec(attrs)?.[1] ?? 0);

				// 拆行：mermaid 在 <div> 内用 <br> 或多 <span> 表达多行
				const text = String(inner)
					.replace(/<br\s*\/?>(\s*)/gi, "\n")
					.replace(/<\/p>\s*<p[^>]*>/gi, "\n")
					.replace(/<[^>]+>/g, "")
					.replace(/&nbsp;/g, " ")
					.replace(/&amp;/g, "&")
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.trim();
				if (!text) return "";

				const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
				const cx = x + width / 2;
				const cy = y + height / 2;
				const fontSize = 14;
				const lineHeight = fontSize * 1.25;
				const totalH = (lines.length - 1) * lineHeight;
				const firstY = cy - totalH / 2;

				const tspans = lines
					.map((line, i) => {
						const safe = line
							.replace(/&/g, "&amp;")
							.replace(/</g, "&lt;")
							.replace(/>/g, "&gt;");
						return `<tspan x="${cx}" y="${firstY + i * lineHeight}">${safe}</tspan>`;
					})
					.join("");
				return `<text text-anchor="middle" dominant-baseline="middle" font-size="${fontSize}" font-family="-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',Arial,sans-serif" fill="#333">${tspans}</text>`;
			},
		);
	}

	private fallback(code: string): string {
		return `<pre class="mp-mermaid-fallback"><code>${escapeHtml(code)}</code></pre>`;
	}

	/** SVG 字符串 → PNG data URL（基于 canvas 栅格化） */
	private async svgToPng(svg: string): Promise<{ dataUrl: string; width: number } | null> {
		try {
			// 兜底加上 xmlns，否则 Image 加载会失败
			let normalized = svg.trim();
			if (!/xmlns=/.test(normalized)) {
				normalized = normalized.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
			}
			const { width, height } = this.parseSvgSize(normalized);
			const scale = window.devicePixelRatio > 1 ? 2 : 1.5; // 提高清晰度
			// 用 data URL 而非 Blob URL：Blob URL 在 Electron/Chromium 里会被当成
			// 跨域请求（无 CORS 响应头），导致画布被污染、toDataURL 抛 SecurityError。
			// 同时不要给 <img> 设置 crossOrigin，data URL 是 same-origin 的。
			const utf8 = new TextEncoder().encode(normalized);
			let bin = "";
			for (let i = 0; i < utf8.length; i++) bin += String.fromCharCode(utf8[i]);
			const dataUrl = `data:image/svg+xml;base64,${btoa(bin)}`;
			const img = await this.loadImage(dataUrl);
			const canvas = activeDocument.createElement("canvas");
			canvas.width = Math.max(1, Math.round(width * scale));
			canvas.height = Math.max(1, Math.round(height * scale));
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			ctx.fillStyle = "#ffffff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
			const pngDataUrl = canvas.toDataURL("image/png");
			return { dataUrl: pngDataUrl, width: Math.round(width) };
		} catch (err) {
			console.warn("[spider-media] SVG → PNG 失败", err);
			return null;
		}
	}

	private loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error(`Failed to load image from ${src.slice(0, 64)}…`));
			img.src = src;
		});
	}

	private parseSvgSize(svg: string): { width: number; height: number } {
		const widthAttr = svg.match(/<svg[^>]*\swidth="([\d.]+)(?:px)?"/);
		const heightAttr = svg.match(/<svg[^>]*\sheight="([\d.]+)(?:px)?"/);
		if (widthAttr && heightAttr) {
			return { width: Number(widthAttr[1]), height: Number(heightAttr[1]) };
		}
		const viewBox = svg.match(/<svg[^>]*\sviewBox="[\d.\s-]*?\s([\d.]+)\s([\d.]+)"/);
		if (viewBox) {
			return { width: Number(viewBox[1]), height: Number(viewBox[2]) };
		}
		return { width: 800, height: 600 };
	}

	private getMermaid(): MermaidGlobal | null {
		const w = window as unknown as { mermaid?: MermaidGlobal };
		return w.mermaid ?? null;
	}
}

