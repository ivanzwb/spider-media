import type { Vault, TFile } from "obsidian";
import { arrayBufferToBase64 } from "./utils";

export interface ImageManagerOptions {
	/** vault 内当前笔记目录 (用于解析相对路径) */
	noteDir: string;
}

/**
 * 解析 Markdown 中的图片引用：
 * - http(s) 直链 → 透传
 * - data: URI → 透传
 * - vault 内相对/绝对路径 → 读文件 → base64 内嵌
 *
 * 注意：所有图片都转为 base64 内嵌，不保留原始路径。
 * 因为 Obsidian 预览面板没有 base URL 可以解析相对路径，
 * 且内嵌 base64 在微信 WebView 中也能正常显示。
 * 将来如需 CDN 上传，可在 resolveAll 加入上传管道。
 */
export class ImageManager {
	constructor(private vault: Vault, private options: ImageManagerOptions) {}

	async resolve(src: string): Promise<string> {
		if (!src) return src;
		if (/^(https?:|data:)/i.test(src)) return src;

		const file = this.findFile(src);
		if (!file) {
			console.warn(`[spider-media] 图片未找到: ${src}`);
			return src;
		}

		const buf = await this.vault.readBinary(file);
		const ext = file.extension.toLowerCase();
		const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
		return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
	}

	/** 扫描 HTML 中的 <img src="..."> 并替换 */
	async resolveAll(html: string): Promise<string> {
		const matches = Array.from(html.matchAll(/<img\s+[^>]*src="([^"]+)"[^>]*>/g));
		let out = html;
		for (const match of matches) {
			const original = match[1];
			const resolved = await this.resolve(original);
			if (resolved !== original) {
				out = out.split(`src="${original}"`).join(`src="${resolved}"`);
			}
		}
		return out;
	}

	/** 标准化 vault 路径：去掉 . 前缀、多余分隔符 */
	private normalizePath(p: string): string {
		return p
			.replace(/^[./]+/, "")       // 去掉开头的 ./ 或 ../..
			.replace(/[/\\]+/g, "/")     // 统一分隔符
			.replace(/^\/+|\/+$/g, "")   // 去掉首尾 /
			.trim();
	}

	private findFile(src: string): TFile | null {
		const decoded = decodeURIComponent(src);
		const nd = this.options.noteDir.replace(/^\/+|\/+$/g, "");
		const cleaned = this.normalizePath(decoded);
		const candidates: string[] = [];

		// 1. 标准化后的路径（去掉了 ./ 前缀等）
		if (cleaned) candidates.push(cleaned);

		// 2. 原样路径（可能已是 vault 绝对路径）
		if (decoded !== cleaned) candidates.push(decoded);

		// 3. 笔记目录 + 标准化路径
		if (nd) {
			candidates.push(`${nd}/${cleaned}`);
			// 4. 仅文件名在笔记目录下
			const basename = cleaned.replace(/^.*[/\\]/, "");
			if (basename !== cleaned) {
				candidates.push(`${nd}/${basename}`);
			}
		}

		// 5. 仅文件名在 vault 根目录
		const basename2 = cleaned.replace(/^.*[/\\]/, "");
		if (basename2 !== cleaned && !candidates.includes(basename2)) {
			candidates.push(basename2);
		}

		// 去重后依次查找
		const seen = new Set<string>();
		for (const path of candidates) {
			if (seen.has(path)) continue;
			seen.add(path);
			const file = this.vault.getFileByPath(path);
			if (file) return file;
		}
		return null;
	}
}
