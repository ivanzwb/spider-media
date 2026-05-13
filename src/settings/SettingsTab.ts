import { App, PluginSettingTab, Setting } from "obsidian";
import type SpiderMediaPlugin from "@/main";
import { TemplateManagerModal } from "@/ui/TemplateManagerModal";

export class SpiderMediaSettingTab extends PluginSettingTab {
	constructor(app: App, private plugin: SpiderMediaPlugin) {
		super(app, plugin);
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("默认平台")
			.setDesc("打开发布视图时默认选中的平台 ID")
			.addText((text) =>
				text
					.setPlaceholder("WeChat")
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

		new Setting(containerEl).setName("微信公众号").setHeading();

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"内嵌 Electron webview，partition 持久会话。命令面板执行「打开嵌入式微信公众号浏览器」即可扫码登录（一次即可），后续发布会自动注入到该 webview。",
			);

		new Setting(containerEl).setName("头条号").setHeading();

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"同微信，使用嵌入式 webview 方式。命令面板执行「打开嵌入式头条号浏览器」登录后即可发布。",
			);

		new Setting(containerEl).setName("知乎").setHeading();

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"同微信，使用嵌入式 webview 方式。命令面板执行「打开嵌入式知乎浏览器」登录后即可发布到「写文章」页面。",
			);

		new Setting(containerEl).setName("小红书").setHeading();

		new Setting(containerEl)
			.setName("发布方式")
			.setDesc(
				"内嵌 Electron webview 登录创作中心，命令面板执行「打开嵌入式小红书浏览器」即可。注意：小红书编辑器不支持 HTML，正文会自动转为纯文本，图片需手动上传。",
			);

		new Setting(containerEl).setName("模板管理").setHeading();

		new Setting(containerEl)
			.setName("管理样式模板")
			.setDesc("创建、编辑、导入或导出样式模板")
			.addButton((btn) =>
				btn.setButtonText("打开模板管理器").onClick(() => {
					new TemplateManagerModal(this.app, this.plugin).open();
				}),
			);

		new Setting(containerEl).setName("默认排版参数").setHeading();

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
					.addOption("github", "GitHub light")
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
