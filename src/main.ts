import { Plugin, WorkspaceLeaf } from "obsidian";
import type { PlatformAdapter } from "@/platforms/base";
import { WeChatAdapter } from "@/platforms/wechat";
import { ToutiaoAdapter } from "@/platforms/toutiao";
import { SpiderMediaSettingTab } from "@/settings/SettingsTab";
import { DEFAULT_SETTINGS, type SpiderMediaSettings } from "@/settings/types";
import { PlatformEditorView, VIEW_TYPE_SPIDER_MEDIA } from "@/ui/PlatformEditorView";
import { WeChatBrowserView, VIEW_TYPE_WECHAT_BROWSER } from "@/ui/WeChatBrowserView";
import { ToutiaoBrowserView, VIEW_TYPE_TOUTIAO_BROWSER } from "@/ui/ToutiaoBrowserView";

export default class SpiderMediaPlugin extends Plugin {
	settings!: SpiderMediaSettings;
	platforms: Map<string, PlatformAdapter> = new Map();

	async onload(): Promise<void> {
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

		this.addRibbonIcon("message-square", "打开自媒体发布编辑器", () => {
			void this.activateView();
		});

		this.addCommand({
			id: "open-spider-media-view",
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
			id: "publish-active-note-to-default",
			name: "同步当前笔记到默认平台",
			checkCallback: (checking) => {
				const file = this.app.workspace.getActiveFile();
				if (!file) return false;
				if (!checking) void this.activateView();
				return true;
			},
		});

		this.addSettingTab(new SpiderMediaSettingTab(this.app, this));
	}

	onunload(): void {
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_SPIDER_MEDIA);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_WECHAT_BROWSER);
		this.app.workspace.detachLeavesOfType(VIEW_TYPE_TOUTIAO_BROWSER);
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SpiderMediaSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(data ?? {}),
			tweaks: { ...DEFAULT_SETTINGS.tweaks, ...(data?.tweaks ?? {}) },
			wechat: { ...DEFAULT_SETTINGS.wechat, ...(data?.wechat ?? {}) },
			toutiao: { ...DEFAULT_SETTINGS.toutiao, ...(data?.toutiao ?? {}) },
		};
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
