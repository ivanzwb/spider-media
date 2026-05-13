import type { Template } from "@/platforms/base";
import { tokensToCss } from "./tokensToCss";
import type { TemplatePack, PlatformId } from "./types";

/**
 * 平台骨架加载器 —— 返回各平台的结构性 HTML 模板和基础样式。
 *
 * 注意：不直接从平台模块导入（会引入循环依赖或打包不需要的平台代码），
 * 而是内联骨架。骨架只包含 `{{CONTENT}}`/`{{TWEAK_STYLES}}` 占位符和结构性 CSS。
 */
const PLATFORM_SKELETONS: Record<
	PlatformId,
	{ html: string; baseStyles: string }
> = {
	wechat: {
		html: `<section class="mp-article">\n{{TWEAK_STYLES}}\n{{CONTENT}}\n</section>`,
		baseStyles: [
			".mp-article {",
			'  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;',
			"  color: #333;",
			"  background: #fff;",
			"  word-wrap: break-word;",
			"}",
			".mp-article h1, .mp-article h2, .mp-article h3,",
			".mp-article h4, .mp-article h5, .mp-article h6 {",
			"  font-weight: bold;",
			"  line-height: 1.35;",
			"}",
			".mp-article h1 { font-size: 22px; }",
			".mp-article h2 { font-size: 19px; }",
			".mp-article h3 { font-size: 17px; }",
			".mp-article h4 { font-size: 16px; }",
			".mp-article p { text-align: justify; }",
			".mp-article ul, .mp-article ol { padding-left: 1.6em; text-align: left; }",
			".mp-article li { margin: 0.3em 0; text-align: left; }",
			".mp-article hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }",
			".mp-article table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }",
			".mp-article th, .mp-article td { border: 1px solid #ddd; padding: 6px 10px; }",
			".mp-article th { background: #f5f5f5; }",
			".mp-article img { border-radius: 8px; }",
			'.mp-article pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }',
			'.mp-article code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }',
			"",
		].join("\n"),
	},
	toutiao: {
		html: `<section class="tt-article">\n{{TWEAK_STYLES}}\n{{CONTENT}}\n</section>`,
		baseStyles: [
			".tt-article {",
			'  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;',
			"  color: #222;",
			"  background: #fff;",
			"  word-wrap: break-word;",
			"  font-size: 17px;",
			"  line-height: 1.75;",
			"}",
			".tt-article h1, .tt-article h2, .tt-article h3,",
			".tt-article h4, .tt-article h5, .tt-article h6 {",
			"  font-weight: bold;",
			"  line-height: 1.35;",
			"}",
			".tt-article h1 { font-size: 24px; }",
			".tt-article h2 { font-size: 20px; }",
			".tt-article h3 { font-size: 18px; }",
			".tt-article h4 { font-size: 16px; }",
			".tt-article p { text-align: justify; margin: 0.8em 0; }",
			".tt-article ul, .tt-article ol { padding-left: 1.6em; text-align: left; }",
			".tt-article li { margin: 0.3em 0; text-align: left; }",
			".tt-article hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }",
			".tt-article table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }",
			".tt-article th, .tt-article td { border: 1px solid #ddd; padding: 6px 10px; }",
			".tt-article th { background: #f5f5f5; }",
			".tt-article img { border-radius: 6px; }",
			'.tt-article pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }',
			'.tt-article code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }',
			"",
		].join("\n"),
	},
	zhihu: {
		html: `<section class="zh-article">\n{{TWEAK_STYLES}}\n{{CONTENT}}\n</section>`,
		baseStyles: [
			".zh-article {",
			'  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;',
			"  color: #1a1a1a;",
			"  background: #fff;",
			"  word-wrap: break-word;",
			"  font-size: 16px;",
			"  line-height: 1.8;",
			"}",
			".zh-article h1, .zh-article h2, .zh-article h3,",
			".zh-article h4, .zh-article h5, .zh-article h6 {",
			"  font-weight: 600;",
			"  line-height: 1.4;",
			"}",
			".zh-article h1 { font-size: 24px; }",
			".zh-article h2 { font-size: 20px; }",
			".zh-article h3 { font-size: 17px; }",
			".zh-article h4 { font-size: 16px; }",
			".zh-article p { text-align: justify; margin: 0.8em 0; }",
			".zh-article ul, .zh-article ol { padding-left: 1.6em; text-align: left; }",
			".zh-article li { margin: 0.3em 0; text-align: left; }",
			".zh-article hr { border: none; border-top: 1px solid #e5e5e5; margin: 24px 0; }",
			".zh-article table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }",
			".zh-article th, .zh-article td { border: 1px solid #e5e5e5; padding: 6px 10px; }",
			".zh-article th { background: #f6f6f6; }",
			".zh-article img { border-radius: 4px; }",
			'.zh-article pre { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }',
			'.zh-article code { font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace; }',
			"",
		].join("\n"),
	},
	xiaohongshu: {
		html: `<section class="xhs-article">\n{{TWEAK_STYLES}}\n{{CONTENT}}\n</section>`,
		baseStyles: [
			".xhs-article {",
			'  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", Arial, sans-serif;',
			"  color: #333;",
			"  background: #fff;",
			"  word-wrap: break-word;",
			"  font-size: 16px;",
			"  line-height: 1.75;",
			"}",
			".xhs-article h1, .xhs-article h2, .xhs-article h3,",
			".xhs-article h4, .xhs-article h5, .xhs-article h6 {",
			"  font-weight: 700;",
			"  line-height: 1.4;",
			"}",
			".xhs-article h1 { font-size: 22px; }",
			".xhs-article h2 { font-size: 19px; }",
			".xhs-article h3 { font-size: 17px; }",
			".xhs-article h4 { font-size: 16px; }",
			".xhs-article p { margin: 0.7em 0; }",
			".xhs-article ul, .xhs-article ol { padding-left: 1.4em; }",
			".xhs-article li { margin: 0.25em 0; }",
			".xhs-article hr { border: none; border-top: 1px dashed #f0afc0; margin: 18px 0; }",
			".xhs-article img { border-radius: 8px; }",
			"",
		].join("\n"),
	},
};

