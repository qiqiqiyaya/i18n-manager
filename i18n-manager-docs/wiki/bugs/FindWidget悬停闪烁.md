---
title: Find Widget 悬停闪烁
category: bug
tags:
  - i18n-manager
  - Monaco
  - bug
  - Find Widget
source:
  - "[[raw/bug/find-widget-hover-flicker.md]]"
created: 2026-08-19
updated: 2026-08-20
aliases:
  - 悬停闪烁
  - hover flicker
  - #5442
---

# Find Widget 悬停闪烁

> Monaco Find Widget（Ctrl+F）按钮 hover 闪烁 bug —— 根因分析与修复记录。**状态：已修复**（客户端工作区方案，2026-08-11）。

## 现象

- 编辑器内按 `Ctrl+F` 打开查找框，鼠标悬停在 **close（×）** 和 **"在选区中查找"** 图标上时持续闪烁，浮层反复出现/消失，按钮**无法点击**。
- 只在 hover 时触发；左右两个编辑器均复现。

## 根因（上游 bug）

这是 **monaco-editor 0.56.0** 的已知上游 bug：

| Issue | 状态 | 内容 |
|-------|------|------|
| [#5296](https://github.com/microsoft/monaco-editor/issues/5296) | open | hover close/find-in-selection 按钮闪烁 |
| [#5208](https://github.com/microsoft/monaco-editor/issues/5208) | open | tooltip 闪烁导致按钮无法点击 |
| [#5442](https://github.com/microsoft/monaco-editor/issues/5442) | 已并入 0.56.1 | 根因：未定位（`position: static`）编辑器容器位于其他页面内容之后 → hover 闪烁；修复=浮层锚定到实际 containing block |

**机制**：hover 浮层（`.context-view` 中的 `.workbench-hover-container`）被 append 到编辑器的挂载 div（`position: static`）。`doLayout()` 用容器 `getDomNodePagePosition()` + `scrollTop/scrollLeft` 计算浮层位置——当编辑器上方有页面内容、中间隔着未定位的 `overflow: auto` 滚动容器时，containing block 与测量基准错位 → 浮层落在偏离位置 → 遮住按钮 → 光标离开 → 闪烁循环。

**版本状态**：npm `latest` 仍是 `0.56.0`（`next` dev tag 早于修复），拿不到含 #5442 的 `0.56.1`，故用客户端等价工作区。

## 修复

1. **核心**：`<Editor className="relative" />`——`className` 作用在挂载 div（浮层 append 目标），使其成为定位元素，containing block 与测量基准对齐。
   - `MonacoEditor.tsx` + `ImportPreviewDialog.tsx`（DiffEditor 同防）。
2. **加固**：`page.tsx` 两个 `overflow:auto` 滚动容器补 `position:relative`。
3. **上游追踪（最终解）**：`monaco-editor@0.56.1` 发布后升级并移除工作区（已在父仓库 `CLAUDE.md` 记录）。

## 验证与遗留风险

- 修复前：Ctrl+F → hover → `.context-view` 浮层出现/消失循环。
- 修复后：hover 稳定、按钮可点击；回归（自动保存、双 tab 协作、`tsc && lint && test`）。
- **遗留**：工作区方案依赖 CSS 定位对齐，与上游 JS 层修复机制不完全相同；极窄窗口/特殊缩放边界仍可能复现，需依赖 0.56.1 彻底解决。改动仅 `position`，不影响 undo/折叠/协作。

## 2026-08-20 补充：与 addExtraSpaceOnTop 决策的边界

- 本页工作区（`globals.css` 的 `.relative > .context-view` + 编辑器 `className="relative"`）针对 **hover 浮层闪烁**，与查找框顶部空白**无关**，升级 0.56.1 后照常移除。
- `find.addExtraSpaceOnTop: false`（纯悬浮右上角、不插顶部 ViewZone）是独立的有意决策，见 [[features/编辑器|编辑器]]；**不随本工作区移除**。

## 关联

- [[FindWidget滚动同步|FindWidget 滚动同步]] — 同源 Find Widget 相关故障
- [[features/编辑器|编辑器]] — 影响组件
- [[architecture/技术栈|技术栈]] — monaco-editor 版本
