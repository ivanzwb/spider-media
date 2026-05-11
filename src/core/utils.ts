/** 简单 HTML 转义 */
export function escapeHtml(input: string): string {
	return input
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

/** ArrayBuffer → base64 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
	let binary = "";
	const bytes = new Uint8Array(buffer);
	const chunk = 0x8000;
	for (let i = 0; i < bytes.length; i += chunk) {
		binary += String.fromCharCode.apply(
			null,
			Array.from(bytes.subarray(i, i + chunk)),
		);
	}
	return btoa(binary);
}

/** 简单 YAML frontmatter 提取 */
export interface FrontmatterResult {
	frontmatter: Record<string, string>;
	body: string;
}

export function parseFrontmatter(markdown: string): FrontmatterResult {
	const match = markdown.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!match) return { frontmatter: {}, body: markdown };
	const fm: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
		if (m) fm[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
	}
	return { frontmatter: fm, body: markdown.slice(match[0].length) };
}
