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
import { WeChatFormatter } from "./formatter";

export interface WeChatAdapterOptions {
	context: PlatformContext;
	/** 当前笔记目录 (用于解析图片相对路径) */
	noteDir: string;
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

	constructor(private options: WeChatAdapterOptions) {
		super();
		this.images = new ImageManager(options.context.vault, {
			noteDir: options.noteDir,
		});
	}

	getTemplates(): Template[] {
		return getBuiltinPacksForPlatform("wechat")
			.map((pack) => templateCompiler.compile(pack, "wechat"));
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
	 * 发布走 Obsidian 内嵌 webview（WeChatBrowserView），
	 * UI 层 publish() 直接路由到该视图，不会走到此方法。
	 * 保留实现仅为满足 PlatformAdapter 契约。
	 */
	async publish(
		_html: string,
		_title: string,
		_credentials: Credentials,
	): Promise<PublishResult> {
		return {
			success: false,
			stage: "fallback",
			message: "请使用嵌入式微信公众号浏览器发布。",
		};
	}

	/** 更新当前笔记目录 (UI 切换文件时调用) */
	setNoteDir(dir: string): void {
		this.options.noteDir = dir;
		this.images = new ImageManager(this.options.context.vault, {
			noteDir: dir,
		});
	}
}
