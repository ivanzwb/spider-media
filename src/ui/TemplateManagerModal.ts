import { App, Modal, Notice, Setting } from "obsidian";
import type { TemplatePack, TemplateTokens, BodyFont, BlockquoteStyle, TemplateCodeTheme, Spacing } from "@/core/templates";
import { DEFAULT_TEMPLATE_TOKENS } from "@/core/templates";
import { UserTemplateStore } from "@/core/templates/UserTemplateStore";
import type SpiderMediaPlugin from "@/main";

/**
 * 模板管理器模态框。
 *
 * 布局：
 * ┌──────────────────────────────────────────────────┐
 * │  顶部工具栏: [新建] [复制] [删除] [导入] [导出]   │
 * ├──────────────────┬───────────────────────────────┤
 * │  模板列表         │  Tokens 编辑器                │
 * │  ── 内置          │  主题色 [■] 标题样式 [▼]     │
 * │   ├─ 默认精简     │  正文字体 [▼] 字号 [──]     │
 * │   ├─ 橙心·温暖    │  行高 [──]  代码主题 [▼]    │
 * │   └─ ...          │  引用样式 [▼] 链接色 [■]    │
 * │  ── 自定义        │  间距 [▼]                   │
 * │   ├─ 我的模板     │                             │
 * │   └─ ...          │                             │
 * └──────────────────┴───────────────────────────────┘
 */
export class TemplateManagerModal extends Modal {
	private store: UserTemplateStore;
	private selectedId: string | null = null;
	private listEl!: HTMLElement;
	private editorEl!: HTMLElement;

