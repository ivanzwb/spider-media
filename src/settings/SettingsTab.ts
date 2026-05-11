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
			.setName("Chrome 远程调试 URL")
			.setDesc(
				"启动 Chrome 时加 --remote-debugging-port=9222；填写 http://127.0.0.1:9222 后插件将复用现有浏览器实例",
			)
			.addText((text) =>
				text
					.setPlaceholder("http://127.0.0.1:9222")
					.setValue(this.plugin.settings.wechat.browserURL)
					.onChange(async (value) => {
						this.plugin.settings.wechat.browserURL = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Chrome 可执行文件路径")
			.setDesc("当未启用远程调试时，由 puppeteer-core 启动该 Chrome")
			.addText((text) =>
				text
					.setPlaceholder("C:/Program Files/Google/Chrome/Application/chrome.exe")
					.setValue(this.plugin.settings.wechat.executablePath)
					.onChange(async (value) => {
						this.plugin.settings.wechat.executablePath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("puppeteer-core 模块绝对路径")
			.setDesc(
				"Obsidian 沙箱无法解析 bare 模块名。填入 puppeteer-core 的 node_modules 路径（例如 D:/tools/spider-media/node_modules/puppeteer-core）启用自动化；留空则始终走剪贴板兜底",
			)
			.addText((text) =>
				text
					.setPlaceholder("绝对路径，留空为禁用")
					.setValue(this.plugin.settings.wechat.puppeteerModulePath)
					.onChange(async (value) => {
						this.plugin.settings.wechat.puppeteerModulePath = value.trim();
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("自动化超时 (ms)")
			.addText((text) =>
				text
					.setValue(String(this.plugin.settings.wechat.timeoutMs))
					.onChange(async (value) => {
						const n = Number(value);
						if (Number.isFinite(n) && n > 0) {
							this.plugin.settings.wechat.timeoutMs = n;
							await this.plugin.saveSettings();
						}
					}),
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
