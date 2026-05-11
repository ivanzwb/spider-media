# Obsidian Media Publisher — 架构设计文档

> 版本: v0.1.0 (草案)
> 目标: Obsidian 插件，将 Markdown 文章一键发布到微信公众号、头条号等自媒体平台

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
   - 3.7 [浏览器自动化引擎](#37-浏览器自动化引擎)
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
- 不实现移动端支持 (`isDesktopOnly: true`)

---

## 2. 总体架构

### 2.1 四层架构

```
┌──────────────────────────────────────────────────────────────────┐
│                         OBSIDIAN PLUGIN LAYER                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────────┐  │
│  │ Ribbon   │  │  Commands    │  │  SettingsTab              │  │
│  │ Icon     │  │  (侧边栏/发布) │  │  (平台配置/Cookie/模板)   │  │
│  └────┬─────┘  └──────┬───────┘  └───────────┬───────────────┘  │
│       │               │                      │                  │
│  ┌────▼───────────────▼──────────────────────▼────────────────┐  │
│  │              PlatformEditorView (ItemView)                  │  │
│  │  ┌────────────────┐ ┌──────────────┐ ┌──────────────────┐  │  │
│  │  │ EditorPane     │ │ PreviewPane  │ │ SettingsPane     │  │  │
│  │  │ (MD source)    │ │ (HTML预览)   │ │ (模板/字号/颜色)  │  │  │
│  │  └────────────────┘ └──────────────┘ └──────────────────┘  │  │
│  └──────────────────────────┬───────────────────────────────────┘  │
└─────────────────────────────┼─────────────────────────────────────┘
                              │
┌─────────────────────────────▼─────────────────────────────────────┐
│                        CORE PIPELINE                               │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────────┐  │
│  │ Markdown     │   │  Mermaid         │   │  Image            │  │
│  │ Parser       │──►│  Converter       │──►│  Manager          │  │
│  │ (marked)     │   │  (→PNG/SVG)      │   │  (base64/upload)  │  │
│  └──────┬───────┘   └──────────────────┘   └───────────────────┘  │
│         │                                                          │
│         ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │              PLATFORM FORMATTER                                │  │
│  │  ┌──────────────────┐ ┌──────────────────┐                   │  │
│  │  │ WeChatFormatter  │ │ TouTiaoFormatter │  ...               │  │
│  │  │ (marked ext.)    │ │ (marked ext.)    │                   │  │
│  │  └────────┬─────────┘ └────────┬─────────┘                   │  │
│  │           │                    │                              │  │
│  │  ┌────────▼────────────────────▼──────────────────────────┐  │  │
│  │  │          TemplateEngine + InlineCSS (juice)             │  │  │
│  │  └─────────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                              │                                      │
│  ┌───────────────────────────▼──────────────────────────────────┐  │
│  │              PUBLISHER (AUTOMATOR)                            │  │
│  │  ┌──────────────────┐ ┌──────────────────┐                  │  │
│  │  │ WeChatAutomator  │ │ TouTiaoAutomator │  ...              │  │
│  │  │ (Puppeteer)      │ │ (Puppeteer)      │                  │  │
│  │  └──────────────────┘ └──────────────────┘                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流

```
MD Source
   │
   ▼
MarkdownParser.parse(input)
   │
   ├── Mermaid 检测 → MermaidConverter → <img src="diagram-xxx.png">
   ├── 图片引用   → ImageManager      → <img src="base64" | 图床URL>
   ├── 代码块     → 保留格式 + 高亮样式
   ├── 标准 MD    → marked 默认 renderer
   └── 平台特定   → PlatformFormatter 定制 renderer
   │
   ▼
(中间 HTML)
   │
   ▼
TemplateEngine.apply(html, template)
   │
   ▼
juice(html, css)  →  CSS 全部内联化
   │
   ▼
(平台就绪 HTML)
   │
   ▼
Publisher.publish(html, platform, credentials)
   ├── BrowserAutomator.launch()
   ├── 打开平台后台页面
   ├── 填充内容到编辑器
   └── 等待用户操作
```

---

## 3. 模块详解

### 3.1 插件入口 (main.ts)

**职责**: 管理插件生命周期，注册所有组件

```typescript
// src/main.ts  — 伪代码结构

export default class MediaPublisherPlugin extends Plugin {
  private platforms: Map<string, PlatformAdapter> = new Map();

  async onload() {
    // 1. 注册平台适配器
    this.registerPlatform(new WeChatAdapter());
    this.registerPlatform(new TouTiaoAdapter());

    // 2. 注册自定义视图 (右侧滑出编辑器)
    this.registerView(
      VIEW_TYPE_MEDIA_PUBLISHER,
      (leaf) => new PlatformEditorView(leaf, this.platforms)
    );

    // 3. Ribbon 图标
    this.addRibbonIcon("message-square", "自媒体发布", () => {
      this.activateEditorView();
    });

    // 4. 命令
    this.addCommand({
      id: "open-media-publisher",
      name: "打开自媒体发布编辑器",
      callback: () => this.activateEditorView(),
    });

    this.addCommand({
      id: "publish-to-wechat",
      name: "同步到公众号",
      checkCallback: (checking) => {
        if (checking) return this.isCurrentFileValid();
        this.publishTo("wechat");
      },
    });

    // 5. 设置页
    this.addSettingTab(new SettingsTab(this.app, this));
  }

  async onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_MEDIA_PUBLISHER);
  }

  registerPlatform(adapter: PlatformAdapter) {
    this.platforms.set(adapter.config.id, adapter);
  }
}
```

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
  isDesktopOnly: boolean;   // 是否需要 Puppeteer
}

/** 平台凭据 */
export interface Credentials {
  type: "cookie" | "token" | "password";
  data: Record<string, string>;
}

/** 发布结果 */
export interface PublishResult {
  success: boolean;
  stage: "login" | "fill" | "preview" | "done";
  message: string;
  url?: string;
  browserPid?: number;      // 浏览器进程 ID (保持打开供用户操作)
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

  /** 发布: 打开后台编辑器并填充内容 */
  abstract publish(
    html: string,
    title: string,
    credentials: Credentials,
  ): Promise<PublishResult>;

  /** 验证凭据是否有效 */
  abstract validateCredentials(credentials: Credentials): Promise<boolean>;
}
```