/**
 * TemplateCompiler: 将 TemplatePack 编译为平台特定 Template。
 *
 * 保证：
 * - 对内置模板（source='builtin'），输出与旧硬编码 Template 等价
 * - 对用户模板（source='user'），通过 tokens → CSS + platform base styles 生成
 */
export class TemplateCompiler {
	compile(pack: TemplatePack, platformId: PlatformId): Template {
		const skeleton = PLATFORM_SKELETONS[platformId] ?? PLATFORM_SKELETONS.wechat;
		const override = pack.overrides?.[platformId];

		// 1. tokens → CSS
		const tokenCss = tokensToCss(pack.tokens, platformId);

		// 2. 拼接额外 CSS（内置模板携带的原始样式）
		const extraCss = override?.extraCss ?? "";
		const fullStyles = [skeleton.baseStyles, tokenCss, extraCss].filter(Boolean).join("\n");

		return {
			id: pack.id,
			name: pack.name,
			category: pack.category,
			html: skeleton.html,
			styles: fullStyles,
		};
	}

	/** 批量编译一个 pack 到所有已注册平台 */
	compileAll(pack: TemplatePack): Record<PlatformId, Template> {
		const platforms = Object.keys(PLATFORM_SKELETONS) as PlatformId[];
		const result = {} as Record<PlatformId, Template>;
		for (const pid of platforms) {
			if (pack.overrides?.[pid]?.disabled) continue;
			result[pid] = this.compile(pack, pid);
		}
		return result;
	}

	/** 获取所有已知平台 ID */
	getKnownPlatforms(): PlatformId[] {
		return Object.keys(PLATFORM_SKELETONS) as PlatformId[];
	}
}

/** 单例，供各处复用 */
export const templateCompiler = new TemplateCompiler();
