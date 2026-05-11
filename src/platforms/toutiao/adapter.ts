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
import { ToutiaoAutomator, type ToutiaoAutomatorOptionsProvider } from "./automator";
import { ToutiaoFormatter } from "./formatter";
import { TOUTIAO_TEMPLATES } from "./templates";

export interface ToutiaoAdapterOptions {
	context: PlatformContext;
	automator: ToutiaoAutomatorOptionsProvider;
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
	private automator: ToutiaoAutomator;

	constructor(private options: ToutiaoAdapterOptions) {
		super();
		this.images = new ImageManager(options.context.vault, {
			inlineThresholdKB: options.imageInlineThresholdKB ?? 100,
			noteDir: options.noteDir,
		});
		this.automator = new ToutiaoAutomator(options.automator);
	}

	getTemplates(): Template[] {
		return TOUTIAO_TEMPLATES;
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

	publish(
		html: string,
		title: string,
		credentials: Credentials,
	): Promise<PublishResult> {
		return this.automator.publish(html, title, credentials);
	}

	setNoteDir(dir: string): void {
		this.options.noteDir = dir;
		this.images = new ImageManager(this.options.context.vault, {
			inlineThresholdKB: this.options.imageInlineThresholdKB ?? 100,
			noteDir: dir,
		});
	}
}
