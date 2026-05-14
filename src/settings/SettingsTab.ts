import { App, PluginSettingTab, Setting } from "obsidian";
import type SpiderMediaPlugin from "@/main";

export class SpiderMediaSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: SpiderMediaPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("默认平台")
			.setDesc("打开发布视图时默认选中的平台")
			.addText((text) =>
				text
					.setPlaceholder("wechat")
					.setValue(this.plugin.settings.defaultPlatform)
					.onChange(async (value) => {
						this.plugin.settings.defaultPlatform = value.trim() || "wechat";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl).setName("全局覆盖参数").setHeading();

		const t = this.plugin.settings.tweaks;
		this.numberSetting(containerEl, "段间距 (px)", t.paragraphSpacing, (v) => {
			this.plugin.settings.tweaks.paragraphSpacing = v;
		});
		this.numberSetting(containerEl, "页面内边距 (px)", t.pagePadding, (v) => {
			this.plugin.settings.tweaks.pagePadding = v;
		});
		this.numberSetting(containerEl, "图片圆角 (px)", t.imageRadius, (v) => {
			this.plugin.settings.tweaks.imageRadius = v;
		});

		new Setting(containerEl)
			.setName("首行缩进")
			.setDesc("段落首行缩进 2em（适合文艺/学术风）")
			.addToggle((tg) =>
				tg.setValue(this.plugin.settings.tweaks.firstLineIndent).onChange(async (v) => {
					this.plugin.settings.tweaks.firstLineIndent = v;
					await this.plugin.saveSettings();
				}),
			);
	}

	private numberSetting(
		container: HTMLElement,
		name: string,
		value: number,
		setter: (v: number) => void,
	): void {
		new Setting(container).setName(name).addText((text) =>
			text.setValue(String(value)).onChange(async (raw) => {
				const n = Number(raw);
				if (Number.isFinite(n)) {
					setter(n);
					await this.plugin.saveSettings();
				}
			}),
		);
	}
}