#### 3.3.2 WeChatAdapter 实现

```typescript
// src/platforms/wechat/WeChatAdapter.ts

export class WeChatAdapter extends PlatformAdapter {
  meta: PlatformMeta = {
    id: "wechat",
    name: "微信公众号",
    icon: "message-square",
    color: "#07C160",
    isDesktopOnly: true,
  };

  private formatter = new WeChatFormatter();
  private automator = new WeChatAutomator();
  private templateEngine = new TemplateEngine();
  private postProcessor = new PostProcessor();

  async getTemplates(): Promise<Template[]> {
    return [
      { id: "wechat-default", name: "默认精简", category: "general", styles: defaultWeChatCSS },
      { id: "wechat-clean", name: "清新极简", category: "clean", styles: cleanWeChatCSS },
      { id: "wechat-business", name: "沉稳商务", category: "business", styles: businessWeChatCSS },
      // ... 可以基于 mspringjade/wechat-formatter 的 72 套模板适配
    ];
  }

  async format(markdown: string, template: Template, tweaks: FormatTweaks): Promise<string> {
    // 1. 解析 MD → HTML (使用 WeChat 特定 marked 扩展)
    const parser = new MarkdownParser(this.formatter.getExtensions());
    let html = await parser.parse(markdown, {
      platformId: "wechat",
      mermaidConverter: (code) => this.convertMermaid(code),
      imageResolver: (src) => this.resolveImage(src),
    });

    // 2. 模板包装 + 样式内联
    html = this.postProcessor.process(html, {
      template: template.html,
      templateStyles: template.styles,
      formatTweaks: tweaks,
    });

    return html;
  }

  async publish(html: string, title: string, credentials: Credentials): Promise<PublishResult> {
    return this.automator.publish(html, title, credentials);
  }

  async validateCredentials(credentials: Credentials): Promise<boolean> {
    return this.automator.validateSession(credentials);
  }

  private async convertMermaid(code: string): Promise<string> {
    return MermaidConverter.render(code, { format: "png", width: 600 });
  }

  private async resolveImage(src: string): Promise<string> {
    return ImageManager.resolve(src, { platform: "wechat" });
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
| Puppeteer 渲染 | puppeteer-core | 最高 | 慢 | ⭐⭐⭐⭐ (备选) |
| mermaid-cli | puppeteer | 最高 | 慢 | ⭐⭐ (太重) |

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

### 3.7 浏览器自动化引擎

#### 3.7.1 BrowserAutomator

```typescript
// src/automator/BrowserAutomator.ts

