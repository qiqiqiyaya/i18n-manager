---
title: Find Widget 滚动同步
category: bug
tags:
  - i18n-manager
  - Monaco
  - bug
  - 滚动同步
source:
  - "[[raw/bug/find-widget-scroll-sync.md]]"
created: 2026-08-19
updated: 2026-08-19
aliases:
  - 滚动同步 bug
  - scroll sync
---

# Find Widget 滚动同步

> Find Widget（Ctrl+F）触发错误滚动同步 —— 根因分析与修复记录。**状态：已修复**（2026-08-11）。

## 现象

- 初次进入编辑器页，在 Schema 编辑器按 `Ctrl+F` 弹出查找框后，**右侧译文编辑器自动向下滚动**；按 `Escape` 关闭后，**又向上滚动回原位**。

## 根因

项目实现了左右编辑器**双向滚动同步**（`page.tsx`）：

- Schema `onDidScrollChange` → 算滚动比例 `ratio` → `scrollToRatio` → 对侧编辑器。
- `isScrollingRef` 防反馈循环。

Monaco 的 `onDidScrollChange` 在**任何滚动位置变化**时都触发，包括布局变化。Find Widget 出现/消失会改变编辑器 `scrollHeight`（+33/-33px）：

| 时机 | Schema scrollTop | Schema scrollHeight | Locale scrollTop |
|------|-----------------|--------------------|-------------------|
| 已滚动到某位置 | 500 | 1596 | ~534 |
| **Ctrl+F 打开** | 533 | 1629（+33） | 548（被同步） |
| Escape 关闭 | 500 | 1596（-33） | 534（跳回） |

**关键区分**：
- **用户滚动**：`scrollTop` 变化，`scrollHeight` 不变 → 应同步。
- **查找框出现/消失**：`scrollHeight` 变化 → 不应同步。
- **内容编辑**：`scrollHeight` 变化 → 不应同步。
- **初始加载**：`scrollHeight` 从 0 变化 → 不应同步。

## 修复

在 `MonacoEditor.tsx` 的 `onDidScrollChange` 中新增 `prevScrollHeight` 闭包：`scrollHeight` 变化时跳过同步（return），仅 `scrollHeight` 不变时计算并同步 ratio。

改动文件：`src/components/json-editor/MonacoEditor.tsx`（约 3 行）。

## 验证与边界

- 修复后：Ctrl+F / Escape → 右栏不动；正常滚动 → 双向同步仍正常。
- `npx tsc --noEmit && npm test`。

| 场景 | scrollHeight | 行为 |
|------|-------------|------|
| 用户滚动滚轮 | 不变 | 正常同步 ✅ |
| 查找框出现/消失 | 变化（±33） | 跳过 ✅ |
| 编辑 JSON 内容（换行/删行） | 变化 | 跳过（下次用户滚动正常）✅ |
| 初始加载 | 0 → 实际 | 跳过（ratio=0 归零无害）✅ |

## 关联

- [[FindWidget悬停闪烁|FindWidget 悬停闪烁]] — 同源 Find Widget 相关故障
- [[features/编辑器|编辑器]] — 双栏滚动同步实现
