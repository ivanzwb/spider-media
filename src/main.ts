import { addIcon, Plugin, WorkspaceLeaf } from "obsidian";
import type { PlatformAdapter } from "@/platforms/base";
import { WeChatAdapter } from "@/platforms/wechat";
import { ToutiaoAdapter } from "@/platforms/toutiao";
import { ZhihuAdapter } from "@/platforms/zhihu";
import { XiaohongshuAdapter } from "@/platforms/xiaohongshu";
import { SpiderMediaSettingTab } from "@/settings/SettingsTab";
import { DEFAULT_SETTINGS, type SpiderMediaSettings } from "@/settings/types";
import { PlatformEditorView, VIEW_TYPE_SPIDER_MEDIA } from "@/ui/PlatformEditorView";
import { WeChatBrowserView, VIEW_TYPE_WECHAT_BROWSER } from "@/ui/WeChatBrowserView";
import { ToutiaoBrowserView, VIEW_TYPE_TOUTIAO_BROWSER } from "@/ui/ToutiaoBrowserView";
import { ZhihuBrowserView, VIEW_TYPE_ZHIHU_BROWSER } from "@/ui/ZhihuBrowserView";
import { XiaohongshuBrowserView, VIEW_TYPE_XIAOHONGSHU_BROWSER } from "@/ui/XiaohongshuBrowserView";
import { TemplateManagerModal } from "@/ui/TemplateManagerModal";

/**
 * 自定义 Spider Media ribbon 图标。
 *
 * 注意：Obsidian 的 addIcon() 要求 viewBox 为 0 0 100 100，且只接受 <svg> 的
 * 内部内容（不带最外层 <svg> 标签）。颜色用 currentColor 才能跟随主题色。
 */
const SPIDER_MEDIA_ICON_ID = "spider-media-icon";
const SPIDER_MEDIA_ICON_SVG = `
  <g fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">
    <!-- 蜘蛛腿 -->
    <path d="M30 40 L15 25" />
    <path d="M30 50 L10 45" />
    <path d="M30 60 L15 75" />
    <path d="M70 40 L85 25" />
    <path d="M70 50 L90 45" />
    <path d="M70 60 L85 75" />
    <!-- 头 -->
    <circle cx="50" cy="30" r="10" />
    <!-- 触须 -->
    <path d="M45 22 L42 14" />
    <path d="M55 22 L58 14" />
    <!-- 腹部 -->
    <ellipse cx="50" cy="58" rx="22" ry="28" />
    <!-- 向下箭头：发布/同步寓意 -->
    <path d="M50 48 L50 68" />
    <path d="M42 60 L50 68 L58 60" />
  </g>
`;

export default class SpiderMediaPlugin extends Plugin {
	settings!: SpiderMediaSettings;
	platforms: Map<string, PlatformAdapter> = new Map();

	async onload(): Promise<void> {
		addIcon(SPIDER_MEDIA_ICON_ID, SPIDER_MEDIA_ICON_SVG);
		await this.loadSettings();
		this.registerPlatforms();

		this.registerView(
			VIEW_TYPE_SPIDER_MEDIA,
			(leaf) => new PlatformEditorView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_WECHAT_BROWSER,
			(leaf) => new WeChatBrowserView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_TOUTIAO_BROWSER,
			(leaf) => new ToutiaoBrowserView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_ZHIHU_BROWSER,
			(leaf) => new ZhihuBrowserView(leaf, this),
		);
		this.registerView(
			VIEW_TYPE_XIAOHONGSHU_BROWSER,
			(leaf) => new XiaohongshuBrowserView(leaf, this),
		);

		this.addRibbonIcon(SPIDER_MEDIA_ICON_ID, "打开自媒体发布编辑器", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-editor",
			name: "打开自媒体发布编辑器",
			callback: () => void this.activateView(),
		});

		this.addCommand({
			id: "open-wechat-embedded-browser",
			name: "打开嵌入式微信公众号浏览器",
			callback: () => void this.openWeChatBrowser(),
		});

		this.addCommand({
			id: "open-toutiao-embedded-browser",
			name: "打开嵌入式头条号浏览器",
			callback: () => void this.openToutiaoBrowser(),
		});

		this.addCommand({
			id: "open-zhihu-embedded-browser",
			name: "打开嵌入式知乎浏览器",
			callback: () => void this.openZhihuBrowser(),
		});

		this.addCommand({
			id: "open-xiaohongshu-embedded-browser",
			name: "打开嵌入式小红书浏览器",
			callback: () => void this.openXiaohongshuBrowser(),
		});