import * as puppeteer from "puppeteer-core";

export class BrowserAutomator {
  private browser: puppeteer.Browser | null = null;
  private page: puppeteer.Page | null = null;

  /**
   * 启动/复用浏览器
   *
   * 策略:
   * 1. 优先连接用户已打开的 Chrome (通过 CDP)
   *    → 用户可见、可调试、Cookie 共享
   * 2. 回退: 启动内置 Chromium (puppeteer-core)
   */
  async launch(options?: { headless?: boolean }): Promise<puppeteer.Page> {
    // 尝试连接已有 Chrome 实例
    try {
      this.browser = await puppeteer.connect({
        browserURL: "http://127.0.0.1:9222",
        defaultViewport: { width: 1280, height: 800 },
      });
    } catch {
      // 启动新的 Chromium
      this.browser = await puppeteer.launch({
        headless: options?.headless ?? false,
        executablePath: this.findChrome(),
        args: ["--no-sandbox", "--disable-gpu"],
      });
    }

    this.page = await this.browser.newPage();
    return this.page;
  }

  async close() {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
  }

  private findChrome(): string {
    // 跨平台查找 Chrome 路径
    const paths = {
      win32: [
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
        process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
      ],
      darwin: [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      ],
      linux: [
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
      ],
    };
    const os = process.platform as keyof typeof paths;
    for (const p of paths[os] || []) {
      if (require("fs").existsSync(p)) return p;
    }
    throw new Error("未找到 Chrome 浏览器，请先安装 Google Chrome");
  }

  /**
   * 恢复 Cookie 会话
   */
  async restoreCookies(domain: string, cookies: any[]): Promise<void> {
    if (!this.page) throw new Error("浏览器未启动");
    await this.page.setCookie(...cookies);
  }

  /**
   * 获取当前 Cookie (用于持久化)
   */
  async getCookies(): Promise<any[]> {
    if (!this.page) throw new Error("浏览器未启动");
    return this.page.cookies();
  }
}
```

#### 3.7.2 WeChatAutomator

```typescript
// src/platforms/wechat/WeChatAutomator.ts

export class WeChatAutomator {
  private browser = new BrowserAutomator();

  async publish(
    html: string,
    title: string,
    credentials: Credentials,
  ): Promise<PublishResult> {
    const page = await this.browser.launch({ headless: false });

    try {
      // 1. 登录
      await page.goto("https://mp.weixin.qq.com/", {
        waitUntil: "networkidle2",
      });

      if (credentials.type === "cookie") {
        await this.browser.restoreCookies(".weixin.qq.com", credentials.data as any);
        await page.reload();
      } else {
        // 等待用户扫码
        await page.waitForSelector(".weui-desktop-account__info", {
          timeout: 120000,
        });
      }

      // 2. 导航到新建图文
      await page.goto(
        "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1",
        { waitUntil: "networkidle2" },
      );

      // 3. 填写标题
      await page.waitForSelector("#title", { timeout: 10000 });
      await page.type("#title", title);

      // 4. 填写内容 (通过剪贴板粘贴)
      // 微信公众号编辑器使用 UEditor, 内容在 iframe 中
      const editorFrame = page.frameLocator("#ueditor_0");
      const editorBody = editorFrame.locator("body");

      // 写入 HTML (逐行设置 innerHTML)
      await editorBody.evaluate((el, content) => {
        el.innerHTML = content;
      }, html);

      // 5. 等待用户审查并手动发布
      // 浏览器保持打开，用户可以看到完整操作界面

      return {
        success: true,
        stage: "fill",
        message: "内容已填充到公众号编辑器，请审查后手动发布",
      };
    } catch (error: any) {
      return {
        success: false,
        stage: "login",
        message: `自动化失败: ${error.message}`,
      };
    }
  }
}
```

### 3.8 UI 层 (PlatformEditorView)

#### 3.8.1 视图注册与激活

```typescript
// src/views/PlatformEditorView.ts

export const VIEW_TYPE_MEDIA_PUBLISHER = "media-publisher-view";

export class PlatformEditorView extends ItemView {
  private platforms: Map<string, PlatformAdapter>;
  private activePlatform: PlatformAdapter;
  private currentFile: TFile | null;

