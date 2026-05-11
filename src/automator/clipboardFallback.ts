import { Notice } from "obsidian";
import type { PublishResult } from "@/platforms/base";

/**
 * 浏览器自动化失败时的兜底：将渲染好的 HTML 复制到剪贴板。
 *
 * 微信公众号编辑器支持直接粘贴 HTML（保留样式），
 * 用户在浏览器中手动打开后台 → 粘贴即可发布。
 */
export async function clipboardFallback(
	html: string,
	title: string,
	reason: string,
): Promise<PublishResult> {
	try {
		await navigator.clipboard.writeText(html);
		new Notice(`已复制 HTML 到剪贴板，请手动粘贴到平台编辑器。\n标题：${title}`, 8000);
		return {
			success: true,
			stage: "fallback",
			message: `${reason}；HTML 已复制到剪贴板。`,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		new Notice(`剪贴板写入失败：${msg}`, 10000);
		return {
			success: false,
			stage: "fallback",
			message: `${reason}；剪贴板写入也失败：${msg}`,
		};
	}
}
