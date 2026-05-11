import type {
	Credentials,
	FormatTweaks,
	PlatformMeta,
	PublishResult,
	Template,
} from "./types";

/** 所有平台必须实现的契约 */
export abstract class PlatformAdapter {
	abstract readonly meta: PlatformMeta;

	/** 返回该平台可用的样式模板 */
	abstract getTemplates(): Template[];

	/** Markdown → 平台就绪 HTML */
	abstract format(
		markdown: string,
		template: Template,
		tweaks: FormatTweaks,
	): Promise<string>;

	/** 推送到平台后台编辑器；失败时由实现负责剪贴板兜底 */
	abstract publish(
		html: string,
		title: string,
		credentials: Credentials,
	): Promise<PublishResult>;
}
