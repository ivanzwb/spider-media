import { App, PluginSettingTab, Setting } from "obsidian";
import type SpiderMediaPlugin from "@/main";

export class SpiderMediaSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: SpiderMediaPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl("h2", { text: "Spider Media — 自媒体发布" });

		new Setting(containerEl)
			.setName("默认平台")
			.setDesc("打开发布视图时默认选中的平台 ID")
			.addText((text) =>
				text
					.setPlaceholder("wechat")
					.setValue(this.plugin.settings.defaultPlatform)
					.onChange(async (value) => {
						this.plugin.settings.defaultPlatform = value.trim() || "wechat";
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("小图内嵌阈值 (KB)")
			.setDesc("小于该值的图片转 base64 内嵌；大图保留路径或后续走图床")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.imageInlineThresholdKB))
					.onChange(async (value) => {
						const n = Number(value);
						if (Number.isFinite(n) && n > 0) {
							this.plugin.settings.imageInlineThresholdKB = n;
							await this.plugin.saveSettings();
						}
					}),
			);

		containerEl.createEl("h3", { text: "微信公众号" });

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"内嵌 Electron webview，partition 持久会话。命令面板执行「打开嵌入式微信公众号浏览器」即可扫码登录（一次即可），后续发布会自动注入到该 webview。",
			);

		containerEl.createEl("h3", { text: "头条号" });

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"同微信，使用嵌入式 webview 方式。命令面板执行「打开嵌入式头条号浏览器」登录后即可发布。",
			);

		containerEl.createEl("h3", { text: "知乎" });

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"同微信，使用嵌入式 webview 方式。命令面板执行「打开嵌入式知乎浏览器」登录后即可发布到「写文章」页面。",
			);

		containerEl.createEl("h3", { text: "默认排版参数" });

		const t = this.plugin.settings.tweaks;
		this.numberSetting(containerEl, "字号 (px)", t.fontSize, (v) => {
			this.plugin.settings.tweaks.fontSize = v;
		});
		this.numberSetting(containerEl, "行高", t.lineHeight, (v) => {
			this.plugin.settings.tweaks.lineHeight = v;
		});
		this.numberSetting(containerEl, "段间距 (px)", t.paragraphSpacing, (v) => {
			this.plugin.settings.tweaks.paragraphSpacing = v;
		});
		this.numberSetting(containerEl, "页面内边距 (px)", t.pagePadding, (v) => {
			this.plugin.settings.tweaks.pagePadding = v;
		});
		this.numberSetting(containerEl, "图片圆角 (px)", t.imageRadius, (v) => {
			this.plugin.settings.tweaks.imageRadius = v;
		});

		new Setting(containerEl).setName("主题色").addText((text) =>
			text
				.setValue(this.plugin.settings.tweaks.themeColor)
				.onChange(async (value) => {
					this.plugin.settings.tweaks.themeColor = value.trim() || "#07C160";
					await this.plugin.saveSettings();
				}),
		);

		new Setting(containerEl)
			.setName("标题装饰")
			.setDesc("在模板基础上额外覆盖 h2/h3 样式")
			.addDropdown((dd) =>
				dd
					.addOption("template", "跟随模板")
					.addOption("underline", "下划线")
					.addOption("bordered", "描边胶囊")
					.addOption("numbered", "左竖条 + 渐变")
					.setValue(this.plugin.settings.tweaks.headingStyle)
					.onChange(async (value) => {
						this.plugin.settings.tweaks.headingStyle = value as typeof this.plugin.settings.tweaks.headingStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("代码块配色")
			.setDesc("覆盖模板默认的 pre/code 配色")
			.addDropdown((dd) =>
				dd
					.addOption("template", "跟随模板")
					.addOption("dark", "暗色")
					.addOption("light", "浅色")
					.addOption("github", "GitHub Light")
					.addOption("dracula", "Dracula")
					.setValue(this.plugin.settings.tweaks.codeTheme)
					.onChange(async (value) => {
						this.plugin.settings.tweaks.codeTheme = value as typeof this.plugin.settings.tweaks.codeTheme;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("首行缩进")
			.setDesc("段落首行缩进 2em (适合文艺/学术风)")
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
