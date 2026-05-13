import { ImageManager } from "@/core/ImageManager";
import { MarkdownParser } from "@/core/MarkdownParser";
import { MermaidConverter } from "@/core/MermaidConverter";
import { PostProcessor } from "@/core/PostProcessor";
import { templateCompiler } from "@/core/templates";
import { getBuiltinPacksForPlatform } from "@/core/templates/builtinPacks";
import {
	PlatformAdapter,
	type Credentials,
	type FormatTweaks,
	type PlatformContext,
	type PlatformMeta,
	type PublishResult,
	type Template,
} from "@/platforms/base";
import { ToutiaoFormatter } from "./formatter";

export interface ToutiaoAdapterOptions {
	context: PlatformContext;
	noteDir: string;
	imageInlineThresholdKB?: number;
}

export class ToutiaoAdapter extends PlatformAdapter {
	readonly meta: PlatformMeta = {
		id: "toutiao",
		name: "头条号",
		icon: "newspaper",
		color: "#f04142",
		isDesktopOnly: true,
	};

	private formatter = new ToutiaoFormatter();
	private postProcessor = new PostProcessor();
	private mermaid = new MermaidConverter();
	private images: ImageManager;

	constructor(private options: ToutiaoAdapterOptions) {
		super();
		this.images = new ImageManager(options.context.vault, {
			inlineThresholdKB: options.imageInlineThresholdKB ?? 100,
			noteDir: options.noteDir,
		});
	}

	getTemplates(): Template[] {
		return getBuiltinPacksForPlatform("toutiao")
			.map((pack) => templateCompiler.compile(pack, "toutiao"));
	}

	async format(
		markdown: string,
		template: Template,
		tweaks: FormatTweaks,
	): Promise<string> {
		const parser = new MarkdownParser({
			platformExtensions: this.formatter.getExtensions(),
		});
		let html = await parser.parse(markdown);
		html = await this.mermaid.renderAll(html);
		html = await this.images.resolveAll(html);

		return this.postProcessor.process(html, {
			template: template.html,
			templateStyles: template.styles,
			tweaks,
		});
	}

	/**
	 * 发布走 Obsidian 内嵌 webview（ToutiaoBrowserView），
	 * UI 层 publish() 直接路由到该视图，不会走到此方法。
	 */
	async publish(
		_html: string,
		_title: string,
		_credentials: Credentials,
	): Promise<PublishResult> {
		return {
			success: false,
			stage: "fallback",
			message: "请使用嵌入式头条号浏览器发布。",
		};
	}

	setNoteDir(dir: string): void {
		this.options.noteDir = dir;
		this.images = new ImageManager(this.options.context.vault, {
			inlineThresholdKB: this.options.imageInlineThresholdKB ?? 100,
			noteDir: dir,
		});
	}
}
