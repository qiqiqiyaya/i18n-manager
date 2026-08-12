# 全局跨语言搜索（Global Search）

> 状态：已实现（2026-08-12）。本文是最终实现方案的落地记录。
> 决策来源：`/grill-me` 设计讨论定稿 —— Q2-A（Popover 下拉列表）、Q3-C（精确定位 + Monaco find 高亮）、Q4-A（仅已打开语言）、Q5-A（仅译文值）。

## 背景

编辑器页（`src/app/projects/[id]/page.tsx`）顶部工具栏原有一个占位文案为「全局搜索译文内容...」的搜索框，但它只维护 `globalSearchKeyword` 局部状态，**全项目没有任何消费它的代码**——是死控件。配套的 `useSearch` hook（`src/hooks/useSearch.ts`）已完整实现并通过单测，但从未被任何组件引用；设计文档 `i18nManager.md` §6.2.5 明确定义了「全局跨语言搜索（按译文内容）」功能，只是 UI 一直未接线。

## 功能定义

- 在编辑器顶部工具栏搜索框输入关键词，遍历当前项目**所有已打开语言文件**（`openLocales`）的**译文值**（字符串 `includes`，不区分大小写），结果以**下拉列表**呈现。
- 结果项：语言 Tag + 键路径（点分）+ 高亮值。
- 点击结果：切换到对应语言 Tab，**精确定位**到该键所在行并聚焦，同时打开 Monaco find 框高亮该语言内全部关键词匹配。
- 与 Monaco 内置 Ctrl+F「编辑器内搜索」（搜键名、单栏内）互补，不做重叠。

## 决策记录

| 决策点 | 结论 | 理由 |
|--------|------|------|
| Q2 结果形态 | 搜索框下方 Popover 下拉列表 | 轻量、不挤占双栏编辑区，符合设计文档「结果以列表呈现」 |
| Q3 点击跳转 | 精确定位行 + 打开 find 高亮全部匹配 | 点哪条停哪行；find 让用户看到该语言内所有匹配 |
| Q4 搜索范围 | 仅已打开语言 `openLocales` | 符合设计文档 + hook 现状，零额外请求，实时性有保证 |
| Q5 搜索内容 | 仅译文值 | 键名搜索由 Ctrl+F 兜底，功能不重叠 |

## 实现

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/lib/monaco-reveal.ts` | 纯函数：`inferKeyPath(model, lineNumber)` + `findKeyLine(model, keyPath)` |
| `src/components/project/GlobalSearchResults.tsx` | 展示组件：结果列表（Tag + 键路径 + SearchHighlight 高亮 + 空态） |

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/hooks/useSearch.ts` | 零改动（已就绪、已测试） |
| `src/components/project/LocaleEditor.tsx` | 删除本地 `inferKeyPath` 定义，改从 `monaco-reveal` 导入；`useImperativeHandle` 新增 `revealKey(keyPath)` |
| `src/app/projects/[id]/page.tsx` | 接线：`useSearch` + RxJS 防抖 Subject + `Popover` 包住搜索框渲染结果列表 + 点击跳转 handler |
| `vitest.config.ts` | coverage include 增加 `src/lib/monaco-reveal.ts`、`src/components/project/GlobalSearchResults.tsx` |

### 关键实现细节

**跳转时序**（`page.tsx` 点击 handler）：
1. `setActiveLang(lang)` —— 切换语言 Tab，`LocaleEditor` 的 activeLang effect 会 flush 旧语言并同步新语言内容
2. `requestAnimationFrame(() => { revealKey(key); find(searchInput); })` —— rAF 保证 render + effects 完成后 Monaco 已同步到目标语言
3. 顺序：先 `revealKey` 后 `find` —— find 框打开会改变编辑器布局，reveal 在前保证行先就位
4. 关闭 Popover、清空输入

**`revealKey(keyPath)`**（`LocaleEditor` handle）：
- `findKeyLine(model, keyPath)` 定位行 → `revealLineInCenter(line)` + `setPosition({ lineNumber, column: 1 })` + `editor.focus()`
- 行未找到（目标语言正被编辑未 flush、编辑器文本与 store 不一致的边角）→ 静默跳过，由 `find(keyword)` 兜底

**`findKeyLine`**：
- 遍历 model 行，用 `inferKeyPath`（从某行反推完整点分键路径，支持嵌套）反查匹配行
- 只依赖 `model.getLineContent`，可用轻量 mock model 单测

**防抖**（项目约定 #7：RxJS）：
- 双状态模式（镜像首页 `page.tsx:38-53`）：`searchInput`（受控输入值，即时显示）+ `Subject` → `pipe(debounceTime(300), distinctUntilChanged())` → hook 的 `setKeyword`（驱动 `results` 重算）

## 已识别边角

- 目标语言正被编辑且未 flush → 编辑器文本 ≠ store → `findKeyLine` 找不到行 → reveal 静默跳过，`find(keyword)` 兜底，不崩
- find 框打开后布局变化 → reveal 在前，行仍在可视区
- 关键词含正则特殊字符 → Monaco find 默认按字面量处理，无需转义（`SearchHighlight` 内部已自行 `escapeRegExp`）

## 测试

- `src/lib/monaco-reveal.test.ts`：`inferKeyPath`（单层/嵌套/数组跳过）+ `findKeyLine`（命中/数组跳过/不存在返回 null）
- `src/components/project/GlobalSearchResults.test.tsx`：渲染条目、高亮、空结果态、点击回调

## 验证

```bash
npx tsc --noEmit
npm run lint
npm test
```

手测（`npm run start:server`）：多语言打开后搜词 → 结果下拉 → 点击 → 切语言 + 定位 + find 高亮。
