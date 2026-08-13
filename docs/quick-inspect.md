# 速查（Quick Inspect / Cross-Reference Popover）

> 状态：已定稿（2026-08-13），待实现。本文是 `/grill-me` 设计讨论的最终落地文档。
> 代码名 `cross-reference`，组件 `CrossReferencePopover`，用户界面显示名「速查」。

## 一句话定位

在 Schema 或译文编辑器中，**指向/选中任意键值**，浮层速查该词条在**主表 Schema（键+说明）**与**各语言译文**中的信息，可跳转、可复制；悬浮跟随、滚动折叠、每项目可开关。

## 决策记录

| 决策 | 结论 |
|---|---|
| 触发 | **仅选中触发（Q1-A，2026-08-13）**：双击选词/鼠标拖选/Shift+方向键选词等非空 selection 才弹；无选中（单击/光标移动/点击空白）一律关闭。已移除原「无选中退化光标 token」逻辑，避免"点到哪里就用哪里的 key 重新弹出"。RxJS 防抖 ~200ms + 非编辑中 + 命中才弹 |
| 旧浮层 | 合并取代 `LocaleEditor` 现有「翻译参考」Popover，两栏通用 |
| 匹配 | 双向命中（键路径/末段/值包含），精确优先 |
| 定位 | 锚定 token（portal 渲染，滚动/布局重算） |
| 滚动折叠 | 滚动时缩成**屏幕固定小标记**（显示键名），悬停恢复完整弹层 |
| 跳转 | Schema 命中 → 主表；译文命中 → 译文栏（自动切语言 Tab + revealKey）；目标语言未打开自动打开 |
| 复制 | 每行复制按钮 + 双击弹层内值复制 + Tooltip 提示 + 复制成功反馈 |
| 关闭 | 三态 + 桥接（移入弹层取消关闭；离开双区 + 间隙 400ms 关）+ **点击「源编辑器 + 浮层/标记」之外立即关闭（Q2-A，2026-08-13）** |
| 开关 | `ProjectMeta.referenceEnabled`（默认 true）+ `project:settings` Socket 广播 last-write-wins + 顶部工具栏按钮 |
| 展示 | 无匹配不弹；命中分「Schema」「译文（按语言分组）」两段；**全部命中直接渲染，弹层内滚动（Q2-A，2026-08-14：移除原「>6 条折叠 + 还有 N 条…」，改 `maxHeight 320 + overflowY auto` 出滚动条）** |
| 宽度 | **内容自适应（Q1-A，2026-08-14）**：面板 `width: max-content` + `min-width 300`，钳制 `max-width: min(520, 视口-2*MARGIN)`；行内 value/desc 的 flex 省略号 span 补 `minWidth: 0` 修复溢出根因，key 列 `maxWidth 160` 截断防长 key 撑爆 |
| 状态机 | `hidden ⇄ expanded ⇄ collapsed`，纯 reducer 可单测 |

## 架构

- **page.tsx 拥有唯一浮层实例**：编辑器只上报「当前 token + 屏幕锚点」回调；跨栏跳转/切语言由页面协调（持有两个编辑器 ref）
- 新查询函数 `lookupToken(token, schema, openLocales)` → `{ schemaHits, translationHits }`
- 新状态机 `referenceReducer`：hidden / expanded / collapsed 转移
- 每项目开关：`ProjectMeta.referenceEnabled` + `project:settings` Socket 事件（last-write-wins，同 locale:save）

### 匹配规则（lookupToken）

```
token 规范化（trim + 小写）
schemaHits:   schema 扁平化后 key 全路径 === token（exact）或末段 === token（segment）
translationHits: 各语言扁平化后 (lang, key, value)：
                  value 是字符串且包含 token → matchType 'value'
                  或 key 全路径/末段 === token → matchType 'key'
排序：key-exact > key-segment > value-exact > value-contains
数组叶子值跳过；返回完整 hits，折叠交给组件
```

### 状态机（referenceReducer）

| 动作 | 转移 |
|---|---|
| `SET_TOKEN {token, anchor, source}` | → expanded（新 token 时先 hidden 再 expanded） |
| `SCROLL`（源编辑器滚动） | expanded → collapsed |
| `HOVER_MARKER` | collapsed → expanded（重锚定，越界钳制） |
| `ENTER_POPOVER` | 取消 pending close，保持 expanded |
| `LEAVE_ALL`（离开 编辑器+弹层+标记，经桥接） | 400ms 后 → hidden（collapsed 时标记一起消失） |
| `CLICK_OUTSIDE`（点击「源编辑器 + 浮层/标记」之外，Q2-A） | 立即 → hidden（不等 400ms） |
| `TOKEN_MISS`（无匹配 / 无选中，Q1-A） | → hidden（不弹） |

### 每项目开关（Block A）

- `ProjectMeta.referenceEnabled?: boolean`（缺省视为 true，兼容旧项目）
- `updateProjectSchema` 增加 `referenceEnabled: z.boolean().optional()`
- `updateProject` 持久化到 meta.json
- Socket：客户端 `project:settings {projectId, referenceEnabled}` → 服务端写盘 + 广播 `project:settings:updated` 到房间（last-write-wins，无冲突检测，同 locale）
- `useProjectEditor.loadProject` 载入 `meta?.referenceEnabled ?? true`
- 顶部工具栏按钮：开关「速查」，关闭时浮层完全抑制

## 实现块划分

| 块 | 内容 |
|---|---|
| A | 每项目开关：types + validation + projects.ts + socket-handler + useSocket + editorStore + useProjectEditor |
| B | `src/lib/reference-lookup.ts` lookupToken 纯函数（TDD） |
| C | `src/lib/reference-state.ts` referenceReducer 纯函数（TDD） |
| D | `src/components/project/CrossReferencePopover.tsx`（TDD） |
| E | 接线：SchemaEditor/LocaleEditor 上报 token 回调 + 删旧翻译参考浮层 + SchemaEditor 补 revealKey + page.tsx 唯一浮层/滚动折叠/跨栏跳转/开关按钮 |
| F | 全量校验（tsc/lint/test/coverage） |

## 测试

- `reference-lookup.test.ts`：键精确/末段/值包含/数组跳过/无匹配/排序
- `reference-state.test.ts`：全状态转移
- `CrossReferencePopover.test.tsx`：两段分组、>6 折叠、复制按钮+双击复制、标记态、无匹配不渲染

## 验证

```bash
npx tsc --noEmit
npm run lint   # 改动文件无新增问题
npm test
```

手测（`npm run start:server`）：指向/选中键值 → 浮层速查 → 滚动折叠成标记 → 悬停恢复 → 跳转/复制 → 工具栏开关。