  constructor(leaf: WorkspaceLeaf, platforms: Map<string, PlatformAdapter>) {
    super(leaf);
    this.platforms = platforms;
    this.activePlatform = platforms.get("wechat")!;
  }

  getViewType(): string {
    return VIEW_TYPE_MEDIA_PUBLISHER;
  }

  getDisplayText(): string {
    return "自媒体发布";
  }

  getIcon(): string {
    return "message-square";
  }

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("media-publisher-view");

    // 使用 Obsidian 内置的 DOM API 构建 UI
    this.buildUI(container);
  }

  private buildUI(container: HTMLElement) {
    // 三栏布局: 编辑器 | 预览 | 设置
    // Obsidian 环境下不使用 React/JSX
    // 而是使用 Obsidian 的 DOM 辅助方法
    container.createDiv({ cls: "mp-layout" }, (layout) => {
      // 顶部工具栏
      layout.createDiv({ cls: "mp-toolbar" }, (toolbar) => {
        this.buildToolbar(toolbar);
      });

      // 主体三栏
      layout.createDiv({ cls: "mp-main" }, (main) => {
        main.createDiv({ cls: "mp-editor-pane" }, (pane) => {
          this.buildEditorPane(pane);
        });
        main.createDiv({ cls: "mp-preview-pane" }, (pane) => {
          this.buildPreviewPane(pane);
        });
        main.createDiv({ cls: "mp-settings-pane" }, (pane) => {
          this.buildSettingsPane(pane);
        });
      });

      // 底部操作栏
      layout.createDiv({ cls: "mp-footer" }, (footer) => {
        this.buildFooter(footer);
      });
    });
  }
}
```

#### 3.8.2 UI 组件树

```
PlatformEditorView
├── .mp-toolbar
│   ├── 平台选择器 (<select> 公众号/头条号)
│   ├── 模板选择器 (<select>)
│   └── 操作按钮 [刷新预览]
│
├── .mp-main
│   ├── .mp-editor-pane (左侧)
│   │   └── <textarea> 当前笔记的 MD 内容 (可编辑)
│   │
│   ├── .mp-preview-pane (中间)
│   │   └── <iframe> 实时 HTML 预览 (手机框)
│   │
│   └── .mp-settings-pane (右侧)
│       ├── 字号滑块
│       ├── 行高滑块
│       ├── 段落间距
│       ├── 首行缩进 toggle
│       ├── 页面留白
│       ├── 字间距
│       ├── 图片圆角
│       └── 主题色选择器
│
└── .mp-footer
    ├── 字数统计
    ├── [同步到公众号] 按钮 (主操作)
    ├── [复制 HTML] 按钮
    └── [重置] 按钮
```

### 3.9 设置与持久化

```typescript
// src/settings/SettingsTab.ts

interface PluginSettings {
  // 平台配置
  platforms: {
    wechat: {
      cookieStore: any[];           // 持久化 Cookie
      autoLogin: boolean;
      defaultTemplate: string;
    };
    toutiao: {
      token: string;
      defaultTemplate: string;
    };
  };

  // 全局
  defaultPlatform: string;
  imageBed: "none" | "smms" | "aliyun-oss" | "qiniu";
  imageBedConfig: Record<string, string>;

  // 图床配置 (加密存储)
  secrets: Record<string, string>;
}

const DEFAULT_SETTINGS: PluginSettings = {
  platforms: {
    wechat: {
      cookieStore: [],
      autoLogin: true,
      defaultTemplate: "wechat-default",
    },
    toutiao: {
      token: "",
      defaultTemplate: "toutiao-default",
    },
  },
  defaultPlatform: "wechat",
  imageBed: "none",
  imageBedConfig: {},
  secrets: {},
};

