# 项目内译文搜索（Project Translation Search）

> 状态：已实现（2026-08-12）。本文是最终实现方案的落地记录。
> 决策来源：`/grill-me` 设计讨论定稿 —— Q2-A（Popover 下拉列表）、Q3-C（精确定位 + Monaco find 高亮）、Q4-A（仅已打开语言）、Q5-A（仅译文值）；2026-08-13 补 Q1-A/Q2-A/Q3-A（弹出层鼠标移出自动关闭），同日再定 Q1-A/Q2-A（点击跳转后保留输入与结果，仅关闭弹出层）。
>
> **命名说明**：本功能曾在旧文档中被称为「全局跨语言搜索（Global Search）」，该名称有误导性——它**不是**跨项目的全局搜索，而是在**当前项目内**、遍历该项目所有已打开语言文件按译文内容查找。故更名为「项目内译文搜索（Project Translation Search）」。

## 背景

编辑器页（`src/app/projects/[id]/page.tsx`）顶部工具栏原有一个占位文案为「搜索译文内容...」的搜索框，但它只维护 `searchInput` 局部状态，**全项目没有任何消费它的代码**——是死控件。配套的 `useSearch` hook（`src/hooks/useSearch.ts`）已完整实现并通过单测，但从未被任何组件引用；设计文档 `i18nManager.md` §6.2.5 明确定义了「项目内译文搜索（按译文内容）」功能，只是 UI 一直未接线。

## 功能定义

- 在编辑器顶部工具栏搜索框输入关键词，遍历**当前项目**所有已打开语言文件（`openLocales`）的**译文值**（字符串 `includes`，不区分大小写），结果以**下拉列表**呈现。
- 结果项：语言 Tag + 键路径（点分）+ 高亮值。
- 点击结果：切换到对应语言 Tab，**精确定位**到该键所在行并聚焦，同时打开 Monaco find 框高亮该语言内全部关键词匹配；输入与结果**保留**，仅关闭弹出层。
- 与 Monaco 内置 Ctrl+F「编辑器内搜索」（搜键名、单栏内）互补，不做重叠。

## 决策记录

| 决策点 | 结论 | 理由 |
|--------|------|------|
| Q2 结果形态 | 搜索框下方 Popover 下拉列表 | 轻量、不挤占双栏编辑区，符合设计文档「结果以列表呈现」 |
| Q3 点击跳转 | 精确定位行 + 打开 find 高亮全部匹配 | 点哪条停哪行；find 让用户看到该语言内所有匹配 |
| Q1' 跳转后清理 | 保留输入与结果，仅关闭弹出层 | 跳转只是查看，不清空让用户可继续参考/复用该搜索 |
| Q4 搜索范围 | 仅已打开语言 `openLocales` | 符合设计文档 + hook 现状，零额外请求，实时性有保证 |
| Q5 搜索内容 | 仅译文值 | 键名搜索由 Ctrl+F 兜底，功能不重叠 |
| Q1 移出关闭 | 输入框 + 弹出层 + 16px 间隙（组合区域） | 鼠标从输入框滑向结果列表的过程中不误关，能正常点击结果 |
| Q2 重新打开 | 移回组合区域 / 继续输入 / 重新聚焦即打开 | 「悬停即显示」，与速查浮层交互一致，不误弹 |
| Q3 额外关闭途径 | Esc 键、点击输入框外部立即关闭 | 键盘操作者预期；点击外部比等延迟更干脆 |

## 实现

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/lib/monaco-reveal.ts` | 纯函数：`inferKeyPath(model, lineNumber)` + `findKeyLine(model, keyPath)` |
| `src/components/project/TranslationSearchResults.tsx` | 展示组件：结果列表（Tag + 键路径 + SearchHighlight 高亮 + 空态） |

### 改动文件

| 文件 | 改动 |
|------|------|
| `src/hooks/useSearch.ts` | 零改动（已就绪、已测试） |
| `src/components/project/LocaleEditor.tsx` | 删除本地 `inferKeyPath` 定义，改从 `monaco-reveal` 导入；`useImperativeHandle` 新增 `revealKey(keyPath)` |
| `src/app/projects/[id]/page.tsx` | 接线：`useSearch` + RxJS 防抖 Subject + `Popover` 包住搜索框渲染结果列表 + 点击跳转 handler + 鼠标移出关闭逻辑 |
| `vitest.config.ts` | coverage include 增加 `src/lib/monaco-reveal.ts`、`src/components/project/TranslationSearchResults.tsx` |

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

**弹出层关闭状态机**（2026-08-13，复用速查的 mousemove 桥接模式）：
- 开关：`open = searchInput 有文字 && !dismissed`
- `dismissed` 置位（关闭）：
  - 鼠标离开「输入框 + 弹出层 + 16px 间隙」组合区域 → 延迟 400ms 后关闭（`document` 级 `mousemove` 经 `classifySearchRegion` 三态归类，复用 `scheduleClose`/`cancelClose` 思路）
  - Esc 键 → 立即关闭
  - 点击输入框外部 / 焦点移出 → 立即关闭
- `dismissed` 清除（重新打开）：鼠标移回**输入框**、继续输入、重新聚焦 —— 满足「打字时鼠标在别处也能看到结果、移开收起来、移回来又出现」
- **mousemove 桥接三态**（`classifySearchRegion` 纯函数，Q1-A 修复闪烁）：输入框上悬停 → 取消关闭 + REOPEN；弹出层上悬停 → **仅取消关闭、不 REOPEN**（弹出层旧位置在卸载后不再触发重开，消除点击跳转+鼠标移动时的闪烁）；两者之外 → 延时关闭
- 点击结果跳转（Q1'-A/Q2'-A）：**保留输入内容与搜索结果**，仅 `DISMISS` 关闭弹出层；悬停/聚焦可再弹出同一批结果

## 已识别边角

- 目标语言正被编辑且未 flush → 编辑器文本 ≠ store → `findKeyLine` 找不到行 → reveal 静默跳过，`find(keyword)` 兜底，不崩
- find 框打开后布局变化 → reveal 在前，行仍在可视区
- 关键词含正则特殊字符 → Monaco find 默认按字面量处理，无需转义（`SearchHighlight` 内部已自行 `escapeRegExp`）
- 鼠标在输入框与弹出层之间穿梭 → 16px 间隙桥接 + 400ms 延迟，不误关
- Esc/点击外部后，鼠标仍在输入框上 → 会立即重新打开（Q2 悬停即显示），符合预期

## 测试

- `src/lib/monaco-reveal.test.ts`：`inferKeyPath`（单层/嵌套/数组跳过）+ `findKeyLine`（命中/数组跳过/不存在返回 null）
- `src/components/project/TranslationSearchResults.test.tsx`：渲染条目、高亮、空结果态、点击回调

## 验证

```bash
npx tsc --noEmit
npm run lint
npm test
```

手测（`npm run start:server`）：多语言打开后搜词 → 结果下拉 → 点击 → 切语言 + 定位 + find 高亮；鼠标移出组合区域 → 400ms 后收起；移回/输入/聚焦 → 重新打开；Esc/点击外部 → 立即关闭。
