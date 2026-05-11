---
description: "Use when editing or creating files under src/automator/** or src/platforms/**/automator.ts. Covers puppeteer-core sandbox limits in Obsidian, lazy dynamic import, clipboard fallback, timeout/retry, and credential handling for the BrowserAutomator layer."
applyTo: ["src/automator/**", "src/platforms/**/automator.ts"]
---

# Automator (puppeteer-core) Rules

`puppeteer-core` is declared as an esbuild external in [esbuild.config.mjs](../../esbuild.config.mjs#L31) because it cannot run inside the Obsidian Electron sandbox without an external Chromium. Treat every automator file as untrusted-runtime code.

## Hard Rules

- **No top-level import.** Never write `import puppeteer from "puppeteer-core"` at module scope. Use a lazy dynamic import inside the function that needs it:
  ```ts
  const { default: puppeteer } = await import("puppeteer-core");
  ```
  This keeps `main.js` loadable even when puppeteer is unusable.

- **Always provide a clipboard fallback.** Wrap the entire browser flow in `try/catch`. On any failure (launch error, navigation timeout, selector not found, login expired) fall back to copying the rendered HTML/title to the system clipboard via the Obsidian-safe path and surface a `Notice` telling the user "已复制到剪贴板，请手动粘贴". Never swallow the error silently.

- **Bounded timeouts.** Every `page.goto`, `page.waitForSelector`, and `page.evaluate` MUST pass an explicit `timeout` (default 30_000 ms). Never rely on puppeteer defaults.

- **Single retry, then fall back.** At most one retry for transient launch / navigation failures. Do not build retry loops — fall back to clipboard instead.

- **Always close resources.** Use `try { ... } finally { await browser?.close(); }`. Do not leak browser processes across publishes.

## Credentials

- Receive credentials as a typed `PublishCredentials` argument; never read settings directly from disk in the automator.
- Do not log cookie / token values. Logging must redact: `console.debug("cookie len=", cookie.length)`.
- Do not persist credentials inside the automator module — persistence is the SettingsTab's responsibility (`loadData()` / `saveData()`).

## Selectors & Platform DOM

- Keep CSS / XPath selectors as `const` exported from a single `selectors.ts` per platform so they can be updated without touching flow logic.
- Add a one-line comment above each selector noting the date last verified, e.g. `// verified 2026-05-11 mp.weixin.qq.com`.

## Type Discipline

- Per [AGENTS.md](../../AGENTS.md): no `as any`, no `@ts-ignore`. The dynamic import returns `unknown`-shaped types — narrow with the `import("puppeteer-core")` type-only import:
  ```ts
  import type { Browser, Page } from "puppeteer-core";
  ```
  Type-only imports are erased at build time and do NOT bundle the runtime.

## Anti-patterns

- ❌ `import puppeteer from "puppeteer-core"` at top of file
- ❌ Catching the error and re-throwing without clipboard fallback
- ❌ `page.waitForSelector(sel)` without timeout
- ❌ Hard-coding cookies or browser executable paths (must come from settings)
- ❌ Calling automator code from `onload()` — only invoke from a user-triggered command
