import { templateCompiler } from "./TemplateCompiler";
import { BUILTIN_PACKS, getBuiltinPacksForPlatform } from "./builtinPacks";
import type { TemplatePack, PlatformId } from "./types";
import type { Template } from "@/platforms/base";

/**
 * 获取某平台所有可用 packs（builtin + user）。
 * 同名 user pack 会覆盖 builtin（不可见，因为 getAvailablePacksForPlatform
 * 只把 builtin 中没有被 user 覆盖的 pack 加入列表）。
 */
export function getAvailablePacksForPlatform(
	platformId: string,
	userPacks: TemplatePack[],
): TemplatePack[] {
	const platformBuiltin = getBuiltinPacksForPlatform(platformId);
	const userForPlatform = userPacks.filter(
		(u) => !platformBuiltin.some((b) => b.id === u.id),
	);
	return [...platformBuiltin, ...userForPlatform];
}

/**
 * 通过 packId 查找 TemplatePack（user 优先，builtin 后备）。
 */
export function findPack(packId: string, userPacks: TemplatePack[]): TemplatePack | undefined {
	return (
		userPacks.find((p) => p.id === packId) ??
		BUILTIN_PACKS.find((p) => p.id === packId)
	);
}

/**
 * 将指定 pack 编译为目标平台 Template。
 * 若 packId 对应的 pack 不存在则返回 undefined。
 */
export function compilePackForPlatform(
	packId: string,
	platformId: PlatformId,
	userPacks: TemplatePack[],
): Template | undefined {
	const pack = findPack(packId, userPacks);
	if (!pack) return undefined;
	return templateCompiler.compile(pack, platformId);
}

/**
 * 解析平台当前激活的模板。
 *
 * 查找顺序：
 * 1. 若 packId 存在且可编译 → 返回编译结果
 * 2. 若 packId 缺失或无效 → 返回平台第一个可用 pack
 * 3. 终极兜底 → 返回平台第一个 builtin pack
 */
export function resolveActiveTemplate(
	packId: string | undefined,
	platformId: PlatformId,
	userPacks: TemplatePack[],
): Template {
	if (packId) {
		const compiled = compilePackForPlatform(packId, platformId, userPacks);
		if (compiled) return compiled;
	}

	// Fallback: first available pack (builtin + user)
	const available = getAvailablePacksForPlatform(platformId, userPacks);
	if (available.length > 0) {
		return templateCompiler.compile(available[0], platformId);
	}

	// Ultimate fallback: first builtin pack for this platform
	const fallback = getBuiltinPacksForPlatform(platformId)[0];
	if (fallback) return templateCompiler.compile(fallback, platformId);

	throw new Error(`没有可用的模板 (platform: ${platformId})`);
}
