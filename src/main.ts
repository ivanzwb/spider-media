import { Plugin, WorkspaceLeaf } from "obsidian";
import type { PlatformAdapter } from "@/platforms/base";
import { WeChatAdapter } from "@/platforms/wechat";
import { SpiderMediaSettingTab } from "@/settings/SettingsTab";
import { DEFAULT_SETTINGS, type SpiderMediaSettings } from "@/settings/types";
import { PlatformEditorView, VIEW_TYPE_SPIDER_MEDIA } from "@/ui/PlatformEditorView";
import { WeChatBrowserView, VIEW_TYPE_WECHAT_BROWSER } from "@/ui/WeChatBrowserView";

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
	}

	async loadSettings(): Promise<void> {
		const data = (await this.loadData()) as Partial<SpiderMediaSettings> | null;
		this.settings = {
			...DEFAULT_SETTINGS,
			...(data ?? {}),
			tweaks: { ...DEFAULT_SETTINGS.tweaks, ...(data?.tweaks ?? {}) },
			wechat: { ...DEFAULT_SETTINGS.wechat, ...(data?.wechat ?? {}) },
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
			automator: () => ({
				browserURL: this.settings.wechat.browserURL || undefined,
				executablePath: this.settings.wechat.executablePath || undefined,
				puppeteerModulePath: this.settings.wechat.puppeteerModulePath || undefined,
				timeoutMs: this.settings.wechat.timeoutMs,
			}),
		});
		this.platforms.set(wechat.meta.id, wechat);
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
		const { workspace } = this.app;
		let leaf: WorkspaceLeaf | null =
			workspace.getLeavesOfType(VIEW_TYPE_WECHAT_BROWSER)[0] ?? null;
		if (!leaf) {
			// 强制开在主编辑区域（root），避免落到右侧/底部小窗
			leaf = workspace.getLeaf("tab");
			// 如果当前活动 leaf 在 sidebar，getLeaf("tab") 会跟着开在 sidebar；
			// 用 getLeaf(true) 兜底创建主区新 tab
			const inSidebar = (leaf as unknown as { getRoot?: () => unknown }).getRoot?.() !==
				(workspace as unknown as { rootSplit?: unknown }).rootSplit;
			if (inSidebar) leaf = workspace.getLeaf(true);
			await leaf.setViewState({ type: VIEW_TYPE_WECHAT_BROWSER, active: true });
		}
		workspace.revealLeaf(leaf);
		workspace.setActiveLeaf(leaf, { focus: true });
		return leaf.view as WeChatBrowserView;
	}
}