export class SettingsTab extends PluginSettingTab {
  async display(): Promise<void> {
    const { containerEl } = this;
    containerEl.empty();

    // 通用设置
    new Setting(containerEl)
      .setName("默认发布平台")
      .setDesc("打开编辑器时默认选中的平台")
      .addDropdown((dd) => {
        dd.addOption("wechat", "微信公众号");
        dd.addOption("toutiao", "头条号");
        dd.setValue(this.plugin.settings.defaultPlatform);
        dd.onChange(async (v) => {
          this.plugin.settings.defaultPlatform = v;
          await this.plugin.saveData(this.plugin.settings);
        });
      });

    // 图床设置
    new Setting(containerEl)
      .setName("图片存储")
      .setDesc("选择大图上传方式")
      .addDropdown((dd) => {
        dd.addOption("none", "本地存储 (Vault)");
        dd.addOption("smms", "SM.MS 图床");
        dd.addOption("aliyun-oss", "阿里云 OSS");
        dd.setValue(this.plugin.settings.imageBed);
        // ...
      });

    // 每平台独立配置区域
    containerEl.createEl("h3", { text: "公众号配置" });
    // Cookie 管理 / 模板选择 / 等
  }
}
```

---

## 4. 扩展新平台

添加一个新平台的完整步骤:

### 步骤 1: 创建平台目录

```
src/platforms/zhihu/
├── ZhiHuAdapter.ts        # 主适配器
├── ZhiHuFormatter.ts      # marked renderer 定制
├── ZhiHuAutomator.ts      # 浏览器自动化
├── zhihu-templates/       # 模板
│   ├── default.ts
│   └── styles.ts
└── zhihu-config.ts        # 常量
```

### 步骤 2: 实现 PlatformAdapter

```typescript
export class ZhiHuAdapter extends PlatformAdapter {
  meta = {
    id: "zhihu",
    name: "知乎",
    icon: "globe",
    color: "#0084FF",
    isDesktopOnly: true,
  };

