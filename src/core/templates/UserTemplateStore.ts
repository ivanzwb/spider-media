import type { TemplatePack, TemplatePackExport } from "./types";
import { DEFAULT_TEMPLATE_TOKENS } from "./types";
import { BUILTIN_PACKS, builtinPackIds } from "./builtinPacks";
import { Notice } from "obsidian";

/**
 * 用户模板 CRUD + 导入/导出。
 *
 * 注意：不负责持久化到磁盘 —— 调用方（SettingsTab 或 TemplateManagerModal）
 * 完成修改后通过 saveSettings() 写入。
 */
export class UserTemplateStore {
	constructor(
		private userPacks: TemplatePack[],
		private onChanged: (packs: TemplatePack[]) => void,
	) {}

	// ── 读取 ───────────────────────────────────────────────

	getAll(): TemplatePack[] {
		return [...this.userPacks];
	}

	getById(id: string): TemplatePack | undefined {
		return this.userPacks.find((p) => p.id === id);
	}

	/** 返回所有可用 packs（builtin + user），user 优先覆盖同名 */
	getAllAvailable(): TemplatePack[] {
		const builtin = BUILTIN_PACKS.filter((b) => !this.userPacks.some((u) => u.id === b.id));
		return [...builtin, ...this.userPacks];
	}

	// ── 创建 ───────────────────────────────────────────────

	/** 基于默认 tokens 或克隆已有 pack 创建新模板 */
	create(source?: TemplatePack): TemplatePack {
		const baseId = source
			? `${source.id}-copy`
			: "my-template";
		const id = this.uniqueId(baseId);
		const pack: TemplatePack = {
			id,
			name: source ? `${source.name} (副本)` : "我的模板",
			category: source?.category ?? "custom",
			source: "user",
			tokens: source
				? { ...source.tokens }
				: { ...DEFAULT_TEMPLATE_TOKENS, linkColor: DEFAULT_TEMPLATE_TOKENS.linkColor || DEFAULT_TEMPLATE_TOKENS.themeColor },
			overrides: {},
		};
		this.userPacks = [...this.userPacks, pack];
		this.onChanged(this.userPacks);
		return pack;
	}

	// ── 更新 ───────────────────────────────────────────────

	update(id: string, patch: Partial<TemplatePack>): TemplatePack | undefined {
		const idx = this.userPacks.findIndex((p) => p.id === id);
		if (idx === -1) return undefined;
		const updated = { ...this.userPacks[idx], ...patch, id, source: "user" as const };
		// 不允许覆盖 id
		if (patch.id && patch.id !== id) {
			updated.id = this.uniqueId(patch.id);
		}
		this.userPacks = [
			...this.userPacks.slice(0, idx),
			updated,
			...this.userPacks.slice(idx + 1),
		];
		this.onChanged(this.userPacks);
		return updated;
	}

	/** 仅更新 tokens */
	updateTokens(id: string, tokens: TemplatePack["tokens"]): boolean {
		return !!this.update(id, { tokens });
	}

	// ── 删除 ───────────────────────────────────────────────

	delete(id: string): boolean {
		const idx = this.userPacks.findIndex((p) => p.id === id);
		if (idx === -1) return false;
		this.userPacks = [...this.userPacks.slice(0, idx), ...this.userPacks.slice(idx + 1)];
		this.onChanged(this.userPacks);
		return true;
	}

	// ── 导入/导出 ──────────────────────────────────────────

	/** 导出为 JSON 字符串 */
	exportPack(id: string): string | undefined {
		const pack = this.getById(id) ?? BUILTIN_PACKS.find((p) => p.id === id);
		if (!pack) return undefined;
		const exportData: TemplatePackExport = { version: 1, pack };
		return JSON.stringify(exportData, null, 2);
	}

	/**
	 * 从 JSON 字符串导入。
	 * @returns 导入成功返回 pack ID，否则 undefined
	 */
	importPack(json: string): TemplatePack | undefined {
		let parsed: TemplatePackExport;
		try {
			parsed = JSON.parse(json);
		} catch {
			new Notice("导入失败：无效的 JSON 格式");
			return undefined;
		}

		if (!parsed || parsed.version !== 1 || !parsed.pack) {
			new Notice("导入失败：不支持的模板数据格式");
			return undefined;
		}

		const pack = parsed.pack;
		// 校验必要字段
		if (!pack.id || !pack.name || !pack.tokens) {
			new Notice("导入失败：缺少必要字段（id/name/tokens）");
			return undefined;
		}

		// 修改 source 为 user
		pack.source = "user";
		// 移除所有 extraCss（用户模板不支持自由 CSS）
		if (pack.overrides) {
			for (const key of Object.keys(pack.overrides)) {
				const ov = pack.overrides[key as keyof typeof pack.overrides];
				if (ov) delete ov.extraCss;
			}
		}

		// ID 冲突处理
		const idSet = new Set([
			...builtinPackIds(),
			...new Set(this.userPacks.map((p) => p.id)),
		]);
		if (idSet.has(pack.id)) {
			pack.id = `${pack.id}-imported-${Date.now()}`;
		}

		this.userPacks = [...this.userPacks, pack];
		this.onChanged(this.userPacks);
		new Notice(`模板「${pack.name}」已导入`);
		return pack;
	}

	// ── 校验 ───────────────────────────────────────────────

	/** 检查某个 packId 是否当前可用（存在于 builtin 或 user 中） */
	isPackAvailable(id: string): boolean {
		if (builtinPackIds().has(id)) return true;
		return this.userPacks.some((p) => p.id === id);
	}

	/** 获取某个 pack（user 优先，builtin 后备） */
	getPack(id: string): TemplatePack | undefined {
		return this.getById(id) ?? BUILTIN_PACKS.find((p) => p.id === id);
	}

	// ── 工具方法 ───────────────────────────────────────────

	private uniqueId(base: string): string {
		const allIds = new Set([
			...builtinPackIds(),
			...this.userPacks.map((p) => p.id),
		]);
		if (!allIds.has(base)) return base;
		let n = 1;
		while (allIds.has(`${base}-${n}`)) n++;
		return `${base}-${n}`;
	}
}
