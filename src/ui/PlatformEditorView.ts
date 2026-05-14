import {
	ItemView,
	Notice,
	TFile,
	WorkspaceLeaf,
	Setting,
	debounce,
	type Debouncer,
} from "obsidian";
import { parseFrontmatter } from "@/core/utils";
import type { PlatformAdapter, Template } from "@/platforms/base";
import type { PlatformId, BodyFont, BlockquoteStyle, TemplateCodeTheme, Spacing } from "@/core/templates";
import {
	getAvailablePacksForPlatform,
	compilePackForPlatform,
	DEFAULT_TEMPLATE_TOKENS,
} from "@/core/templates";
import { UserTemplateStore } from "@/core/templates/UserTemplateStore";
import { TemplateManagerModal } from "./TemplateManagerModal";
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

	private templateEditorEl!: HTMLDivElement;
	private templatePanelVisible = false;
	private toggleTemplateBtn!: HTMLButtonElement;
	private templateStore: UserTemplateStore | null = null;

	private renderPreview: Debouncer<[], void>;

	constructor(leaf: WorkspaceLeaf, private plugin: SpiderMediaPlugin) {
		super(leaf);
		this.activePlatformId = plugin.settings.defaultPlatform;
		this.activeTemplateId = plugin.settings.templates.defaultPackId;
		this.renderPreview = debounce(() => void this.refreshPreview(), 350, true);
	}

	getViewType(): string {
		return VIEW_TYPE_SPIDER_MEDIA;
	}

	getDisplayText(): string {
		return "自媒体发布";
	}

	getIcon(): string {
		// 与 ribbon 共用同一个自定义图标（main.ts 中通过 addIcon 注册）
		return "spider-media-icon";
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
			this.plugin.settings.defaultPlatform = this.activePlatformId;
			void this.plugin.saveSettings();
			this.populateTemplates();
			this.renderPreview();
		});

		toolbar.createSpan({ text: "模板：" });
		this.templateSelectEl = toolbar.createEl("select", { cls: "sm-select" });
		this.templateSelectEl.addEventListener("change", () => {
			this.activeTemplateId = this.templateSelectEl.value;
			this.plugin.settings.templates.defaultPackId = this.activeTemplateId;
			void this.plugin.saveSettings();
			this.renderPreview();
		});

		toolbar.createEl("button", { text: "刷新", cls: "sm-btn" }).addEventListener("click", () => {
			void this.loadActiveFile();
		});

		this.toggleTemplateBtn = toolbar.createEl("button", {
			text: "模板管理",
			cls: "sm-btn",
		});
		this.toggleTemplateBtn.addEventListener("click", () => {
			this.toggleTemplateEditor();
		});

		// Collapsible inline template editor
		this.templateEditorEl = root.createDiv({ cls: "sm-template-editor-panel" });
		this.templateEditorEl.hidden = true;
		this.templateEditorEl.style.borderBottom = "1px solid var(--background-modifier-border)";

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

	private toggleTemplateEditor(): void {
		this.templatePanelVisible = !this.templatePanelVisible;
		this.templateEditorEl.hidden = !this.templatePanelVisible;
		this.toggleTemplateBtn.setText(this.templatePanelVisible ? "关闭管理" : "模板管理");
		if (this.templatePanelVisible) {
			this.rebuildStore();
			this.renderTemplateEditor();
		}
	}

	private rebuildStore(): void {
		this.templateStore = new UserTemplateStore(
			this.plugin.settings.templates.userPacks,
			(packs) => {
				this.plugin.settings.templates.userPacks = packs;
				void this.plugin.saveSettings();
				this.populateTemplates();
				if (this.templatePanelVisible) this.renderTemplateEditor();
				this.renderPreview();
			},
		);
	}

	private renderTemplateEditor(): void {
		this.templateEditorEl.empty();

		if (!this.templateStore) return;

		const allPacks = getAvailablePacksForPlatform(
			this.activePlatformId,
			this.plugin.settings.templates.userPacks,
		);
		const curId = this.activeTemplateId;
		const pack = this.templateStore.getPack(curId);

		// Tab bar: horizontal pack selector within the editor
		const tabBar = this.templateEditorEl.createDiv({ cls: "sm-editor-tabs" });
		tabBar.style.display = "flex";
		tabBar.style.flexWrap = "wrap";
		tabBar.style.gap = "4px";
		tabBar.style.padding = "6px 10px";
		tabBar.style.borderBottom = "1px solid var(--background-modifier-border)";

		for (const p of allPacks) {
			const tab = tabBar.createEl("button", {
				text: p.source === "user" ? `${p.name} (U)` : p.name,
				cls: `sm-editor-tab${p.id === curId ? " sm-editor-tab-active" : ""}`,
			});
			tab.style.fontSize = "11px";
			tab.style.padding = "2px 8px";
			tab.style.borderRadius = "4px";
			tab.style.cursor = "pointer";
			tab.style.border = "1px solid var(--background-modifier-border)";
			tab.style.background = p.id === curId
				? "var(--interactive-accent)"
				: "transparent";
			tab.style.color = p.id === curId
				? "var(--text-on-accent)"
				: "var(--text-normal)";
			tab.addEventListener("click", () => {
				this.activeTemplateId = p.id;
				this.plugin.settings.templates.defaultPackId = p.id;
				void this.plugin.saveSettings();
				this.populateTemplates();
				this.renderTemplateEditor();
				this.renderPreview();
			});
		}

		// Action buttons row
		const actionBar = this.templateEditorEl.createDiv({ cls: "sm-editor-actions" });
		actionBar.style.display = "flex";
		actionBar.style.gap = "6px";
		actionBar.style.padding = "6px 10px";
		actionBar.style.borderBottom = "1px solid var(--background-modifier-border)";

		const addBtn = actionBar.createEl("button", { text: "+ 新建", cls: "sm-btn" });
		addBtn.addEventListener("click", () => {
			if (!this.templateStore) return;
			const newPack = this.templateStore.create();
			this.activeTemplateId = newPack.id;
			this.plugin.settings.templates.defaultPackId = newPack.id;
			void this.plugin.saveSettings();
			this.populateTemplates();
			this.renderTemplateEditor();
			this.renderPreview();
		});

		if (pack && pack.source === "user") {
			const dupBtn = actionBar.createEl("button", { text: "复制", cls: "sm-btn" });
			dupBtn.addEventListener("click", () => {
				if (!this.templateStore || !pack) return;
				const newPack = this.templateStore.create(pack);
				this.activeTemplateId = newPack.id;
				this.plugin.settings.templates.defaultPackId = newPack.id;
				void this.plugin.saveSettings();
				this.populateTemplates();
				this.renderTemplateEditor();
				this.renderPreview();
			});

			const delBtn = actionBar.createEl("button", { text: "删除", cls: "sm-btn" });
			delBtn.style.color = "var(--text-error)";
			delBtn.addEventListener("click", () => {
				if (!this.templateStore || !pack) return;
				this.templateStore.delete(pack.id);
				const all = getAvailablePacksForPlatform(
					this.activePlatformId,
					this.plugin.settings.templates.userPacks,
				);
				if (all.length > 0) {
					this.activeTemplateId = all[0].id;
					this.plugin.settings.templates.defaultPackId = all[0].id;
				}
				void this.plugin.saveSettings();
				this.populateTemplates();
				this.renderTemplateEditor();
				this.renderPreview();
			});
		}

		const fullBtn = actionBar.createEl("button", {
			text: "完整管理器…",
			cls: "sm-btn",
		});
		fullBtn.addEventListener("click", () => {
			new TemplateManagerModal(this.app, this.plugin).open();
		});

		// Token editor (Settings-style)
		if (!pack) {
			this.templateEditorEl.createEl("p", {
				text: "未找到模板",
				cls: "sm-hint",
			});
			return;
		}

		const editorBody = this.templateEditorEl.createDiv({ cls: "sm-editor-body" });
		editorBody.style.padding = "6px 10px";
		editorBody.style.maxHeight = "320px";
		editorBody.style.overflowY = "auto";

		const isBuiltin = pack.source === "builtin";
		const tokens = pack.tokens;

		// Name (editable for user templates)
		if (!isBuiltin) {
			new Setting(editorBody)
				.setName("模板名称")
				.addText((text) =>
					text.setValue(pack.name).onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.update(pack.id, { name: v || pack.name });
					}),
				);
		}

		const themeColorSetting = new Setting(editorBody)
			.setName("主题色")
			.addColorPicker((cp) =>
				cp
					.setValue(tokens.themeColor)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						const val = v || DEFAULT_TEMPLATE_TOKENS.themeColor;
						this.templateStore.updateTokens(pack.id, { ...tokens, themeColor: val });
						themeColorSetting.nameEl.style.color = val;
						this.renderPreview();
					}),
			);
		themeColorSetting.nameEl.style.color = tokens.themeColor;

		const headingSetting = new Setting(editorBody)
			.setName("标题装饰")
			.addDropdown((dd) =>
				dd
					.addOption("template", "极简 · 无装饰")
					.addOption("underline", "下划线")
					.addOption("bordered", "描边胶囊")
					.addOption("numbered", "左竖条 + 渐变")
					.setValue(tokens.headingStyle)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, headingStyle: v as typeof tokens.headingStyle });
						applyHeadingPreview(headingSetting.nameEl, v, tokens.themeColor);
						this.renderPreview();
					}),
			);
		const applyHeadingPreview = (el: HTMLElement, style: string, accent: string) => {
			el.style.textDecoration = "none";
			el.style.border = "none";
			el.style.padding = "0";
			el.style.borderLeft = "none";
			el.style.borderRadius = "";
			if (style === "underline") {
				el.style.textDecoration = "underline";
				el.style.textUnderlineOffset = "3px";
			} else if (style === "bordered") {
				el.style.border = `1px solid ${accent}`;
				el.style.borderRadius = "4px";
				el.style.padding = "1px 6px";
			} else if (style === "numbered") {
				el.style.borderLeft = `3px solid ${accent}`;
				el.style.paddingLeft = "8px";
			}
		};
		applyHeadingPreview(headingSetting.nameEl, tokens.headingStyle, tokens.themeColor);

		const bodyFontSetting = new Setting(editorBody)
			.setName("正文字体")
			.addDropdown((dd) =>
				dd
					.addOption("system", "系统默认")
					.addOption("serif", "衬线体 (宋体)")
					.addOption("sans", "无衬线体")
					.setValue(tokens.bodyFont)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, bodyFont: v as BodyFont });
						applyBodyFontPreview(bodyFontSetting.nameEl, v);
						this.renderPreview();
					}),
			);
		const applyBodyFontPreview = (el: HTMLElement, font: string) => {
			el.style.fontFamily = "";
			if (font === "serif") {
				el.style.fontFamily = '"Songti SC", "SimSun", "Noto Serif CJK SC", serif';
			} else if (font === "sans") {
				el.style.fontFamily = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif';
			}
		};
		applyBodyFontPreview(bodyFontSetting.nameEl, tokens.bodyFont);

		const fontSizeSetting = new Setting(editorBody)
			.setName("字号 (px)")
			.addSlider((sl) =>
				sl
					.setLimits(14, 18, 1)
					.setValue(tokens.fontSize)
					.setDynamicTooltip()
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, fontSize: v });
						fontSizeSetting.nameEl.style.fontSize = `${v}px`;
						this.renderPreview();
					}),
			);
		fontSizeSetting.nameEl.style.fontSize = `${tokens.fontSize}px`;

		const lineHeightSetting = new Setting(editorBody)
			.setName("行高")
			.addSlider((sl) =>
				sl
					.setLimits(1.4, 2.0, 0.05)
					.setValue(tokens.lineHeight)
					.setDynamicTooltip()
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, lineHeight: v });
						lineHeightSetting.nameEl.style.lineHeight = String(v);
						this.renderPreview();
					}),
			);
		lineHeightSetting.nameEl.style.lineHeight = String(tokens.lineHeight);

		const codeThemeSetting = new Setting(editorBody)
			.setName("代码块配色")
			.addDropdown((dd) =>
				dd
					.addOption("atom-one-dark", "Atom One Dark")
					.addOption("github", "GitHub Light")
					.addOption("github-dark", "GitHub Dark")
					.addOption("dracula", "Dracula")
					.addOption("light", "浅色")
					.setValue(tokens.codeTheme)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, codeTheme: v as TemplateCodeTheme });
						applyCodePreview(codeThemeSetting.nameEl, v);
						this.renderPreview();
					}),
			);
		const applyCodePreview = (el: HTMLElement, theme: string) => {
			const themes: Record<string, [string, string]> = {
				"atom-one-dark": ["#282c34", "#abb2bf"],
				"github": ["#f6f8fa", "#1f2328"],
				"github-dark": ["#0d1117", "#e6edf3"],
				"dracula": ["#282a36", "#f8f8f2"],
				"light": ["#fafafa", "#333333"],
			};
			const [bg, fg] = themes[theme] ?? ["transparent", ""];
			el.style.background = bg;
			el.style.color = fg;
			el.style.padding = "1px 6px";
			el.style.borderRadius = "3px";
		};
		applyCodePreview(codeThemeSetting.nameEl, tokens.codeTheme);

		const blockquoteSetting = new Setting(editorBody)
			.setName("引用样式")
			.addDropdown((dd) =>
				dd
					.addOption("card", "卡片 (左竖条+底色)")
					.addOption("border-left", "左竖条")
					.addOption("minimal", "极简")
					.setValue(tokens.blockquoteStyle)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, blockquoteStyle: v as BlockquoteStyle });
						applyQuotePreview(blockquoteSetting.nameEl, v, tokens.themeColor);
						this.renderPreview();
					}),
			);
		const applyQuotePreview = (el: HTMLElement, style: string, accent: string) => {
			el.style.borderLeft = "none";
			el.style.background = "transparent";
			el.style.padding = "0";
			el.style.borderRadius = "";
			if (style === "card") {
				el.style.borderLeft = `3px solid ${accent}`;
				el.style.background = "var(--background-modifier-hover)";
				el.style.padding = "2px 8px";
				el.style.borderRadius = "0 4px 4px 0";
			} else if (style === "border-left") {
				el.style.borderLeft = `3px solid ${accent}`;
				el.style.paddingLeft = "8px";
			}
		};
		applyQuotePreview(blockquoteSetting.nameEl, tokens.blockquoteStyle, tokens.themeColor);

		const linkColorSetting = new Setting(editorBody)
			.setName("链接颜色")
			.setDesc("跟随主题色时取色与主题色一致即可")
			.addColorPicker((cp) =>
				cp
					.setValue(tokens.linkColor || tokens.themeColor)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, linkColor: v });
						linkColorSetting.nameEl.style.color = v || tokens.themeColor;
						this.renderPreview();
					}),
			);
		linkColorSetting.nameEl.style.color = tokens.linkColor || tokens.themeColor;

		const spacingSetting = new Setting(editorBody)
			.setName("间距")
			.addDropdown((dd) =>
				dd
					.addOption("compact", "紧凑")
					.addOption("normal", "正常")
					.addOption("loose", "宽松")
					.setValue(tokens.spacing)
					.onChange(async (v) => {
						if (!this.templateStore) return;
						this.templateStore.updateTokens(pack.id, { ...tokens, spacing: v as Spacing });
						applySpacingPreview(spacingSetting.settingEl, v);
						this.renderPreview();
					}),
			);
		const applySpacingPreview = (el: HTMLElement, spacing: string) => {
			const margins: Record<string, string> = { compact: "2px", normal: "", loose: "14px" };
			el.style.marginBottom = margins[spacing] ?? "";
		};
		applySpacingPreview(spacingSetting.settingEl, tokens.spacing);
	}

	private populateTemplates(): void {
		this.templateSelectEl.empty();
		const packs = getAvailablePacksForPlatform(
			this.activePlatformId,
			this.plugin.settings.templates.userPacks,
		);
		for (const pack of packs) {
			const label = pack.source === "user" ? `${pack.name} (U)` : pack.name;
			const opt = this.templateSelectEl.createEl("option", {
				text: label,
				value: pack.id,
			});
			if (pack.id === this.activeTemplateId) opt.selected = true;
		}
		if (!packs.some((p) => p.id === this.activeTemplateId) && packs.length > 0) {
			this.activeTemplateId = packs[0].id;
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

	private getActiveTemplate(_adapter: PlatformAdapter): Template {
		const compiled = compilePackForPlatform(
			this.activeTemplateId,
			this.activePlatformId as PlatformId,
			this.plugin.settings.templates.userPacks,
		);
		if (compiled) return compiled;
		// Fallback: first available pack
		const packs = getAvailablePacksForPlatform(
			this.activePlatformId,
			this.plugin.settings.templates.userPacks,
		);
		if (packs.length > 0) {
			this.activeTemplateId = packs[0].id;
			return compilePackForPlatform(packs[0].id, this.activePlatformId as PlatformId, this.plugin.settings.templates.userPacks)!;
		}
		throw new Error("没有可用的模板");
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
			this.previewEl.empty();
			const range = activeDocument.createRange();
			// eslint-disable-next-line no-unsanitized/method -- html comes from our own marked + juice pipeline (trusted)
			this.previewEl.appendChild(range.createContextualFragment(html));
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
			// 公众号 / 头条号都有独立标题输入框，正文不应再带 H1（否则会出现重复标题）。
			const platformId = adapter.meta.id;
			const hasNativeTitleInput =
				platformId === "wechat" || platformId === "toutiao" || platformId === "zhihu" || platformId === "xiaohongshu";
			const md = hasNativeTitleInput ? (this.currentMarkdown ?? "") : this.buildMarkdownWithTitle();
			const html = await adapter.format(
				md,
				template,
				this.plugin.settings.tweaks,
			);
			// 微信 / 头条号 / 知乎都走 Obsidian 内嵌 webview，免外部 Chrome
			if (platformId === "wechat") {
				this.setStatus("打开内嵌浏览器…");
				const view = await this.plugin.openWeChatBrowser();
				await view.submitPayload({ title: this.currentTitle, html });
				this.setStatus("已切到嵌入浏览器执行注入");
				return;
			}
			if (platformId === "toutiao") {
				this.setStatus("打开头条号嵌入浏览器…");
				const view = await this.plugin.openToutiaoBrowser();
				await view.submitPayload({ title: this.currentTitle, html });
				this.setStatus("已切到头条号嵌入浏览器执行注入");
				return;
			}
			if (platformId === "zhihu") {
				this.setStatus("打开知乎嵌入浏览器…");
				const view = await this.plugin.openZhihuBrowser();
				await view.submitPayload({ title: this.currentTitle, html });
				this.setStatus("已切到知乎嵌入浏览器执行注入");
				return;
			}
			if (platformId === "xiaohongshu") {
				this.setStatus("打开小红书嵌入浏览器…");
				const view = await this.plugin.openXiaohongshuBrowser();
				await view.submitPayload({ title: this.currentTitle, html });
				this.setStatus("已切到小红书嵌入浏览器执行注入");
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