  getTemplates() { /* ... */ }
  async format(md, template, tweaks) { /* ... */ }
  async publish(html, title, credentials) { /* 知乎特定自动化 */ }
  async validateCredentials(credentials) { /* ... */ }
}
```

### 步骤 3: 在 main.ts 注册

```typescript
// main.ts
this.registerPlatform(new WeChatAdapter());
this.registerPlatform(new TouTiaoAdapter());
this.registerPlatform(new ZhiHuAdapter());  // 新平台
```

### 需要定制的部分

| 组件 | 说明 | 工作量 |
|------|------|--------|
| PlatformFormatter | marked renderer 覆盖 (标题/代码/引用样式) | ~50 行 |
| PlatformAutomator | Puppeteer 脚本 (打开页面、登录、填充内容) | ~150 行 |
| Templates | 2-3 个样式模板 | ~100 行 CSS |
| PlatformAdapter | 整合以上组件 | ~30 行 |

**总计**: 添加一个新平台约 **300-400 行代码**。

---

## 5. 技术决策

| 决策点 | 方案 | 理由 |
|-------|------|------|
| **MD 解析引擎** | `marked` 17.x | 最成熟的 MD 解析库，自定义扩展 API 完善 |
| **样式内联** | `juice` | 专门处理 CSS→内联，WeChat 强依赖 |
| **Mermaid 渲染** | Obsidian 内置 mermaid + Canvas API | 零外部依赖，obsidian 已加载 mermaid |
| **Mermaid 备选** | mermaid.ink HTTP API | 无需 Puppeteer，适合轻量使用 |
| **浏览器自动化** | `puppeteer-core` | 连接已有 Chrome，用户可见过程 |
| **代码高亮** | `marked-highlight` + Prism 主题 CSS | 轻量，不需要完整 Prism JS |
| **插件 UI** | Obsidian ItemView + 原生 DOM API | 标准 Obsidian 模式，兼容性最好 |
| **UI 构建** | Obsidian 原生 `createDiv`/`createEl` | 避免引入 React/Vue 等重型框架 |
| **设置持久化** | `loadData()` / `saveData()` | Obsidian 内置 API |
| **Cookie 存储** | `saveData()` (加密) | 安全存储在 Obsidian 配置目录 |
| **图片处理** | 小图 base64 / 大图上图床 | 平衡体积与兼容性 |
| **模板引擎** | TypeScript 函数 + 字符串模板 | 类型安全，无需 DSL |
| **构建工具** | esbuild (Obsidian 社区标准) | 官方推荐，Rollup 备选 |
| **移动端支持** | `isDesktopOnly: true` | Puppeteer 依赖 Chromium |

---

## 6. 依赖清单

### 生产依赖

| 包 | 版本 | 用途 |
|---|-------|------|
| `marked` | ^17.0.0 | Markdown → HTML 解析 |
| `marked-highlight` | ^2.0.0 | marked 代码高亮扩展 |
| `juice` | ^11.0.0 | CSS → 内联样式 |
| `puppeteer-core` | ^24.0.0 | 浏览器自动化 (连接已有 Chrome) |

可选依赖 (根据图床配置):

| 包 | 用途 |
|---|------|
| `ali-oss` | 阿里云 OSS 上传 |
| `qiniu` | 七牛云上传 |
| `cos-nodejs-sdk-v5` | 腾讯云 COS 上传 |

### 开发依赖

| 包 | 用途 |
|---|------|
| `obsidian` | Obsidian API 类型定义 |
| `typescript` | ^5.7 |
| `esbuild` | 构建打包 |
| `@types/node` | Node.js 类型 |

### 非依赖 (利用 Obsidian 已提供)

| 能力 | 来源 |
|------|------|
| Mermaid 渲染 | Obsidian 内置 `window.mermaid` |
| 文件系统 | `app.vault` API |
| DOM 操作 | Obsidian 内置 `createEl`/`createDiv` |
| 设置持久化 | `loadData()`/`saveData()` |

---

## 7. 发布流程全景

```
┌─── OBSIDIAN 内部 ──────────────────────────────────────────────────┐
│                                                                     │
│  1.  用户在笔记中编辑 MD (含 Mermaid 图、本地图片、代码块)          │
│                                                                     │
│  2.  点击 Ribbon "自媒体发布"                                        │
│      → PlatformEditorView 从右侧滑出                                │
│      → 自动加载当前活动笔记的 MD 内容                                │
│                                                                     │
│  3.  选择平台: [公众号 ▼]                                            │
│      → 加载对应平台的模板列表                                        │
│                                                                     │
│  4.  选择模板: [默认精简 ▼]                                          │
│      → 预览区域实时更新格式化后的手机预览                            │
│                                                                     │
│  5.  调整格式参数 (可选):                                            │
│      [字号: 16] [行高: 1.8] [缩进: ON] [主题色: #07C160]            │
│      → 预览实时响应                                                  │
│                                                                     │
│  6.  点击 [同步到公众号]                                              │
│      → MarkdownParser 解析 MD                                       │
│      → MermaidConverter 将 mermaid 块转为 PNG 并保存                │
│      → ImageManager 处理所有图片 (base64/图床)                      │
│      → PostProcessor 模板包装 + juice 内联样式                      │
│      → BrowserAutomator 启动 Chrome (或连接已有)                    │
│      → 打开 mp.weixin.qq.com                                          │
│      → 恢复 Cookie / 弹出二维码登录                                  │
│      → 导航到新建图文页面                                             │
│      → 填充标题 + HTML 内容                                          │
│      → 浏览器保持打开，等待用户操作                                   │
│                                                                     │
│  7.  用户在打开的浏览器中:                                            │
│      → 审查内容、调整封面/摘要/标签                                   │
│      → 点击 [保存并群发] / [预览]                                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 8. 参考项目

| 项目 | 借鉴点 |
|------|--------|
| [mspringjade/wechat-formatter](https://github.com/mspringjade/wechat-formatter) | marked 定制 renderer 方案、72 套模板设计思路、CSS 内联策略 |
| [LinusLing/WeChatMediaPlatformAutomation](https://github.com/LinusLing/WeChatMediaPlatformAutomation) | Puppeteer 控制公众号后台的实操经验、登录流程、iframe 处理 |
| [obsidianmd/obsidian-sample-plugin](https://github.com/obsidianmd/obsidian-sample-plugin) | Obsidian 插件标准项目结构、manifest.json、构建配置 |
| [weppos/obsidian-mermaid-view](https://github.com/weppos/obsidian-mermaid-view) | Obsidian 中 Mermaid 渲染与导出的实现参考 |
| [wis-graph/obsidian-modern-mermaid](https://github.com/wis-graph/obsidian-modern-mermaid) | Mermaid 在 Obsidian 中的代码块处理器注册 |
| [TheTrustedAdvisor/mermaid-maestro](https://github.com/thetrustedadvisor/mermaid-maestro) | Mermaid → PNG/SVG 导出的 API 使用方式 |
| [vigorX777/wechat-article-formatter](https://github.com/vigorX777/wechat-article-formatter) | Chrome DevTools Protocol 发布流程、模板分离设计 |
| [mermaid.ink](https://github.com/jihchi/mermaid.ink) | Mermaid → 图片的服务端渲染参考 (Puppeteer) |
