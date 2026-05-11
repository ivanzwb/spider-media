import {
	ItemView,
	Notice,
	TFile,
	WorkspaceLeaf,
	debounce,
	type Debouncer,
} from "obsidian";
import { parseFrontmatter } from "@/core/utils";
import type { PlatformAdapter, Template } from "@/platforms/base";
import type SpiderMediaPlugin from "@/main";

export const VIEW_TYPE_SPIDER_MEDIA = "spider-media-view";

/**
 * 发布预览视图。Obsidian 自身就是 Markdown 编辑器，
 * 本视图不重复实现编辑功能 —— 只做 预览 + 控制 + 发布。
 *
 * 数据流：
 *   active TFile → vault.read → format(md) → 预览 + 发布
 *   监听 vault.modify / workspace.active-leaf-change 自动刷新
 */
export class PlatformEditorView extends ItemView {
	private currentFile: TFile | null = null;
	private currentMarkdown = "";
	private currentTitle = "";
	private activePlatformId: string;
	private activeTemplateId: string;

	private previewEl!: HTMLDivElement;
	private fileLabelEl!: HTMLElement;
	private platformSelectEl!: HTMLSelectElement;
	private templateSelectEl!: HTMLSelectElement;
	private statusEl!: HTMLElement;

	private renderPreview: Debouncer<[], void>;

	constructor(leaf: WorkspaceLeaf, private plugin: SpiderMediaPlugin) {
		super(leaf);
		this.activePlatformId = plugin.settings.defaultPlatform;
		this.activeTemplateId = plugin.settings.wechat.defaultTemplateId;
		this.renderPreview = debounce(() => void this.refreshPreview(), 350, true);
	}

	getViewType(): string {
		return VIEW_TYPE_SPIDER_MEDIA;
	}

	getDisplayText(): string {
		return "自媒体发布";
	}

	getIcon(): string {
		return "message-square";
	}

