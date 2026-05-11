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
import { WeChatAutomator, type WeChatAutomatorOptionsProvider } from "./automator";
import { WeChatFormatter } from "./formatter";
import { WECHAT_TEMPLATES } from "./templates";

export interface WeChatAdapterOptions {
	context: PlatformContext;
	automator: WeChatAutomatorOptionsProvider;
	/** 当前笔记目录 (用于解析图片相对路径) */
	noteDir: string;
	/** 小图内嵌阈值 KB */
	imageInlineThresholdKB?: number;
}

export class WeChatAdapter extends PlatformAdapter {
	readonly meta: PlatformMeta = {
		id: "wechat",
		name: "微信公众号",
		icon: "message-square",
		color: "#07C160",
		isDesktopOnly: true,
	};

	private formatter = new WeChatFormatter();
	private postProcessor = new PostProcessor();
	private mermaid = new MermaidConverter();
	private images: ImageManager;
	private automator: WeChatAutomator;

	constructor(private options: WeChatAdapterOptions) {
		super();
		this.images = new ImageManager(options.context.vault, {
			inlineThresholdKB: options.imageInlineThresholdKB ?? 100,
			noteDir: options.noteDir,
		});
		this.automator = new WeChatAutomator(options.automator);
	}

	getTemplates(): Template[] {
		return WECHAT_TEMPLATES;
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

	/** 更新当前笔记目录 (UI 切换文件时调用) */
	setNoteDir(dir: string): void {
		this.options.noteDir = dir;
		this.images = new ImageManager(this.options.context.vault, {
			inlineThresholdKB: this.options.imageInlineThresholdKB ?? 100,
			noteDir: dir,
		});
	}
}
