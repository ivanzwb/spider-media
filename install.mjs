#!/usr/bin/env node
/**
 * install.mjs — 把构建产物安装到本地 Obsidian vault
 *
 * 用法:
 *   node install.mjs <vault-path>
 *   npm run install:vault -- <vault-path>
 *   SPIDER_MEDIA_VAULT=<vault-path> node install.mjs
 *
 * 行为:
 *   1. 若 dist/ 不存在或缺失关键文件，自动跑一次 `npm run build`
 *   2. 创建 <vault>/.obsidian/plugins/spider-media/ 目录（缺失则建）
 *   3. 复制 main.js / manifest.json / styles.css 到该目录
 *   4. 打印安装结果与下一步操作提示
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, copyFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const DIST = join(ROOT, "dist");
const ARTIFACTS = ["main.js", "manifest.json", "styles.css"];

function fail(msg) {
	console.error(`\n[install] ✗ ${msg}\n`);
	process.exit(1);
}

function info(msg) {
	console.log(`[install] ${msg}`);
}

function resolveVault() {
	const arg = process.argv[2];
	const env = process.env.SPIDER_MEDIA_VAULT;
	const vault = arg || env;
	if (!vault) {
		fail(
			[
				"未提供 vault 路径。",
				"用法:  node install.mjs <vault-path>",
				"或者: SPIDER_MEDIA_VAULT=<vault-path> node install.mjs",
				"提示: vault 路径就是包含 .obsidian/ 子目录的那个文件夹",
			].join("\n         "),
		);
	}
	const abs = resolve(vault);
	if (!existsSync(abs)) fail(`vault 路径不存在: ${abs}`);
	if (!statSync(abs).isDirectory()) fail(`vault 路径不是目录: ${abs}`);
	const obsidianDir = join(abs, ".obsidian");
	if (!existsSync(obsidianDir)) {
		fail(
			`目标目录下找不到 .obsidian/，确认这是一个 Obsidian vault: ${abs}`,
		);
	}
	return abs;
}

function ensureBuild() {
	info("开始构建...");
	const npm = process.platform === "win32" ? "npm.cmd" : "npm";
	const r = spawnSync(`${npm} run build`, [], {
		cwd: ROOT,
		stdio: "inherit",
		shell: true,
	});
	if (r.status !== 0) fail(`npm run build 失败 (exit ${r.status})`);
}

function copyArtifacts(vault) {
	const target = join(vault, ".obsidian", "plugins", "spider-media");
	if (!existsSync(target)) {
		mkdirSync(target, { recursive: true });
		info(`已创建插件目录 ${target}`);
	}
	for (const f of ARTIFACTS) {
		const src = join(DIST, f);
		const dst = join(target, f);
		copyFileSync(src, dst);
		info(`✓ ${f}`);
	}
	return target;
}

function main() {
	info(`Spider Media 安装脚本`);
	const vault = resolveVault();
	info(`目标 vault: ${vault}`);
	ensureBuild();
	const target = copyArtifacts(vault);
	console.log(
		[
			"",
			`[install] ✓ 安装完成 → ${target}`,
			"",
			"下一步:",
			"  1. 打开 Obsidian 该 vault",
			"  2. 设置 → 第三方插件 → 已安装的插件 → 启用 Spider Media",
			"     (若已启用，请点旁边的「重新加载」按钮使新版本生效)",
			"",
		].join("\n"),
	);
}

main();