	async onOpen(): Promise<void> {
		const root = this.containerEl.children[1] as HTMLElement;
		root.empty();
		root.addClass("spider-media-view");
		this.buildLayout(root);

		// 跟随当前活动文件
		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				void this.loadActiveFile();
			}),
		);
		// 当前文件保存后自动刷新预览
		this.registerEvent(
			this.app.vault.on("modify", (file) => {
				if (file === this.currentFile) void this.loadActiveFile();
			}),
		);

		await this.loadActiveFile();
	}

	async onClose(): Promise<void> {
		// nothing to dispose
	}

	private buildLayout(root: HTMLElement): void {
		const toolbar = root.createDiv({ cls: "sm-toolbar" });
		toolbar.createSpan({ text: "平台：" });
		this.platformSelectEl = toolbar.createEl("select", { cls: "sm-select" });
		for (const adapter of this.plugin.platforms.values()) {
			const opt = this.platformSelectEl.createEl("option", {
				text: adapter.meta.name,
				value: adapter.meta.id,
			});
			if (adapter.meta.id === this.activePlatformId) opt.selected = true;
		}
		this.platformSelectEl.addEventListener("change", () => {
			this.activePlatformId = this.platformSelectEl.value;
			this.populateTemplates();
			this.renderPreview();
		});

		toolbar.createSpan({ text: "模板：" });
		this.templateSelectEl = toolbar.createEl("select", { cls: "sm-select" });
		this.templateSelectEl.addEventListener("change", () => {
			this.activeTemplateId = this.templateSelectEl.value;
			this.renderPreview();
		});

		toolbar.createEl("button", { text: "刷新", cls: "sm-btn" }).addEventListener("click", () => {
			void this.loadActiveFile();
		});

		const fileBar = root.createDiv({ cls: "sm-file-bar" });
		fileBar.createSpan({ text: "源文件：", cls: "sm-file-bar-label" });
		this.fileLabelEl = fileBar.createSpan({ cls: "sm-file-bar-name", text: "(无)" });

		const main = root.createDiv({ cls: "sm-main" });
		const previewPane = main.createDiv({ cls: "sm-pane sm-preview-pane" });
		previewPane.createDiv({ cls: "sm-pane-title", text: "预览" });
		this.previewEl = previewPane.createDiv({ cls: "sm-preview" });

		const footer = root.createDiv({ cls: "sm-footer" });
		this.statusEl = footer.createSpan({ cls: "sm-status", text: "就绪" });
		footer.createEl("button", { text: "复制 HTML", cls: "sm-btn" }).addEventListener("click", () => {
			void this.copyHtml();
		});
		footer.createEl("button", { text: "同步到平台", cls: "sm-btn sm-btn-primary" }).addEventListener("click", () => {
			void this.publish();
		});

		this.populateTemplates();
	}

	private populateTemplates(): void {
		const adapter = this.getActiveAdapter();
		this.templateSelectEl.empty();
		const templates = adapter.getTemplates();
		for (const tpl of templates) {
			const opt = this.templateSelectEl.createEl("option", {
				text: tpl.name,
				value: tpl.id,
			});
			if (tpl.id === this.activeTemplateId) opt.selected = true;
		}
		if (!templates.some((t) => t.id === this.activeTemplateId) && templates.length > 0) {
			this.activeTemplateId = templates[0].id;
			this.templateSelectEl.value = this.activeTemplateId;
		}
	}

	private getActiveAdapter(): PlatformAdapter {
		const adapter = this.plugin.platforms.get(this.activePlatformId);
		if (!adapter) {
			const fallback = this.plugin.platforms.values().next().value;
			if (!fallback) throw new Error("没有已注册的平台");
			this.activePlatformId = fallback.meta.id;
			return fallback;
		}
		return adapter;
	}

	private getActiveTemplate(adapter: PlatformAdapter): Template {
		const list = adapter.getTemplates();
		return list.find((t) => t.id === this.activeTemplateId) ?? list[0];
	}

	async loadActiveFile(): Promise<void> {
		const file = this.app.workspace.getActiveFile();
		if (!file || file.extension !== "md") {
			this.currentFile = null;
			this.currentMarkdown = "";
			this.fileLabelEl.setText("(无 Markdown 文件)");
			this.previewEl.empty();
			this.setStatus("请先在 Obsidian 中打开一篇 Markdown 笔记");
			return;
		}
		this.currentFile = file;
		const raw = await this.app.vault.read(file);
		const { frontmatter, body } = parseFrontmatter(raw);
		this.currentMarkdown = body;
		this.currentTitle = frontmatter.title ?? file.basename;
		this.fileLabelEl.setText(file.path);
		this.plugin.notifyNoteDir(file.parent?.path ?? "");
		this.setStatus(`已加载：${file.path}`);
		await this.refreshPreview();
	}

	/**
	 * 构造发送给 adapter 的 markdown：在首行注入 `# 标题`（若 body 未以 H1 起头）。
	 * 这样预览和公众号正文里都能看到标题；公众号编辑器的标题栏由 JsApi 单独填入。
	 */
	private buildMarkdownWithTitle(): string {
		const body = this.currentMarkdown ?? "";
		const title = (this.currentTitle ?? "").trim();
		if (!title) return body;
		if (/^\s*#\s+/.test(body)) return body; // body 已有 H1，避免重复
		return `# ${title}\n\n${body}`;
	}

	private async refreshPreview(): Promise<void> {
		if (!this.currentMarkdown) {
			this.previewEl.empty();
			return;
		}
		try {
			const adapter = this.getActiveAdapter();
			const template = this.getActiveTemplate(adapter);
			const html = await adapter.format(
				this.buildMarkdownWithTitle(),
				template,
				this.plugin.settings.tweaks,
			);
			this.previewEl.innerHTML = html;
			this.setStatus(`预览已更新 · ${this.currentMarkdown.length} 字符`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.setStatus(`预览失败：${msg}`);
			console.error("[spider-media] preview error", err);
		}
	}

	private async copyHtml(): Promise<void> {
		if (!this.currentMarkdown) {
			new Notice("没有可复制的内容");
			return;
		}
		try {
			const adapter = this.getActiveAdapter();
			const template = this.getActiveTemplate(adapter);
			const html = await adapter.format(
				this.buildMarkdownWithTitle(),
				template,
				this.plugin.settings.tweaks,
			);
			await navigator.clipboard.writeText(html);
			new Notice("HTML 已复制到剪贴板");
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`复制失败：${msg}`);
		}
	}

	private async publish(): Promise<void> {
		if (!this.currentMarkdown) {
			new Notice("没有可发布的内容");
			return;
		}
		try {
			const adapter = this.getActiveAdapter();
			const template = this.getActiveTemplate(adapter);
			// 微信编辑器有独立标题输入框，正文不应再带 H1（否则会出现重复标题）。
			const isWechat = adapter.meta.id === "wechat";
			const md = isWechat ? (this.currentMarkdown ?? "") : this.buildMarkdownWithTitle();
			const html = await adapter.format(
				md,
				template,
				this.plugin.settings.tweaks,
			);
			// 微信走 Obsidian 内嵌 webview，免外部 Chrome
			if (isWechat) {
				this.setStatus("打开内嵌浏览器…");
				const view = await this.plugin.openWeChatBrowser();
				await view.submitPayload({ title: this.currentTitle, html });
				this.setStatus("已切到嵌入浏览器执行注入");
				return;
			}
			this.setStatus("正在发布…");
			const result = await adapter.publish(html, this.currentTitle, {
				type: "manual",
				data: {},
			});
			new Notice(result.message, 6000);
			this.setStatus(result.success ? `成功：${result.stage}` : `失败：${result.stage}`);
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			new Notice(`发布失败：${msg}`);
			this.setStatus(`发布失败：${msg}`);
		}
	}

	private setStatus(text: string): void {
		this.statusEl.setText(text);
	}
}