	constructor(
		app: App,
		plugin: SpiderMediaPlugin,
	) {
		super(app);
		const { settings, saveSettings } = plugin;
		this.store = new UserTemplateStore(settings.templates.userPacks, (packs) => {
			settings.templates.userPacks = packs;
			void saveSettings();
			this.renderList();
			this.renderEditor();
		});
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("sm-template-manager");
		this.modalEl.style.width = "800px";
		this.modalEl.style.height = "600px";

		this.buildToolbar(contentEl);

		const body = contentEl.createDiv({ cls: "sm-template-body" });
		body.style.display = "flex";
		body.style.gap = "16px";
		body.style.height = "calc(100% - 48px)";
		body.style.overflow = "hidden";

		// Left: template list
		const left = body.createDiv({ cls: "sm-template-list" });
		left.style.flex = "0 0 260px";
		left.style.overflowY = "auto";
		left.style.borderRight = "1px solid var(--background-modifier-border)";
		left.style.paddingRight = "8px";
		this.listEl = left;

		// Right: tokens editor
		const right = body.createDiv({ cls: "sm-template-editor" });
		right.style.flex = "1";
		right.style.overflowY = "auto";
		this.editorEl = right;

		this.renderList();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ── Toolbar ────────────────────────────────────────

	private buildToolbar(container: HTMLElement): void {
		const bar = container.createDiv({ cls: "sm-template-toolbar" });
		bar.style.display = "flex";
		bar.style.gap = "8px";
		bar.style.padding = "8px 0";
		bar.style.borderBottom = "1px solid var(--background-modifier-border)";
		bar.style.marginBottom = "12px";

		this.addBtn(bar, "新建", () => {
			const pack = this.store.create();
			this.selectedId = pack.id;
			this.renderList();
			this.renderEditor();
		});

		this.addBtn(bar, "复制选中", () => {
			if (!this.selectedId) return;
			const src = this.store.getPack(this.selectedId);
			if (!src) return;
			const pack = this.store.create(src);
			this.selectedId = pack.id;
			this.renderList();
			this.renderEditor();
		});

		this.addBtn(bar, "删除", () => {
			if (!this.selectedId) return;
			const pack = this.store.getPack(this.selectedId);
			if (!pack || pack.source === "builtin") return;
			this.store.delete(this.selectedId);
			this.selectedId = null;
			this.renderList();
			this.renderEditor();
		});

		this.addBtn(bar, "导入", async () => {
			const text = await navigator.clipboard.readText();
			if (!text) {
				new Notice("剪贴板为空，请先复制模板 JSON");
				return;
			}
			const pack = this.store.importPack(text);
			if (pack) {
				this.selectedId = pack.id;
				this.renderList();
				this.renderEditor();
			}
		});

		this.addBtn(bar, "导出", async () => {
			if (!this.selectedId) return;
			const json = this.store.exportPack(this.selectedId);
			if (!json) return;
			try {
				await navigator.clipboard.writeText(json);
				new Notice("模板 JSON 已复制到剪贴板");
			} catch {
				new Notice("导出失败：无法写入剪贴板");
			}
		});
	}

	private addBtn(parent: HTMLElement, label: string, onClick: () => void): void {
		const btn = parent.createEl("button", { text: label, cls: "sm-btn" });
		btn.addEventListener("click", onClick);
	}

	// ── Template List ──────────────────────────────────

	private renderList(): void {
		this.listEl.empty();

		const allPacks = this.store.getAllAvailable();
		const builtin = allPacks.filter((p) => p.source === "builtin");
		const user = this.store.getAll();

		this.renderGroup("内置模板", builtin);
		if (user.length > 0) this.renderGroup("自定义模板", user);
	}

	private renderGroup(title: string, packs: TemplatePack[]): void {
		const h = this.listEl.createEl("h4", { text: title });
		h.style.margin = "8px 0 4px";
		h.style.fontSize = "13px";
		h.style.color = "var(--text-muted)";

		for (const pack of packs) {
			const row = this.listEl.createDiv({
				cls: `sm-template-row${pack.id === this.selectedId ? " sm-selected" : ""}`,
			});
			row.style.padding = "6px 8px";
			row.style.cursor = "pointer";
			row.style.borderRadius = "4px";
			row.style.display = "flex";
			row.style.alignItems = "center";
			row.style.justifyContent = "space-between";

			if (pack.id === this.selectedId) {
				row.style.background = "var(--interactive-accent)";
				row.style.color = "var(--text-on-accent)";
			}

			row.createSpan({ text: pack.name });

			if (pack.source === "user") {
				const badge = row.createSpan({ text: "U", cls: "sm-badge" });
				badge.style.fontSize = "10px";
				badge.style.padding = "1px 4px";
				badge.style.borderRadius = "3px";
				badge.style.background = "var(--color-yellow)";
				badge.style.color = "#000";
				badge.style.marginLeft = "6px";
			}

			row.addEventListener("click", () => {
				this.selectedId = pack.id;
				this.renderList();
				this.renderEditor();
			});
		}
	}

	// ── Tokens Editor ──────────────────────────────────

	private renderEditor(): void {
		this.editorEl.empty();

		if (!this.selectedId) {
			this.editorEl.createEl("p", {
				text: "请从左侧选择一个模板",
				cls: "sm-hint",
			});
			return;
		}

		const pack = this.store.getPack(this.selectedId);
		if (!pack) {
			this.editorEl.createEl("p", { text: "模板未找到", cls: "sm-hint" });
			return;
		}

		const isBuiltin = pack.source === "builtin";
		const isUser = pack.source === "user";

		const header = this.editorEl.createDiv({ cls: "sm-editor-header" });
		header.style.display = "flex";
		header.style.alignItems = "center";
		header.style.gap = "8px";
		header.style.marginBottom = "16px";

		header.createEl("h3", { text: pack.name });
		if (isBuiltin) {
			const badge = header.createSpan({ text: "内置", cls: "sm-badge" });
			badge.style.fontSize = "11px";
			badge.style.padding = "2px 6px";
			badge.style.borderRadius = "4px";
			badge.style.background = "var(--interactive-accent)";
			badge.style.color = "var(--text-on-accent)";
		}

		// Name field (editable for user templates)
		if (isUser) {
			new Setting(this.editorEl)
				.setName("模板名称")
				.addText((text) =>
					text.setValue(pack.name).onChange(async (v) => {
						this.store.update(pack.id, { name: v || pack.name });
					}),
				);
		}

		// Open a Setting for each token
		const tokens = pack.tokens;

		const themeColorSetting = new Setting(this.editorEl)
			.setName("主题色")
			.addColorPicker((cp) =>
				cp
					.setValue(tokens.themeColor)
					.onChange(async (v) => {
						const val = v || DEFAULT_TEMPLATE_TOKENS.themeColor;
						this.updateTokens(pack.id, { themeColor: val });
						themeColorSetting.nameEl.style.color = val;
					}),
			);
		themeColorSetting.nameEl.style.color = tokens.themeColor;

		const headingSetting = new Setting(this.editorEl)
			.setName("标题装饰")
			.addDropdown((dd) =>
				dd
					.addOption("template", "极简 · 无装饰")
					.addOption("underline", "下划线")
					.addOption("bordered", "描边胶囊")
					.addOption("numbered", "左竖条 + 渐变")
					.setValue(tokens.headingStyle)
					.onChange(async (v) => {
						this.updateTokens(pack.id, { headingStyle: v as typeof tokens.headingStyle });
						applyHeadingPreview(headingSetting.nameEl, v, tokens.themeColor);
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

		const bodyFontSetting = new Setting(this.editorEl)
			.setName("正文字体")
			.addDropdown((dd) =>
				dd
					.addOption("system", "系统默认")
					.addOption("serif", "衬线体 (宋体)")
					.addOption("sans", "无衬线体")
					.setValue(tokens.bodyFont)
					.onChange(async (v) => {
						this.updateTokens(pack.id, { bodyFont: v as BodyFont });
						applyBodyFontPreview(bodyFontSetting.nameEl, v);
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

		const fontSizeSetting = new Setting(this.editorEl)
			.setName("字号 (px)")
			.addSlider((sl) =>
				sl
					.setLimits(14, 18, 1)
					.setValue(tokens.fontSize)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.updateTokens(pack.id, { fontSize: v });
						fontSizeSetting.nameEl.style.fontSize = `${v}px`;
					}),
			);
		fontSizeSetting.nameEl.style.fontSize = `${tokens.fontSize}px`;

		const lineHeightSetting = new Setting(this.editorEl)
			.setName("行高")
			.addSlider((sl) =>
				sl
					.setLimits(1.4, 2.0, 0.05)
					.setValue(tokens.lineHeight)
					.setDynamicTooltip()
					.onChange(async (v) => {
						this.updateTokens(pack.id, { lineHeight: v });
						lineHeightSetting.nameEl.style.lineHeight = String(v);
					}),
			);
		lineHeightSetting.nameEl.style.lineHeight = String(tokens.lineHeight);

		const codeThemeSetting = new Setting(this.editorEl)
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
						this.updateTokens(pack.id, { codeTheme: v as TemplateCodeTheme });
						applyCodePreview(codeThemeSetting.nameEl, v);
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

		const blockquoteSetting = new Setting(this.editorEl)
			.setName("引用样式")
			.addDropdown((dd) =>
				dd
					.addOption("card", "卡片 (左竖条+底色)")
					.addOption("border-left", "左竖条")
					.addOption("minimal", "极简")
					.setValue(tokens.blockquoteStyle)
					.onChange(async (v) => {
						this.updateTokens(pack.id, { blockquoteStyle: v as BlockquoteStyle });
						applyQuotePreview(blockquoteSetting.nameEl, v, tokens.themeColor);
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

		const linkColorSetting = new Setting(this.editorEl)
			.setName("链接颜色")
			.setDesc("跟随主题色时取色与主题色一致即可")
			.addColorPicker((cp) =>
				cp
					.setValue(tokens.linkColor || tokens.themeColor)
					.onChange(async (v) => {
						this.updateTokens(pack.id, { linkColor: v });
						linkColorSetting.nameEl.style.color = v || tokens.themeColor;
					}),
			);
		linkColorSetting.nameEl.style.color = tokens.linkColor || tokens.themeColor;

		const spacingSetting = new Setting(this.editorEl)
			.setName("间距")
			.addDropdown((dd) =>
				dd
					.addOption("compact", "紧凑")
					.addOption("normal", "正常")
					.addOption("loose", "宽松")
					.setValue(tokens.spacing)
					.onChange(async (v) => {
						this.updateTokens(pack.id, { spacing: v as Spacing });
						applySpacingPreview(spacingSetting.settingEl, v);
					}),
			);
		const applySpacingPreview = (el: HTMLElement, spacing: string) => {
			const margins: Record<string, string> = { compact: "2px", normal: "", loose: "14px" };
			el.style.marginBottom = margins[spacing] ?? "";
		};
		applySpacingPreview(spacingSetting.settingEl, tokens.spacing);

		// 内联预览提示
		this.editorEl.createEl("hr");
		this.editorEl.createEl("p", {
			text: "💡 修改后在 PlatformEditorView 中切换到此模板即可查看效果",
			cls: "sm-hint",
		});
	}

	private updateTokens(packId: string, patch: Partial<TemplateTokens>): void {
		const pack = this.store.getPack(packId);
		if (!pack || pack.source === "builtin") return;
		this.store.updateTokens(packId, { ...pack.tokens, ...patch });
	}
}