		this.addCommand({
			id: "publish-active-note-to-default",
			name: "同步当前笔记到默认平台",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.activateView();
				return true;
			},
		});

		this.addCommand({
			id: "open-template-manager",
			name: "打开样式模板管理器",
			callback: () => {
				new TemplateManagerModal(this.app, this).open();
			},
		});

		this.addSettingTab(new SpiderMediaSettingTab(this.app, this));
	}

	onunload(): void {




	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SpiderMediaSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(data ?? {}),
			tweaks: { ...DEFAULT_SETTINGS.tweaks, ...(data?.tweaks ?? {}) },
			wechat: { ...DEFAULT_SETTINGS.wechat, ...(data?.wechat ?? {}) },
			toutiao: { ...DEFAULT_SETTINGS.toutiao, ...(data?.toutiao ?? {}) },
			zhihu: { ...DEFAULT_SETTINGS.zhihu, ...(data?.zhihu ?? {}) },
			xiaohongshu: { ...DEFAULT_SETTINGS.xiaohongshu, ...(data?.xiaohongshu ?? {}) },
		};
		// 迁移：旧版本没有 templates 字段 → 从 wechat.defaultTemplateId 继承
		if (data && !data.templates) {
			this.settings.templates.defaultPackId =
				this.settings.wechat.defaultTemplateId || DEFAULT_SETTINGS.templates.defaultPackId;
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** 当前激活笔记目录变更通知（UI → 平台 image resolver） */
	notifyNoteDir(dir: string): void {
		for (const adapter of this.platforms.values()) {
			const maybe = adapter as PlatformAdapter & { setNoteDir?(dir: string): void };
			maybe.setNoteDir?.(dir);
		}
	}

	private registerPlatforms(): void {
		const wechat = new WeChatAdapter({
			context: { vault: this.app.vault },
			noteDir: "",
			imageInlineThresholdKB: this.settings.imageInlineThresholdKB,
		});
		this.platforms.set(wechat.meta.id, wechat);

		const toutiao = new ToutiaoAdapter({
			context: { vault: this.app.vault },
			noteDir: "",
			imageInlineThresholdKB: this.settings.imageInlineThresholdKB,
		});
		this.platforms.set(toutiao.meta.id, toutiao);

		const zhihu = new ZhihuAdapter({
			context: { vault: this.app.vault },
			noteDir: "",
			imageInlineThresholdKB: this.settings.imageInlineThresholdKB,
		});
		this.platforms.set(zhihu.meta.id, zhihu);

		const xiaohongshu = new XiaohongshuAdapter({
			context: { vault: this.app.vault },
			noteDir: "",
			imageInlineThresholdKB: this.settings.imageInlineThresholdKB,
		});
		this.platforms.set(xiaohongshu.meta.id, xiaohongshu);
	}

	private async activateView(): Promise<void> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_SPIDER_MEDIA)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getRightLeaf(false);
			if (!leaf) leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_SPIDER_MEDIA, active: true });
		}
		workspace.revealLeaf(leaf);
		const view = leaf.view;
		if (view instanceof PlatformEditorView) {
			await view.loadActiveFile();
		}
	}

	/** 在主编辑区打开嵌入式微信浏览器（独占一个大 tab），并返回视图实例 */
	async openWeChatBrowser(): Promise<WeChatBrowserView> {
		return this.openEmbeddedBrowser(VIEW_TYPE_WECHAT_BROWSER) as Promise<WeChatBrowserView>;
	}

	/** 在主编辑区打开嵌入式头条号浏览器 */
	async openToutiaoBrowser(): Promise<ToutiaoBrowserView> {
		return this.openEmbeddedBrowser(VIEW_TYPE_TOUTIAO_BROWSER) as Promise<ToutiaoBrowserView>;
	}

	/** 在主编辑区打开嵌入式知乎浏览器 */
	async openZhihuBrowser(): Promise<ZhihuBrowserView> {
		return this.openEmbeddedBrowser(VIEW_TYPE_ZHIHU_BROWSER) as Promise<ZhihuBrowserView>;
	}

	/** 在主编辑区打开嵌入式小红书浏览器 */
	async openXiaohongshuBrowser(): Promise<XiaohongshuBrowserView> {
		return this.openEmbeddedBrowser(VIEW_TYPE_XIAOHONGSHU_BROWSER) as Promise<XiaohongshuBrowserView>;
	}

	private async openEmbeddedBrowser(viewType: string): Promise<unknown> {
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(viewType)[0] ?? null;
		if (!leaf) {
			leaf = workspace.getLeaf("tab");
			const inSidebar = (leaf as unknown as { getRoot?: () => unknown }).getRoot?.() !==
				(workspace as unknown as { rootSplit?: unknown }).rootSplit;
			if (inSidebar) leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: viewType, active: true });
		}
		workspace.revealLeaf(leaf);
		workspace.setActiveLeaf(leaf, { focus: true });
		return leaf.view;
	}
}
