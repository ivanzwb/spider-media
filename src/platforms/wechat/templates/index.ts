import type { Template } from "@/platforms/base";
import { wechatDefaultTemplate } from "./default";
import { wechatWarmTemplate } from "./warm";
import { wechatBlueTemplate } from "./blue";
import { wechatSerifTemplate } from "./serif";
import { wechatMinimalTemplate } from "./minimal";

export const WECHAT_TEMPLATES: Template[] = [
	wechatDefaultTemplate,
	wechatWarmTemplate,
	wechatBlueTemplate,
	wechatSerifTemplate,
	wechatMinimalTemplate,
];

export {
	wechatDefaultTemplate,
	wechatWarmTemplate,
	wechatBlueTemplate,
	wechatSerifTemplate,
	wechatMinimalTemplate,
};
