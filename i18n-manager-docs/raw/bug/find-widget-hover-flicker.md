# Find Widget（Ctrl+F）按钮 hover 闪烁 bug —— 根因分析与修复记录

> 状态：已修复（客户端工作区方案，2026-08-11）
> 涉及：`monaco-editor@0.56.0`（`@monaco-editor/react@4.7.0` 传递依赖）

## 1. 现象

编辑器内按 `Ctrl+F` 打开 Monaco 查找框，鼠标悬停在 **close（×）图标** 和它左边的 **"在选区中查找"（find-in-selection）图标** 上时，图标**持续闪烁**，浮层反复出现/消失，按钮**无法点击**。

- 只在 hover 时触发，不 hover 一切正常
- 触发按钮集中在查找框右侧的操作按钮（close / 在选区中查找 / 上一个 / 下一个）
- 项目内两个编辑器（Schema 左栏 + Locale 右栏）都会复现

## 2. 根因（上游 bug，非本项目代码问题）

这是 **monaco-editor 0.56.0 的已知上游 bug**，症状与上游报告逐字吻合：

| 上游 Issue | 状态 | 内容 |
|---|---|---|
| [microsoft/monaco-editor#5296](https://github.com/microsoft/monaco-editor/issues/5296) | open | 「hover close 按钮或 find-in-selection 按钮会闪烁；**把编辑器上方那个 div 移掉就好了**」——与本项目布局（编辑器上方有 header + tab 栏）一致 |
| [microsoft/monaco-editor#5208](https://github.com/microsoft/monaco-editor/issues/5208) | open | 「由于 tooltip 闪烁，Find Widget 按钮**无法点击**」——对应"无法操作" |
| [microsoft/monaco-editor#5442](https://github.com/microsoft/monaco-editor/issues/5442) | 已并入 **0.56.1** | 根因定论：「当**未定位（`position: static`）的编辑器容器**位于其他页面内容之后时，Find Widget 操作按钮的 hover 会闪烁」；修复方向＝「让 hover 浮层**锚定到其实际的 containing block**」 |

### 2.1 机制（对照本仓库 `node_modules/monaco-editor@0.56.0` 源码核实）

1. 查找框操作按钮的 tooltip 由 Monaco **instant hover service** 渲染（`esm/vs/editor/contrib/find/browser/findWidget.js` 中 `SimpleButton`/`Toggle` 均传入 `hoverLifecycleOptions` + `_hoverService`），浮层是 `.context-view`（`position: absolute`）中的 `.workbench-hover-container`。
2. 浮层被 append 到 **编辑器的容器 DOM 节点**（`esm/vs/editor/standalone/browser/standaloneLayoutService.js` 的 `mainContainer` → `getContainerDomNode()`）。在 `@monaco-editor/react` 里，这个容器就是编辑器挂载用的 inner div，**没有 `position`（`position: static`）**。
3. `esm/vs/base/browser/ui/contextview/contextview.js` 的 `doLayout()`（169-174 行）用 `getDomNodePagePosition(container)` + 容器 `scrollTop/scrollLeft` 计算浮层 `top/left`——**前提是浮层所在坐标空间与测量基准一致**。当编辑器上方有页面内容、中间隔着未定位的 `overflow: auto` 滚动容器时，containing block 与测量基准**错位**。
4. 错位后 tooltip 落在偏离按钮的位置，遮住/顶开按钮 → 光标"离开"按钮 → hover 消失 → tooltip 隐藏 → 光标回到按钮 → **无限闪烁循环**；且浮层不断拦截事件，按钮点不动。

> 上游 #5442 的修复是 monaco-core（vscode）里的 JS 改动，随 **0.56.1** 发布。但 npm 上 `latest` 仍是 `0.56.0`（`next` dev tag 为 2026-06-25 构建，早于 2026-08-09 的修复），**当前拿不到 0.56.1**，因此本仓库用客户端等价的"锚定到实际 containing block"工作区修复。

## 3. 本项目布局中的触发条件

`src/app/projects/[id]/page.tsx` 的 DOM 链：

```
<div style="height:100vh; flex column">                 ← 页面根
  <header>…工具栏…</header>                             ← 编辑器上方的页面内容
  <div style="flex:1; display:flex; overflow:hidden">
    <div style="flex:0 0 50%">
      <div>主表 Schema</div>
      <div style="flex:1; overflow:auto">               ← ⚠️ 未定位的滚动容器（position: static）
        <div style="width:100%; height:100%">           ← MonacoEditor 外层包装（position: static）
          <section style="position:relative">           ← @monaco-editor/react 内部 section（relative）
            <div style="width:100%">                    ← ⚠️ 挂载 div（position: static）= getContainerDomNode()，浮层 append 于此
              <div class="monaco-editor" style="position:relative">…</div>
              <div class="context-view" style="position:absolute">…</div>  ← hover 浮层
            </div>
          </section>
        </div>
      </div>
    </div>
  </div>
</div>
```

`@monaco-editor/react` 的 `<Editor>` 只给外层 `<section>` 设了 `position: relative`，**挂载 div（浮层实际父节点）是 `position: static`**——浮层（`position: absolute`）的实际 containing block 会向上找到 `<section>` 或更外层，与 Monaco 用 `getDomNodePagePosition(挂载div)` 测量的坐标基准**不完全重合**，叠加"上方页面内容 + 未定位滚动容器"即触发错位闪烁。

## 4. 修复方案

### 4.1 核心：让挂载容器成为定位元素（客户端等价 #5442 修复）

给 `<Editor>` 传 `className="relative"`——`@monaco-editor/react` 的 `className` 作用在**挂载 div**（`getContainerDomNode()`，浮层 append 的目标）上。此后 `.context-view`（`position: absolute`）的 containing block = 该挂载 div = Monaco 测量坐标的基准，二者对齐，浮层锚定到实际 containing block，闪烁消除。

- `src/components/json-editor/MonacoEditor.tsx`：`<Editor … className="relative" />`
- `src/components/project/ImportPreviewDialog.tsx`：`DiffEditor` 同样加 `className="relative"`（防止同一 bug 在导入预览出现）

### 4.2 加固：滚动容器补定位

`src/app/projects/[id]/page.tsx` 两个 `overflow: 'auto'` 滚动容器（左栏 `:113`、右栏 `:120`）补 `position: 'relative'`，消除 #5442 点名的"未定位编辑器容器"触发条件。

### 4.3 上游追踪（最终解）

`monaco-editor@0.56.1` 发布后升级，可移除 4.1/4.2 的工作区（0.56.1 已含 #5442 的 ContextView 定位修复）。已在 `CLAUDE.md` 记录。

## 5. 验证

- **浏览器复现（修复前）**：`Ctrl+F` → hover close/find-in-selection → 截图确认 `.context-view` 浮层出现/消失循环
- **浏览器验证（修复后）**：同样操作，hover 稳定、按钮可点击
- **回归**：输入 → 自动保存；双 tab 实时协作同步；`npx tsc --noEmit && npm run lint && npm test`

## 6. 遗留风险

1. **工作区方案依赖 CSS 定位对齐**，与上游修复（JS 层）机制不完全相同；若在极窄窗口/特殊缩放等边界下仍复现，需依赖 0.56.1 升级彻底解决。
2. 仅改动 `position`，不影响 Monaco undo/折叠/实时协作（编辑器内容写入仍走 `computeMinimalEdit` 最小编辑路径）。
