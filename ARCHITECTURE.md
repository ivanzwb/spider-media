# Spider Media — 架构设计文档

> Obsidian 插件，将 Markdown 文章一键发布到微信公众号、头条号等自媒体平台。
> 发布通道基于 Obsidian 进程内嵌的 Electron `<webview>` 完成。

---

## 目录

1. [项目概述](#1-项目概述)
2. [总体架构](#2-总体架构)
3. [模块详解](#3-模块详解)
   - 3.1 [插件入口 (main.ts)](#31-插件入口-maints)
   - 3.2 [Core Pipeline](#32-core-pipeline)
   - 3.3 [Platform Adapter 体系](#33-platform-adapter-体系)
   - 3.4 [Markdown 格式化管线](#34-markdown-格式化管线)
   - 3.5 [Mermaid 转换](#35-mermaid-转换)
   - 3.6 [图片管理](#36-图片管理)
   - 3.7 [嵌入式 Webview 发布视图](#37-嵌入式-webview-发布视图)
   - 3.8 [UI 层 (PlatformEditorView)](#38-ui-层-platformeditorview)
   - 3.9 [设置与持久化](#39-设置与持久化)
4. [扩展新平台](#4-扩展新平台)
5. [技术决策](#5-技术决策)
6. [依赖清单](#6-依赖清单)
7. [发布流程全景](#7-发布流程全景)
8. [参考项目](#8-参考项目)

---

## 1. 项目概述

### 1.1 要解决的问题

Obsidian 用户写好 Markdown 笔记后，需要手动复制内容到各个自媒体平台编辑器，重复进行格式调整、图片上传、代码块适配等操作。不同平台的格式要求各异（微信公众号仅支持内联样式、头条号有特定 HTML 约束），导致发布效率低下。

### 1.2 核心目标

| 目标 | 说明 |
|------|------|
| **一键发布** | 从 Obsidian 直接推送到平台后台编辑器，用户只需 Review 后点击发布 |
| **格式保真** | Mermaid→图片、代码块保留样式、图片不丢失、手机阅读优化 |
| **易于扩展** | 新平台只需实现一个接口即可接入 |
| **模板可定制** | 格式模板独立于代码，适配平台格式变化只需修改模板配置 |

### 1.3 非目标

- 不提供文章管理、定时发布等 CMS 功能
- 不替代平台后台的最终发布按钮（用户始终 Review 后手动发布）
- 不实现移动端支持 (`isDesktopOnly: true`，依赖 Electron `<webview>`)
- 不依赖外部 Chrome 或浏览器自动化框架；发布全部在 Obsidian 进程内的嵌入 webview 完成

---

## 2. 总体架构

### 2.1 四层架构

```
┌────────────────────────────────────────────────────────────────────┐
│                  OBSIDIAN PLUGIN LAYER (main.ts)                   │
│  Ribbon / Commands / SettingsTab / 三个 ItemView：                 │
│   ── PlatformEditorView   发布控制台（预览 + 平台/模板选择 + 发布）│
│   ── WeChatBrowserView    微信公众号嵌入 webview                    │
│   ── ToutiaoBrowserView   头条号嵌入 webview                        │
└─────────────────────────────┬──────────────────────────────────────┘
                              │
┌─────────────────────────────▼──────────────────────────────────────┐
│                          CORE PIPELINE                              │
│  MarkdownParser → MermaidConverter → ImageManager                   │
│           │                                                         │
│           ▼                                                         │
│  PlatformFormatter（微信 / 头条号 marked 扩展）                      │
│           │                                                         │
│           ▼                                                         │
│  PostProcessor（模板包装 + juice 内联 CSS + tweaks + 后处理修复）    │
└─────────────────────────────┬──────────────────────────────────────┘
                              │ (title, html)
┌─────────────────────────────▼──────────────────────────────────────┐
│                EMBEDDED WEBVIEW INJECTION                           │
│  WeChatBrowserView   → webview.executeJavaScript(注入脚本)          │
│    └─ 正文：__MP_Editor_JSAPI__.invoke("mp_editor_set_content")     │
│    └─ 标题：ProseMirror contenteditable 轮询 + execCommand 写入     │
│    └─ 作者：从账号顶栏读取昵称写入 input                            │
│  ToutiaoBrowserView  → webview.executeJavaScript(注入脚本)          │
│    └─ 标题：execCommand("insertText") 兼容 React/Vue v-model        │
│    └─ 正文：ClipboardEvent('paste') 携 text/html 投到 ProseMirror   │
└────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
MD Source（当前活动 TFile）
   │
   ▼
 MarkdownParser（marked + 平台扩展）
   │
   ├── ```mermaid``` 代码块 → MermaidConverter → PNG <img>（本地渲染 + base64）
   ├── 本地图片            → ImageManager     → base64 / vault 路径
   ├── 代码块              → 逐行 <br/> 拼接，white-space:pre-wrap
   └── 其他 token          → 平台定制 renderer
   │
   ▼
 PostProcessor
   ├── 模板包装（{{CONTENT}} / {{TWEAK_STYLES}}）
   ├── juice 内联 CSS（公众号编辑器不认 class，必须 inline）
   ├── 移除全部 <style> 标签（避免 ProseMirror schema 因首子非块而插入空 <p>）
   ├── compactLists 去除 <li> 间空白
   └── glueCjkPunctuation 修正中文标点的换行/标签嵌套
   │
   ▼
  HTML（title 由 currentTitle 单独传递，正文不再含 H1）
   │
   ▼
  PlatformEditorView.publish()
   │
   ├─ wechat   → plugin.openWeChatBrowser()  → view.submitPayload({title, html})
   └─ toutiao  → plugin.openToutiaoBrowser() → view.submitPayload({title, html})
   │
   ▼
  *BrowserView.runInject()  →  webview.executeJavaScript(注入脚本)
   └─ 用户在 webview 内审查后手动点「发布」
```

---

## 3. 模块详解

### 3.1 插件入口 (main.ts)

**职责**：生命周期、视图注册、命令注册、平台适配器注册、设置加载/保存。业务逻辑下沉到对应模块。

实际行为概览（详见 [src/main.ts](src/main.ts)）：

```typescript
export default class SpiderMediaPlugin extends Plugin {
  settings!: SpiderMediaSettings;
  platforms = new Map<string, PlatformAdapter>();

  async onload() {
    await this.loadSettings();
    this.registerPlatforms();                 // WeChatAdapter / ToutiaoAdapter

    this.registerView(VIEW_TYPE_SPIDER_MEDIA,        (leaf) => new PlatformEditorView(leaf, this));
    this.registerView(VIEW_TYPE_WECHAT_BROWSER,      (leaf) => new WeChatBrowserView(leaf, this));
    this.registerView(VIEW_TYPE_TOUTIAO_BROWSER,     (leaf) => new ToutiaoBrowserView(leaf, this));

    this.addRibbonIcon("message-square", "打开自媒体发布编辑器", () => void this.activateView());
    this.addCommand({ id: "open-spider-media-view",          name: "打开自媒体发布编辑器",        callback: () => void this.activateView() });
    this.addCommand({ id: "open-wechat-embedded-browser",    name: "打开嵌入式微信公众号浏览器", callback: () => void this.openWeChatBrowser() });
    this.addCommand({ id: "open-toutiao-embedded-browser",   name: "打开嵌入式头条号浏览器",     callback: () => void this.openToutiaoBrowser() });

    this.addSettingTab(new SpiderMediaSettingTab(this.app, this));
  }

  /** 在主编辑区开一个独立 tab 放嵌入 webview */
  async openWeChatBrowser():  Promise<WeChatBrowserView>  { /* 共用 openEmbeddedBrowser */ }
  async openToutiaoBrowser(): Promise<ToutiaoBrowserView> { /* 共用 openEmbeddedBrowser */ }
}
```

要点：
- 三个视图通过 `VIEW_TYPE_*` 常量注册，`onunload` 全部 detach
- `openEmbeddedBrowser` 强制把 webview 开在 rootSplit（主编辑区），避免落到右侧/底部小窗
- 设置使用 `loadData()` / `saveData()`，启动时与 `DEFAULT_SETTINGS` 浅合并

### 3.2 Core Pipeline

#### 3.2.1 MarkdownParser

**职责**: 使用 `marked` 将 MD 解析为 HTML，注入平台特定的 renderer 扩展

```typescript
// src/core/MarkdownParser.ts

import { marked } from "marked";

export interface ParserOptions {
  platformId: string;
  mermaidConverter: (code: string) => Promise<string>;
  imageResolver: (src: string) => Promise<string>;
}

export class MarkdownParser {
  private extensions: marked.MarkedExtension[];

  constructor(platformExtensions: marked.MarkedExtension[]) {
    this.extensions = [
      // 全局扩展 (所有平台共享)
      this.createMermaidExtension(),  // ```mermaid → <img>
      this.createCodeExtension(),     // 代码块高亮包装
      this.createImageExtension(),    // 图片处理
      // 平台特定扩展 (由 PlatformFormatter 提供)
      ...platformExtensions,
    ];
  }

  async parse(markdown: string, options: ParserOptions): Promise<string> {
    marked.use({ extensions: this.extensions });
    let html = await marked.parse(markdown);
    return html;
  }

  private createMermaidExtension(): marked.MarkedExtension {
    return {
      extensions: [{
        name: "mermaid",
        level: "block",
        start(src: string) { return src.match(/```mermaid\n/)?.index; },
        tokenizer(src: string) {
          const match = src.match(/^```mermaid\n([\s\S]*?)```\n?/);
          if (match) {
            return {
              type: "mermaid",
              raw: match[0],
              code: match[1].trim(),
              tokens: [],
            };
          }
          return undefined;
        },
        renderer(token: any) {
          // 转换为图片占位，后续由 MermaidConverter 处理
          return `<img src="__MERMAID__${encodeURIComponent(token.code)}__" alt="mermaid-diagram" class="mermaid-diagram" />\n`;
        },
      }],
    };
  }

  private createCodeExtension(): marked.MarkedExtension {
    return {
      renderer: {
        code({ text, lang }: { text: string; lang?: string }) {
          const langClass = lang ? ` class="language-${lang}"` : "";
          return `<pre><code${langClass}>${escapeHtml(text)}</code></pre>\n`;
        },
      },
    };
  }

  private createImageExtension(): marked.MarkedExtension {
    return {
      renderer: {
        image({ href, title, text }: { href: string; title?: string; text?: string }) {
          // 图片处理委托给 ImageManager
          return `<img src="${href}" alt="${text || ""}"${title ? ` title="${title}"` : ""} />`;
        },
      },
    };
  }
}
```

#### 3.2.2 PostProcessor

**职责**: HTML 后处理 — 模板包装 + 样式内联

```typescript
// src/core/PostProcessor.ts

import juice from "juice";

export interface PostProcessOptions {
  template: string;         // 模板 HTML 骨架
  templateStyles: string;   // 模板 CSS
  formatTweaks: {           // 用户调优参数
    fontSize: number;
    lineHeight: number;
    paragraphSpacing: number;
    firstLineIndent: boolean;
    pagePadding: number;
    letterSpacing: number;
    imageRadius: number;
    themeColor: string;
  };
}

export class PostProcessor {
  process(html: string, options: PostProcessOptions): string {
    // 1. 将 HTML 嵌入模板
    let output = options.template.replace("{{CONTENT}}", html);

    // 2. 注入用户调优参数为 CSS 变量
    const tweakCSS = this.buildTweakCSS(options.formatTweaks);
    output = output.replace("{{TWEAK_STYLES}}", tweakCSS);

    // 3. 合并模板样式
    const fullCSS = options.templateStyles + "\n" + tweakCSS;

    // 4. CSS 内联化 (微信强制要求 inline style)
    output = juice(output, {
      removeStyleTags: false,
      preserveImportant: true,
      extraCss: fullCSS,
    });

    return output;
  }

  private buildTweakCSS(tweaks: FormatTweaks): string {
    return `
      .article-content {
        font-size: ${tweaks.fontSize}px !important;
        line-height: ${tweaks.lineHeight} !important;
        letter-spacing: ${tweaks.letterSpacing}px !important;
        ${tweaks.firstLineIndent ? "text-indent: 2em !important;" : ""}
      }
      .article-content p {
        margin-bottom: ${tweaks.paragraphSpacing}px !important;
      }
      .article-wrapper {
        padding: ${tweaks.pagePadding}px !important;
      }
      .article-content img {
        border-radius: ${tweaks.imageRadius}px !important;
      }
    `;
  }
}
```

### 3.3 Platform Adapter 体系

这是 **扩展性核心**。每个平台继承统一接口，只需关注平台差异。

#### 3.3.1 抽象基类

```typescript
// src/platforms/base/PlatformAdapter.ts

/** 平台识别与元数据 */
export interface PlatformMeta {
  id: string;               // "wechat" | "toutiao" | "zhihu"
  name: string;             // "微信公众号" | "头条号"
  icon: string;             // Obsidian icon identifier
  color: string;            // 主题色
  isDesktopOnly: boolean;   // Spider Media 当前所有适配器都为 true（依赖 Electron <webview>）
}

/** 发布结果（嵌入式 webview 模式下，真实发布动作由用户在 webview 中手动完成） */
export interface PublishResult {
  success: boolean;
  stage: "format" | "fill" | "fallback" | "done";
  message: string;
  url?: string;
}

export abstract class PlatformAdapter {
  abstract meta: PlatformMeta;

  /** 获取该平台可用的样式模板列表 */
  abstract getTemplates(): Promise<Template[]>;

  /** 格式化: MD → 平台就绪 HTML */
  abstract format(
    markdown: string,
    template: Template,
    tweaks: FormatTweaks,
  ): Promise<string>;

  /**
   * 发布占位接口。
   * 微信 / 头条号目前由 PlatformEditorView 路由到对应的 *BrowserView 完成注入，
   * 此处仅返回 fallback 提示；新增平台若没有内置 BrowserView，可在此实现自动化逻辑。
   */
  abstract publish(
    html: string,
    title: string,
  ): Promise<PublishResult>;

  /** 切换当前笔记所在目录，用于解析相对路径图片 */
  abstract setNoteDir(dir: string): void;
}
```

#### 3.3.2 WeChatAdapter 实现

```typescript
// src/platforms/wechat/adapter.ts

export class WeChatAdapter implements PlatformAdapter {
  meta: PlatformMeta = {
    id: "wechat",
    name: "微信公众号",
    icon: "message-square",
    color: "#07C160",
    isDesktopOnly: true,
  };

  private formatter = new WeChatFormatter();
  private postProcessor = new PostProcessor();
  private imageManager?: ImageManager;

  async getTemplates(): Promise<Template[]> {
    return WECHAT_TEMPLATES;     // src/platforms/wechat/templates/index.ts
  }

  async format(markdown: string, template: Template, tweaks: FormatTweaks): Promise<string> {
    const parser = new MarkdownParser(this.formatter.getExtensions());
    let html = await parser.parse(markdown, {
      platformId: "wechat",
      mermaidConverter: (code) => MermaidConverter.render(code, { format: "png" }),
      imageResolver:    (src)  => this.imageManager?.resolve(src) ?? src,
    });
    return this.postProcessor.process(html, {
      template: template.html,
      templateStyles: template.styles,
      formatTweaks: tweaks,
    });
  }

  /** 实际发布走 WeChatBrowserView，这里仅做兜底提示 */
  async publish(): Promise<PublishResult> {
    return {
      success: false,
      stage: "fallback",
      message: "请使用嵌入式微信公众号浏览器发布。",
    };
  }

  setNoteDir(dir: string): void {
    this.imageManager = new ImageManager(dir);
  }
}
```

#### 3.3.3 WeChatFormatter (marked 定制)

**核心原理**: 微信公众号编辑器只认内联样式 + 有限 HTML 标签。利用 `marked` 的 `renderer` 重写每个 token 的 HTML 输出。

```typescript
// src/platforms/wechat/WeChatFormatter.ts

export class WeChatFormatter {
  getExtensions(): marked.MarkedExtension[] {
    return [
      {
        renderer: {
          // 标题: 公众号用特定字号 + 颜色 + 边框
          heading({ tokens, depth }: marked.Tokens.Heading) {
            const text = this.parser.parseInline(tokens);
            const sizes = { 1: "22px", 2: "18px", 3: "16px", 4: "15px", 5: "14px", 6: "14px" };
            const colors = { 1: "#333", 2: "#555", 3: "#666" };
            const size = sizes[depth as keyof typeof sizes] || "14px";
            const color = colors[depth as keyof typeof colors] || "#888";
            return `<h${depth} style="font-size:${size};color:${color};font-weight:bold;margin:1em 0 0.5em 0;">${text}</h${depth}>`;
          },

          // 段落: 两端对齐 + 移动端优化间距
          paragraph({ tokens }: marked.Tokens.Paragraph) {
            const text = this.parser.parseInline(tokens);
            return `<p style="text-align:justify;margin:0 0 16px 0;line-height:1.8;">${text}</p>`;
          },

          // 引用: 左侧彩色边框卡片
          blockquote({ tokens }: marked.Tokens.Blockquote) {
            const body = this.parser.parse(tokens);
            return `<blockquote style="border-left:4px solid var(--theme-color,#07C160);padding:10px 15px;margin:10px 0;background:#f8f8f8;border-radius:0 4px 4px 0;">${body}</blockquote>`;
          },

          // 代码块: 深色背景 + 等宽字体 + 圆角
          code({ text, lang }: marked.Tokens.Code) {
            return `<pre style="background:#2d2d2d;color:#f8f8f2;padding:16px;border-radius:6px;overflow-x:auto;font-size:14px;line-height:1.5;margin:10px 0;"><code${lang ? ` class="language-${lang}"` : ""}>${escapeHtml(text)}</code></pre>`;
          },

          // 列表: 更好的间距
          list({ ordered, items, start }: marked.Tokens.List) {
            let body = "";
            for (const item of items) {
              const text = this.parser.parse(item.tokens, !!item.loose);
              body += `<li style="margin:5px 0;line-height:1.8;">${text}</li>`;
            }
            const tag = ordered ? "ol" : "ul";
            const startAttr = ordered && start !== 1 ? ` start="${start}"` : "";
            return `<${tag}${startAttr} style="padding-left:2em;margin:10px 0;">${body}</${tag}>`;
          },

          // 图片: 自适应宽度 + 圆角
          image({ href, title, text }: marked.Tokens.Image) {
            return `<img src="${href}" alt="${text || ""}" style="max-width:100%;border-radius:var(--image-radius,8px);margin:10px 0;display:block;"${title ? ` title="${title}"` : ""} />`;
          },

          // 链接: 主题色 + 下划线
          link({ href, title, tokens }: marked.Tokens.Link) {
            const text = this.parser.parseInline(tokens);
            return `<a href="${href}" style="color:var(--theme-color,#07C160);text-decoration:underline;"${title ? ` title="${title}"` : ""}>${text}</a>`;
          },

          // 分隔线
          hr() {
            return `<hr style="border:none;border-top:1px solid #ddd;margin:20px 0;" />`;
          },
        },
      },
    ];
  }
}
```

#### 3.3.4 TouTiaoFormatter

头条号的 HTML 约束与微信公众号不同，通过不同的 renderer 实现：

```typescript
// src/platforms/toutiao/TouTiaoFormatter.ts

export class TouTiaoFormatter {
  getExtensions(): marked.MarkedExtension[] {
    return [
      {
        renderer: {
          // 头条号: 标题用更大的字号
          heading({ tokens, depth }) {
            const text = this.parser.parseInline(tokens);
            const sizes = { 1: "24px", 2: "20px", 3: "18px" };
            const size = sizes[depth as keyof typeof sizes] || "16px";
            return `<h${depth} style="font-size:${size};font-weight:bold;margin:1.2em 0 0.6em 0;">${text}</h${depth}>`;
          },
          // 头条号: 代码块不同样式
          code({ text, lang }) {
            return `<pre style="background:#f5f5f5;color:#333;padding:12px;border-radius:4px;font-size:13px;border:1px solid #e0e0e0;">${escapeHtml(text)}</pre>`;
          },
          // ... 其他头条特定的 renderer 覆盖
        },
      },
    ];
  }
}
```

### 3.4 Markdown 格式化管线

完整的格式化管线流程图:

```
MD Source
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. 预处理阶段                                                  │
│    ├─ YAML Frontmatter 提取 (标题/作者/标签)                   │
│    ├─ Mermaid 检测 → 替换为占位符                              │
│    └─ 图片路径解析 (相对路径 → 绝对/vault 路径)                │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Marked 解析阶段                                             │
│    ├─ 全局扩展 (Mermaid/代码/图片 handler)                     │
│    └─ 平台扩展 (WeChat/TouTiao 定制 renderer)                 │
│                                                               │
│    Token 类型         WeChat 输出              头条号输出       │
│    ───────────       ────────────            ───────────       │
│    heading           <h2 inline-style>       <h2 inline-style> │
│    code              <pre dark bg>           <pre light bg>    │
│    blockquote        <div card-style>        <blockquote>      │
│    image             <img rounded>           <img>             │
│    link              colored underline       colored           │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Mermaid 渲染                                                │
│    ├─ 扫描占位符 → 提取 mermaid 代码                           │
│    ├─ 调用 MermaidConverter → 生成 PNG                         │
│    ├─ 将图片保存到 vault 临时目录或图床                         │
│    └─ 替换占位符为真实 <img> 标签                               │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. 图片处理                                                    │
│    ├─ 本地图片 → 读取 → base64 内嵌 (小图)                     │
│    ├─ 本地图片 → 上传到图床 → CDN URL (大图)                  │
│    └─ 网络图片 → 透传 / 下载后重新上传                         │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. 模板包装 + 样式内联                                         │
│    ├─ 注入 HTML 骨架 (doctype, viewport meta)                  │
│    ├─ 注入用户调优参数为 CSS 变量                               │
│    ├─ juice(CSS → inline style)                                │
│    └─ 安全过滤 (XSS sanitize)                                  │
└──────────────────────────────────────────────────────────────┘
    │
    ▼
平台就绪 HTML
```

### 3.5 Mermaid 转换

#### 3.5.1 方案对比

| 方案 | 依赖 | 质量 | 速度 | 推荐度 |
|------|------|------|------|--------|
| **Obsidian 内置 Mermaid + Canvas API** | 无 (利用 Obsidian 已加载的 mermaid) | 高 | 快 | ⭐⭐⭐⭐⭐ |
| mermaid.ink HTTP API | 网络请求 | 中 | 中 (需网络) | ⭐⭐⭐ |

#### 3.5.2 推荐方案: Obsidian 内置 Mermaid

```typescript
// src/core/MermaidConverter.ts

export interface MermaidOptions {
  format: "png" | "svg";
  width: number;
  backgroundColor?: string;
}

export class MermaidConverter {
  /**
   * 利用 Obsidian 的 mermaid 渲染能力将代码转为图片
   *
   * 原理:
   * 1. Obsidian 在 window 上注入了 mermaid 实例 (mermaid.run)
   * 2. 创建一个隐藏的 DOM 容器让 mermaid 渲染 SVG
   * 3. 将 SVG 绘制到 Canvas 上
   * 4. 通过 canvas.toBlob() 导出为 PNG
   * 5. 保存到 vault 临时目录
   */
  static async render(
    mermaidCode: string,
    options: MermaidOptions,
    vault: Vault,
  ): Promise<string> {
    // 创建临时渲染容器
    const container = document.createElement("div");
    container.style.cssText = "position:absolute;left:-9999px;top:0;width:800px;";
    container.innerHTML = `<div class="mermaid">${escapeHtml(mermaidCode)}</div>`;
    document.body.appendChild(container);

    try {
      // 调用 mermaid 渲染 (Obsidian 已全局注册)
      await (window as any).mermaid.run({
        nodes: [container.querySelector(".mermaid")],
      });

      const svgEl = container.querySelector("svg");
      if (!svgEl) throw new Error("Mermaid 渲染失败");

      // SVG → Canvas → Blob
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d")!;
      const img = new Image();

      await new Promise<void>((resolve, reject) => {
        img.onload = () => {
          canvas.width = options.width;
          canvas.height = img.height * (options.width / img.width);
          if (options.backgroundColor) {
            ctx.fillStyle = options.backgroundColor;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
          }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve();
        };
        img.onerror = reject;
        img.src = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}`;
      });

      // 导出为 PNG → 保存到 vault
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), "image/png")
      );
      const buffer = await blob.arrayBuffer();
      const fileName = `_publish/mermaid-${Date.now()}.png`;

      await vault.createBinary(fileName, buffer);

      return fileName; // vault 相对路径
    } finally {
      document.body.removeChild(container);
    }
  }
}
```

#### 3.5.3 备选方案: mermaid.ink API (无需本地渲染)

```typescript
// Mermaid 备选方案: 使用在线渲染服务
static async renderViaAPI(code: string): Promise<string> {
  const encoded = encodeURIComponent(code);
  // 支持主题参数 &theme=dark&bgColor=white
  return `https://mermaid.ink/img/${encoded}?type=png`;
}
```

### 3.6 图片管理

```typescript
// src/core/ImageManager.ts

export class ImageManager {
  constructor(
    private vault: Vault,
    private adapterDir: string,  // 插件数据目录
  ) {}

  /**
   * 解析图片: 本地路径 → base64 / 图床URL
   *
   * 策略:
   * - 小图 (< 100KB) → base64 内联 (减少外部请求)
   * - 大图 → 上传到配置的图床 (SM.MS / 阿里OSS / 腾讯COS)
   * - 网络图片 → 透传 (或下载后转存图床)
   */
  async resolve(src: string): Promise<string> {
    // 网络图片: 直接返回
    if (src.startsWith("http://") || src.startsWith("https://")) {
      return src;
    }

    // Obsidian URI: 解析 vault 路径
    let filePath = src;
    if (src.startsWith("obsidian://")) {
      filePath = this.resolveObsidianUri(src);
    }

    // 相对路径 → vault 绝对路径
    const file = this.vault.getFileByPath(filePath);
    if (!file) {
      throw new Error(`图片未找到: ${filePath}`);
    }

    const content = await this.vault.readBinary(file);
    const sizeKB = content.byteLength / 1024;

    if (sizeKB < 100) {
      // 小图 → base64
      const base64 = arrayBufferToBase64(content);
      const ext = file.extension;
      const mime = ext === "svg" ? "image/svg+xml" : `image/${ext}`;
      return `data:${mime};base64,${base64}`;
    } else {
      // 大图 → 图床
      return this.uploadToBed(content, file.extension);
    }
  }

  private async uploadToBed(data: ArrayBuffer, ext: string): Promise<string> {
    const config = await this.loadConfig();
    switch (config.imageBed) {
      case "smms":
        return this.uploadSMMS(data, ext);
      case "aliyun-oss":
        return this.uploadAliOSS(data, ext);
      default:
        // 默认: 复制到 vault 发布目录
        const fileName = `_publish/images/${Date.now()}.${ext}`;
        await this.vault.createBinary(fileName, data);
        return fileName;
    }
  }
}
```

### 3.7 嵌入式 Webview 发布视图

微信公众号 / 头条号的发布通道由 Obsidian 进程内的 Electron `<webview>` 标签承载。

#### 3.7.1 关键特性

- 零额外依赖：直接使用 Obsidian 自带的 `<webview>` 能力
- 同进程 `executeJavaScript`：调用即可拿到返回值，便于错误诊断
- `partition="persist:..."` 持久会话：扫码登录一次长期复用
- 注入失败时用户仍可在 webview 中手动操作平台原生编辑器

#### 3.7.2 视图实现

两个视图共享相同骨架（[src/ui/WeChatBrowserView.ts](src/ui/WeChatBrowserView.ts) / [src/ui/ToutiaoBrowserView.ts](src/ui/ToutiaoBrowserView.ts)）：

```ts
// 关键 DOM
this.webview = document.createElement("webview");
this.webview.setAttribute("src", PLATFORM_HOME);
this.webview.setAttribute("partition", `persist:spider-media-${platformId}`);
this.webview.setAttribute("allowpopups", "true");

// 注入入口
async submitPayload(payload: { title: string; html: string }): Promise<void> {
  this.pending = payload;
  await this.runInject(/*navigateIfNeeded*/ true);
}

// 实际执行
private async runInject(navigateIfNeeded: boolean) {
  // 1. 等待 dom-ready
  // 2. 当前 URL 不在编辑页则导航
  // 3. webview.executeJavaScript(buildInjectionCode(title, html), true)
  // 4. 解析返回 { ok, msg } 写入状态栏 + Notice
}
```

工具栏按钮：`首页` / `新建图文`（公众号）或 `发布图文`（头条号）/ `注入正文` / `刷新` / `DevTools`。

#### 3.7.3 微信公众号注入策略

`buildInjectionCode()` 在 webview 主世界执行（同源 iframe 也可访问）：

1. **找 JsApi**：递归 `window.frames` 找到 `__MP_Editor_JSAPI__.invoke`
2. **等编辑器就绪**：轮询 `mp_editor_get_isready` 直到 `{ isReady, isNew }`
3. **写正文**：`mp_editor_set_content({ content: html })` —— 公众号官方 API
4. **写标题**：
   - 公众号没有公开的 `set_title` JsApi
   - 真实标题输入位于 `.title-editor__input .ProseMirror[contenteditable=true]`（非隐藏的 `<textarea id="title">`）
   - 20s 轮询 + `execCommand("delete")` 清空 trailingBreak + `execCommand("insertText")` 写入
5. **写作者**：从 `.weui-desktop-account__nickname` 等读账号名，写入 `#author` input；React 受控 input 用 native value setter

#### 3.7.4 头条号注入策略

1. **标题**：扫 `textarea/input[placeholder*="标题"]` + `.title-area`，`execCommand("insertText")` 走真实输入路径（兼容 Vue v-model / React onChange）
2. **正文**：找 `.ProseMirror[contenteditable='true']` → 选中并 `execCommand("delete")` 清空 → 构造 `ClipboardEvent('paste')` 携 `text/html` 派发。ProseMirror/tiptap 自带 paste handler 会按 schema 解析 HTML 并维护 doc state，比直接 `innerHTML` 稳定
3. **innerHTML 兜底**：如果 paste handler 没触发（DOM 改版），降级写 `innerHTML` + `InputEvent`

任何阶段失败都通过返回值带出 `tag/value` 诊断信息，便于贴日志定位。

#### 3.7.5 与 PlatformAdapter 的关系

`WeChatAdapter.publish()` / `ToutiaoAdapter.publish()` 在 `PlatformAdapter` 契约中只返回 `{ success: false, stage: "fallback", message: "请使用嵌入式..." }` 占位。`PlatformEditorView.publish()` 按平台 id 路由到 `openWeChatBrowser()` / `openToutiaoBrowser()`：

```ts
const platformId = adapter.meta.id;
const hasNativeTitleInput = platformId === "wechat" || platformId === "toutiao";
// 平台有独立标题输入框 → 正文不前置 H1（避免重复标题）
const md = hasNativeTitleInput ? this.currentMarkdown : this.buildMarkdownWithTitle();
const html = await adapter.format(md, template, this.plugin.settings.tweaks);

if (platformId === "wechat") {
  const view = await this.plugin.openWeChatBrowser();
  await view.submitPayload({ title: this.currentTitle, html });
  return;
}
if (platformId === "toutiao") { /* ... */ return; }
// 其他平台走 adapter.publish()（占位）
```

### 3.8 UI 层

Spider Media 注册三个 ItemView：

| 视图 | View Type 常量 | 入口 | 职责 |
| --- | --- | --- | --- |
| `PlatformEditorView` | `VIEW_TYPE_SPIDER_MEDIA` | Ribbon / 命令「打开自媒体发布编辑器」 | 选择当前笔记 → 选平台 / 模板 → 实时预览 → 触发发布 |
| `WeChatBrowserView` | `VIEW_TYPE_WECHAT_BROWSER` | 命令「打开嵌入式微信公众号浏览器」 | 嵌入 `mp.weixin.qq.com`，承载注入脚本 |
| `ToutiaoBrowserView` | `VIEW_TYPE_TOUTIAO_BROWSER` | 命令「打开嵌入式头条号浏览器」 | 嵌入 `mp.toutiao.com`，承载注入脚本 |

#### 3.8.1 PlatformEditorView 布局

```
PlatformEditorView (containerEl.children[1])
├── .spider-media-toolbar
│   ├── 文件选择 [当前活动笔记 ▼]
│   ├── 平台选择 [微信公众号 ▼ / 头条号 ▼]
│   ├── 模板选择 [<根据 platform 动态加载> ▼]
│   └── 按钮 [刷新预览] [复制 HTML] [同步到平台]
│
├── .spider-media-preview
│   └── 容器内直接 innerHTML 渲染 PostProcessor 产物（手机宽度限制 + 滚动）
│
└── .spider-media-footer
    └── 状态行（字数 / 上次发布时间 / 错误提示）
```

设计要点：
- 编辑能力依然在 Obsidian 原生编辑器中完成，本视图**只读取当前活动笔记**做发布预览，避免重复造编辑器
- 预览采用 debounce 350ms 触发 `format()`，且复用 `MarkdownParser` 缓存
- 「同步到平台」按钮按 `platformId` 路由：`wechat` → `openWeChatBrowser()`，`toutiao` → `openToutiaoBrowser()`，其它平台走 `adapter.publish()`（目前只占位）

#### 3.8.2 *BrowserView 布局

```
WeChatBrowserView / ToutiaoBrowserView
├── .spider-media-browser-toolbar
│   └── [首页] [新建图文/发布图文] [注入正文] [刷新] [DevTools]
├── <webview partition="persist:spider-media-<id>"> (flex: 1)
└── .spider-media-browser-status
    └── 实时状态文本（注入进度 / 错误 / 上次结果）
```

视图复用：每种 BrowserView 只允许同时一个 leaf；`openEmbeddedBrowser()` 优先复用现有 leaf，否则在 rootSplit（主编辑区）新建 tab。

### 3.9 设置与持久化

设置形态详见 [src/settings/types.ts](src/settings/types.ts) 和 [src/settings/SettingsTab.ts](src/settings/SettingsTab.ts)。

```typescript
export interface SpiderMediaSettings {
  defaultPlatform: string;            // 默认 wechat
  tweaks: FormatTweaks;               // 全局排版微调（字号 / 行高 / 段距 / 主题色 ...）
  wechat:  { defaultTemplateId: string };
  toutiao: { defaultTemplateId: string };
}

export const DEFAULT_SETTINGS: SpiderMediaSettings = {
  defaultPlatform: "wechat",
  tweaks: { fontSize: 16, lineHeight: 1.75, themeColor: "#07C160", /* ... */ },
  wechat:  { defaultTemplateId: "wechat-default"  },
  toutiao: { defaultTemplateId: "toutiao-default" },
};
```

要点：
- 不存储 Cookie / Token：登录态全部由 `<webview partition="persist:spider-media-<id>">` 持久化，不进 plugin data
- `loadSettings()` 用浅合并（`{ ...DEFAULT_SETTINGS, ...data, tweaks: { ...DEFAULT_SETTINGS.tweaks, ...data.tweaks } }`）保证缺失字段使用默认值
- `SettingsTab` 提供：默认平台 / 平台默认模板（公众号 / 头条号各一项 dropdown）/ FormatTweaks 微调控件 / 引导文案（提示用户在嵌入浏览器中扫码登录）
- 每次 `onChange` → `await this.plugin.saveSettings()`，下次插件加载即生效

---

## 4. 扩展新平台

> 详细脚手架步骤见 [.github/skills/add-platform/SKILL.md](.github/skills/add-platform/SKILL.md)。这里只给出概要。

### 4.1 目录结构

```
src/platforms/<platform-id>/
├── index.ts            // 导出 adapter
├── adapter.ts          // 实现 PlatformAdapter（meta + format + publish 占位 + getTemplates）
├── formatter.ts        // marked 扩展（renderer 覆盖）
└── templates/
    ├── _base.ts        // 共享结构性 CSS + wrapTemplate 工厂
    ├── default.ts      // 至少一套主题
    └── index.ts        // 聚合导出 TEMPLATES 数组

src/ui/<PlatformId>BrowserView.ts   // 嵌入 webview 视图（参考 WeChatBrowserView / ToutiaoBrowserView）
```

### 4.2 必做改动清单

1. **adapter.ts** 实现 `PlatformAdapter`：
   - `meta`: `{ id, name, icon, color, isDesktopOnly: true }`
   - `format(md, template, tweaks)` 走 MarkdownParser → MermaidConverter → ImageManager → PostProcessor
   - `publish(...)` 仅返回 `"请使用嵌入式<平台>浏览器发布"` 占位（真实注入在 *BrowserView 里）
   - `setNoteDir(dir)` 重建 ImageManager
2. **formatter.ts** 给出该平台 marked 扩展（参考公众号 / 头条号实现，需要平台特定的 `<li>`/`<pre>` 处理逻辑）
3. **templates/** 至少一套默认模板，使用 `wrapTemplate(extraCss)` 工厂保证 `{{CONTENT}}` / `{{TWEAK_STYLES}}` 占位符
4. **<PlatformId>BrowserView.ts** 复制现有 BrowserView 改写：`PARTITION` / 首页 URL / 发布页 URL / `buildInjectionCode()` 内的标题/正文 selector
5. **main.ts**：
   - 注册视图 `registerView(VIEW_TYPE_<PLATFORM>_BROWSER, ...)`
   - 实例化 adapter 加入 `this.platforms`
   - 添加命令 `open-<platform-id>-embedded-browser` 和 `open<PlatformId>Browser()` 公共方法
6. **PlatformEditorView.publish()**：增加 `if (platformId === '<id>')` 分支调用对应 BrowserView
7. **settings/types.ts**：新增 `<platform>` 设置段，更新 `loadSettings` 浅合并
8. **README.md**：更新支持平台表

### 4.3 工作量参考

| 组件 | 行数 |
| --- | --- |
| `formatter.ts` + `templates/` | ~120 行 |
| `adapter.ts` | ~80 行 |
| `<PlatformId>BrowserView.ts` | ~250 行（含注入脚本） |
| `main.ts` / `PlatformEditorView.ts` 改动 | ~30 行 |
| **合计** | **~480 行** |

---

## 5. 技术决策

| 决策点 | 方案 | 理由 |
|-------|------|------|
| **MD 解析引擎** | `marked` 17.x | 最成熟的 MD 解析库，自定义扩展 API 完善 |
| **样式内联** | `juice` | 专门处理 CSS→内联，公众号编辑器强依赖 |
| **Mermaid 渲染** | Obsidian 内置 mermaid + Canvas API（SVG → PNG 栅格化） | 零外部依赖；公众号 / 头条号都不允许直插 SVG |
| **发布通道** | Electron `<webview>` 嵌入 Obsidian + `executeJavaScript` 注入 | 零额外依赖，partition 持久会话，DevTools 直接调试 |
| **代码高亮** | `marked-highlight`（CSS 内联） | 轻量，不依赖 Prism 运行时 |
| **插件 UI** | Obsidian ItemView + 原生 DOM API | 标准 Obsidian 模式，不引入 React/Vue |
| **设置持久化** | `loadData()` / `saveData()` | Obsidian 内置 API，启动时与 DEFAULT_SETTINGS 浅合并 |
| **图片处理** | 小图 base64（默认 < 100KB） / 大图保留 vault 路径 | 平衡体积与兼容性，未来再接图床 |
| **模板引擎** | TypeScript 函数 + 字符串模板 + `{{CONTENT}}/{{TWEAK_STYLES}}` 占位符 | 类型安全，无 DSL |
| **构建工具** | esbuild（manifest.json / styles.css 通过 copy loader 一并产到 `dist/`） | Obsidian 社区标准 |
| **移动端支持** | `isDesktopOnly: true` | Electron `<webview>` 只在桌面端可用 |

---

## 6. 依赖清单

### 生产依赖

| 包 | 版本 | 用途 |
|---|-------|------|
| `marked` | ^17.0.0 | Markdown → HTML 解析 |
| `marked-highlight` | ^2.0.0 | marked 代码高亮扩展 |
| `juice` | ^11.0.0 | CSS → 内联样式 |

### 开发依赖

| 包 | 用途 |
|---|------|
| `obsidian` | Obsidian API 类型定义 |
| `typescript` | ^5.7 |
| `esbuild` | 构建打包（产物到 `dist/`） |
| `@types/node` | Node.js 类型 |
| `builtin-modules` | esbuild external 列表 |
| `@typescript-eslint/*` + `eslint` | Lint |

### 非依赖（利用 Obsidian / Electron 自带）

| 能力 | 来源 |
|------|------|
| Mermaid 渲染 | Obsidian 全局 `window.mermaid`（再 Canvas 栅格化为 PNG） |
| 嵌入浏览器 | Electron `<webview>` 标签（Obsidian 默认开启 `webviewTag`） |
| 持久会话 | `<webview partition="persist:...">`（电场分区，Cookie / localStorage 全持久） |
| 文件系统 | `app.vault` API |
| DOM 操作 | Obsidian 内置 `createEl`/`createDiv` |
| 设置持久化 | `loadData()` / `saveData()` |

---

## 7. 发布流程全景

```
┌─── OBSIDIAN 内部 ──────────────────────────────────────────────────┐
│                                                                     │
│  1.  用户在笔记中编辑 MD（含 Mermaid 图、本地图片、代码块）         │
│                                                                     │
│  2.  命令面板 / Ribbon → 「打开自媒体发布编辑器」                    │
│      → PlatformEditorView 加载当前活动笔记                          │
│                                                                     │
│  3.  选择平台 [微信公众号 ▼ / 头条号 ▼] + 模板                      │
│      → 预览实时刷新（debounce 350ms）                                │
│                                                                     │
│  4.  在「设置 → Spider Media」调整字号 / 行高 / 主题色等             │
│                                                                     │
│  5.  （首次）执行命令「打开嵌入式<平台>浏览器」→ 在 webview 扫码登录 │
│       → partition 持久化，后续无需重新登录                            │
│                                                                     │
│  6.  点击「同步到平台」                                              │
│      → MarkdownParser 解析 MD                                        │
│      → MermaidConverter 将 mermaid 块转为 PNG（base64）              │
│      → ImageManager 处理所有图片                                     │
│      → PostProcessor 模板包装 + juice 内联样式 + 后处理修复          │
│      → 平台适配器返回 (title, html)                                  │
│      → 路由到对应 *BrowserView                                       │
│      → webview 自动跳到发布页（公众号「新建图文」/ 头条号 graphic/publish）│
│      → 等编辑器就绪 → 注入正文 / 标题 / 作者                         │
│      → Notice 提示注入成功                                           │
│                                                                     │
│  7.  用户在嵌入 webview 中：                                         │
│      → 审查内容、调整封面 / 摘要 / 标签                              │
│      → 点击平台原生「发布」按钮                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. 参考项目

| 项目 | 借鉴点 |
|------|--------|
| [mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter) | marked 定制 renderer 方案、72 套模板设计思路、CSS 内联策略 |
| [LinusLing/WeChatMediaPlatformAutomation](https://github.com/LinusLing/WeChatMediaPlatformAutomation) | 公众号后台登录流程、iframe 结构、编辑器 DOM 探查经验 |
| [obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) | Obsidian 插件标准项目结构、manifest.json、构建配置 |
| [weppos/obsidian-mermaid-view](https://github.com/weppos/obsidian-mermaid-view) | Obsidian 中 Mermaid 渲染与导出的实现参考 |
| [wis-graph/obsidian-modern-mermaid](https://github.com/wis-graph/obsidian-modern-mermaid) | Mermaid 在 Obsidian 中的代码块处理器注册 |
| [TheTrustedAdvisor/mermaid-maestro](https://github.com/thetrustedadvisor/mermaid-maestro) | Mermaid → PNG/SVG 导出的 API 使用方式 |
| [vigorX777/wechat-article-formatter](https://github.com/vigorX777/wechat-article-formatter) | Chrome DevTools Protocol 发布流程、模板分离设计 |
| [mermaid.ink](https://github.com/jihchi/mermaid.ink) | Mermaid → 图片的服务端渲染参考 |
