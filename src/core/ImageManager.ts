import type { Vault, TFile } from "obsidian";
import { arrayBufferToBase64 } from "./utils";

export interface ImageManagerOptions {
	/** 小于此阈值 (KB) 的图片转 base64 内嵌 */
	inlineThresholdKB: number;
	/** vault 内当前笔记目录 (用于解析相对路径) */
	noteDir: string;
}

/**
 * 解析 Markdown 中的图片引用：
 * - http(s) 直链 → 透传
 * - data: URI → 透传
 * - vault 内相对/绝对路径 → 读文件 → base64（小图）或保留路径（大图）
 *
 * 大图上传到图床的逻辑暂未实现，留接口位。
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
		const sizeKB = buf.byteLength / 1024;
		if (sizeKB <= this.options.inlineThresholdKB) {
			const ext = file.extension.toLowerCase();
			const mime = ext === "svg" ? "image/svg+xml" : `image/${ext === "jpg" ? "jpeg" : ext}`;
			return `data:${mime};base64,${arrayBufferToBase64(buf)}`;
		}
		return src;
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

	private findFile(src: string): TFile | null {
		const decoded = decodeURIComponent(src);
		const candidates = [decoded, `${this.options.noteDir}/${decoded}`.replace(/^\/+/, "")];
		for (const path of candidates) {
			const file = this.vault.getFileByPath(path);
			if (file) return file;
		}
		return null;
	}
}
