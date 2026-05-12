import { ImageManager } from "@/core/ImageManager";
import { MarkdownParser } from "@/core/MarkdownParser";
import { MermaidConverter } from "@/core/MermaidConverter";
import { PostProcessor } from "@/core/PostProcessor";
import {
	PlatformAdapter,
	type Credentials,
	type FormatTweaks,
	type PlatformContext,
	type PlatformMeta,
	type PublishResult,
	type Template,
} from "@/platforms/base";
import { ZhihuFormatter } from "./formatter";
import { ZHIHU_TEMPLATES } from "./templates";

export interface ZhihuAdapterOptions {
	context: PlatformContext;
	noteDir: string;
	imageInlineThresholdKB?: number;
}

export class ZhihuAdapter extends PlatformAdapter {
	readonly meta: PlatformMeta = {
		id: "zhihu",
		name: "知乎",
		icon: "book-open",
		color: "#0084FF",
		isDesktopOnly: true,
	};

	private formatter = new ZhihuFormatter();
	private postProcessor = new PostProcessor();
	private mermaid = new MermaidConverter();
	private images: ImageManager;

	constructor(private options: ZhihuAdapterOptions) {
		super();
		this.images = new ImageManager(options.context.vault, {
			inlineThresholdKB: options.imageInlineThresholdKB ?? 100,
			noteDir: options.noteDir,
		});
	}

	getTemplates(): Template[] {
		return ZHIHU_TEMPLATES;
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
	 * 发布走 Obsidian 内嵌 webview（ZhihuBrowserView），
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
			message: "请使用嵌入式知乎浏览器发布。",
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
