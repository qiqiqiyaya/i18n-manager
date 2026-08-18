# Schema 重复 Key 检测 —— 设计文档

> 状态：设计已确认，待实现
> 日期：2026-08-10

## 1. 需求

在主表 Schema 编辑器工具栏增加一个按钮，点击后扫描当前 Schema，找出**所有键名相同但路径不同的键节点**（不论嵌套层级、不论是叶子键还是中间层对象键），在右侧 Drawer 中分组展示，支持点击跳转到编辑器对应行。

**判定规则**：以键的**最后一个分段**（即键名本身）为分组依据。`user.profile.name` 与 `admin.name` 的键名同为 `name` → 判定为重复。

**实测规模**（`data/projects/921991cb-.../schema.json`，78 个键节点 / 54 个不同键名）：报出 13 组、涉及 37 个节点，占全树 47%。该数据为 `new_key_*` 测试数据，命名不具代表性，但足以证明结果面板必须支持分组收起与排序。

## 2. 已确认的设计决策

| # | 决策 | 选择 |
|---|------|------|
| 1 | 检测范围 | **叶子键 + 中间层对象键全部纳入** |
| 2 | 结果载体 | **右侧 `Drawer`**（不压缩编辑器高度） |
| 3 | 每行内容 | **键名 + 完整路径 + 行号 + 点击跳转** |
| 4 | JSON 非法时 | **按钮 `disabled`**，Tooltip 说明原因 |
| 5 | 行号来源 | **引入 `jsonc-parser`**，`parseTree()` → `offset` → `model.getPositionAt()` |
| 6 | 检测输入 | **编辑器原文 AST**（非 store 已解析对象） |
| 7 | 按钮形态 | **纯图标按钮**，格式化/排序一并改为图标，用色块背景分区提高辨识度 |
| 8 | 结果组织 | **`Table` + `expandable`**，默认收起 + 一键展开/收起全部 |
| 9 | 零重复反馈 | **不开 Drawer**，`message.success('未发现重复键')` |

## 3. 关键设计理由（为什么不是别的方案）

### 3.1 为什么走 AST 而不是 `JSON.parse`

`JSON.parse` 对字面重复键 `{"a":1,"a":2}` **静默保留最后一个**。全项目所有数据通路（`SchemaEditor.tsx:163`、`LocaleEditor.tsx:157`、`validation.ts` 的 Zod、`flattenObject`）都在 `JSON.parse` **之后**才拿到数据，重复键在任何代码能观察到它之前就已消失。

这不只是本功能的实现障碍——它是一条**现存的数据丢失路径**：用户写出重复键 → 一个键静默丢失 → 该键被 `syncSchemaChangesToLocales`（`src/lib/data-layer/schema.ts`）当作"删键"同步到所有 locale 文件，译文一并删除。走 AST 是唯一能顺手覆盖这个缺陷的路线。

### 3.2 为什么检测输入必须是编辑器原文，不能是 `editorStore.schema`

决策 4（JSON 非法时置灰按钮）的目的就是保证「报告内容 = 屏幕内容」这一契约。若检测输入退回 store 已解析对象，该契约在 debounce 窗口内（`NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE`，默认 1000ms）即被破坏——用户改完一秒内点按钮会看到旧结果。既然已为此专门置灰按钮，就不应在数据源上放弃这个保证。

### 3.3 为什么引入 `jsonc-parser` 而不自己写扫描器

项目里已有两个基于缩进的文本扫描器：`LocaleEditor.tsx:280-306` 的 `inferKeyPath` 和 `utils.ts:233-282` 的 `determineInsertionPath`。两者都与缩进格式强耦合，无法处理单行 JSON、键名含转义引号、`{}` 同行闭合等情况——已经是技术债，不应再加第三个。

`jsonc-parser@3.3.1` 是微软官方库、**零运行时依赖**、与 Monaco（`monaco-editor@0.56.0`，已作为 `@monaco-editor/react` 的传递依赖存在）同源，被 VS Code 全量验证。

### 3.4 为什么 `find()` 不足以实现跳转

`MonacoEditor.tsx:160-173` 的 `find(term)` 只是打开 Monaco 原生查找框并塞入搜索词——**不滚动、不精确定位**。搜 `name` 会命中全部 `name` 出现处。在同名键出现 5 次的真实场景（数据中 `new_key` 即 5 次）下等于没有跳转。精确跳转必须用 `revealLineInCenter` + `setSelection`，这需要真实行号，即 3.3 的前提。

## 4. 实现方案

### 4.1 新增纯函数模块 `src/lib/duplicate-keys.ts`

遵循项目既有的「纯函数提取 + co-located 测试」路线（`src/lib/monaco-edits.ts` 是先例）。编辑器组件本身无测试覆盖，逻辑必须落在可测的纯函数里。

```ts
import { parseTree, type Node } from 'jsonc-parser';

/** 单个键节点的出现位置 */
export interface KeyOccurrence {
  /** 完整点分隔路径，如 user.profile.name */
  path: string;
  /** 键名（路径最后一段） */
  keyName: string;
  /** 该键在源文本中的字符偏移（指向键名的起始引号） */
  offset: number;
  /** 节点类型：叶子键 / 中间层对象键 */
  kind: 'leaf' | 'branch';
}

/** 一组同名键 */
export interface DuplicateGroup {
  keyName: string;
  count: number;
  occurrences: KeyOccurrence[];
}

/**
 * 从 JSON 源文本收集所有键节点（含中间层）。
 * 与 JSON.parse 不同，字面重复键会被全部保留。
 * @returns null 表示文本无法解析为 AST
 */
export function collectKeyOccurrences(text: string): KeyOccurrence[] | null;

/**
 * 按键名分组，仅返回出现次数 > 1 的组。
 * 排序：count 降序，同 count 按 keyName 字典序，保证输出稳定。
 */
export function findDuplicateKeys(text: string): DuplicateGroup[] | null;
```

**实现要点**：
- `parseTree()` 返回的 `property` 节点，`children[0]` 是键名节点（`node.value` 为键名字符串，`node.offset` 为偏移），`children[1]` 是值节点
- `kind` 判定：值节点 `type === 'object'` 且有 `children` → `'branch'`，否则 `'leaf'`。**空对象 `{}` 视为 `'leaf'`**，与 `flattenObject`（`utils.ts:22-23`）和 `getLeafPaths`（`utils.ts:101-102`）的既有行为保持一致
- **数组按叶子处理，不递归进数组元素**，与项目约束 5（`flattenObject` 原样保留数组作为叶子值）一致
- 路径构造用 `.` 拼接。**已知边界**：键名本身含 `.` 时路径有歧义（`{"a.b": 1}` 与 `{"a":{"b":1}}` 产生同一路径），但本功能只按**最后一段键名**分组、跳转靠 `offset` 而非路径反查，因此不受影响——不引入 `flattenObject` 那种静默覆盖问题
- 排序必须确定：`count` 降序 + `keyName` 字典序，否则测试不稳定

### 4.2 修改 `SchemaEditor.tsx`

**工具栏改造**（`:501-585`），三个操作按钮改为纯图标 + 色块分区：

```
┌──────────────────────────────────────────────────────┐
│ [＋添加键]  ┃ [⇅] [{}] [⧉] ┃          ✓ 已保存      │
└──────────────────────────────────────────────────────┘
   主操作      工具组（色块背景）           状态区
```

- 「添加键」保留「图标 + 文字」，它是主操作、语义无法只靠图标传达
- 「排序 `SortAscendingOutlined`」「格式化 `AlignLeftOutlined`」「查重复 `BranchesOutlined`」三个改为 `type="text"` 纯图标按钮，包在一个带背景色的容器里做视觉分组：
  ```tsx
  <div style={{
    display: 'flex', alignItems: 'center', gap: 2,
    padding: '0 4px', borderRadius: 4,
    background: '#2d2d30',           // 比工具栏 #252526 略亮，形成色块
    border: '1px solid #3a3a3c',
  }}>
  ```
- 每个图标按钮必须有 `Tooltip`（纯图标的可发现性完全依赖它）
- 保留 32px 高度不变，纯图标化后右侧状态区（最长文案「JSON 错误」）不再被挤压

**按钮禁用与提示**：

```tsx
<Tooltip title={
  validationStatus === 'invalid'
    ? 'JSON 格式错误，请先修正后再检测'
    : '检测 Schema 中键名相同但路径不同的键'
}>
  {/* Tooltip 必须包一层 span：antd 的 Tooltip 对 disabled Button 不触发 hover 事件 */}
  <span>
    <Button
      type="text" size="small"
      icon={<BranchesOutlined />}
      disabled={validationStatus === 'invalid'}
      onClick={handleCheckDuplicates}
      style={{ color: validationStatus === 'invalid' ? '#666' : '#ccc' }}
    />
  </span>
</Tooltip>
```

> ⚠️ **实现陷阱**：`disabled` 的 Button 不派发鼠标事件，Tooltip 不包 `<span>` 就永远不显示——而需求明确要求「鼠标滑到按钮上显示提示」，这个包裹层是需求的一部分，不是可选优化。

**检测处理器**：

```tsx
const handleCheckDuplicates = useCallback(() => {
  const text = editorRef.current?.getValue() ?? '';
  const groups = findDuplicateKeys(text);
  if (groups === null) {
    message.error('JSON 解析失败，无法检测');   // 兜底：理论上被 disabled 拦住
    return;
  }
  if (groups.length === 0) {
    message.success('未发现重复键');            // 决策 9：不开 Drawer
    return;
  }
  setDuplicateGroups(groups);
  setDuplicateDrawerOpen(true);
}, []);
```

**跳转处理器**（`offset` → 行号 → 滚动 + 选中 + 临时高亮）：

```tsx
const handleJumpTo = useCallback((offset: number) => {
  const editor = editorRef.current?.getEditor();
  const model = editor?.getModel();
  if (!editor || !model) return;

  const pos = model.getPositionAt(offset);
  editor.revealLineInCenter(pos.lineNumber);
  editor.setPosition(pos);
  editor.focus();

  // 临时高亮该行 1.5s：Drawer 不遮挡左栏，用户需要视觉锚点确认落点
  const collection = editor.createDecorationsCollection([{
    range: { startLineNumber: pos.lineNumber, startColumn: 1,
             endLineNumber: pos.lineNumber, endColumn: 1 },
    options: { isWholeLine: true, className: 'dup-key-flash' },
  }]);
  setTimeout(() => collection.clear(), 1500);
}, []);
```

**行号计算的时机约定**：`offset` 在检测时刻记录，但 `getPositionAt` 在**点击跳转时**才调用。若用户在 Drawer 打开期间编辑了 Schema，`offset` 会失效（跳到错误位置）。处理方式：**Drawer 打开期间检测结果不自动刷新**，但在 Drawer 顶部显示提示条「检测结果基于点击时的内容，编辑后请重新检测」。不做自动重算——那会让列表在用户阅读时跳动。

**用 `createDecorationsCollection` 而非 `deltaDecorations`**：后者在 Monaco 0.56 已弃用。装饰器走 editor 实例方法，**不需要 `window.monaco` 命名空间**，因此不依赖 `SchemaEditor.tsx:322` 那个 try/catch 的全局抓取。

**不打 Monaco marker**：37 个节点全打 marker 会与现有 JSON 语法错误 marker（owner `'schema-editor'`，`:130-153`）抢占同一视觉通道，且重复键名在本项目是**观察结论而非错误**，不应渲染成红波浪线。

### 4.3 新增组件 `src/components/project/DuplicateKeysDrawer.tsx`

```tsx
interface DuplicateKeysDrawerProps {
  open: boolean;
  onClose: () => void;
  groups: DuplicateGroup[];
  /** 把源文本 offset 换算成 1-based 行号，由父组件注入（持有 editor ref） */
  getLineNumber: (offset: number) => number | null;
  onJumpTo: (offset: number) => void;
}
```

**Drawer 配置**：
```tsx
<Drawer
  title={`重复键检测（${groups.length} 组 / ${totalCount} 处）`}
  placement="right"
  width={520}
  open={open}
  onClose={onClose}
  mask={{ closable: true }}   // ⚠️ antd 6：maskClosable 已弃用，须用 mask 对象
/>
```

> ⚠️ 依 CLAUDE.md 约束 0：`Modal`/`Drawer` 的 `maskClosable` 自 antd 6.3.0 起弃用，必须写 `mask={{ closable: ... }}`。本项目 `antd ^6.5.0`。

**Table 结构**（决策 8 + 一键展开）：

```
┌────────────────────────────────────────────────┐
│ 重复键检测（13 组 / 37 处）              [×]   │
├────────────────────────────────────────────────┤
│ ⓘ 结果基于点击检测时的内容，编辑后请重新检测   │
├────────────────────────────────────────────────┤
│ [⊞ 展开全部]  [搜索键名______]                 │  ← Table 工具栏
├────────────────────────────────────────────────┤
│ ▸  new_key            5 处      叶子3 分组2    │
│ ▸  new_key_1          5 处      叶子5          │
│ ▾  new_key_2          5 处      叶子5          │
│      new_key_2                      L12  [跳转]│
│      new_key_30.new_key_2           L48  [跳转]│
│      …                                          │
└────────────────────────────────────────────────┘
```

- 主行列：`keyName`（等宽字体）、`count`（默认按此降序，`sorter`）、类型摘要（叶子 N / 分组 M）
- `pagination={false}` + `scroll={{ y: ... }}`：37 条不该分页，一次滚完
- **一键展开全部**：`expandable.expandedRowKeys` 受控 + 工具栏按钮在「全部展开 / 全部收起」间切换（按钮文案随状态变化），默认全部收起
- 子行：完整路径（等宽、超长 `ellipsis` + Tooltip 显示全文）、行号 `L{n}`、跳转按钮
- 顶部搜索框对 `keyName` 做前端过滤（37 组时非必需，但 Schema 增长后是刚需）
- 类型用 `Tag` 区分：`leaf` → 默认色，`branch` → `blue`。中间层键重复往往意味着**结构可合并**，这是比叶子重名更有行动价值的信号，值得视觉区分

### 4.4 修改 `src/app/projects/[id]/page.tsx`

Drawer 挂载位置：与 `ImportPreviewDialog` / `ExportSelectorDialog` 并列（`:123-125`）。

**但**：检测触发在 `SchemaEditor` 内部（需要 editor ref 拿原文和算行号）。为避免把 editor ref 提升到 page 层（会破坏现有 `forwardRef` 边界），**Drawer 状态与渲染都放在 `SchemaEditor.tsx` 内部**，作为编辑器的子节点。`SchemaEditor` 已是 `forwardRef` 组件且自持 `editorRef`，无需改动 `page.tsx`。

> 权衡说明：这让 `SchemaEditor.tsx` 变长（当前已 600+ 行，逼近 CLAUDE 规则的 800 行上限）。检测逻辑已全部外提到 `duplicate-keys.ts`，Drawer UI 外提到 `DuplicateKeysDrawer.tsx`，`SchemaEditor` 只增加约 30 行（两个 state + 两个 handler + 一个 JSX 节点），可接受。若后续继续膨胀，工具栏应整体提取为 `SchemaToolbar.tsx`。

### 4.5 依赖与配置变更

| 文件 | 变更 |
|------|------|
| `package.json` | `+ "jsonc-parser": "^3.3.1"`（dependencies，零传递依赖） |
| `src/app/globals.css` | `+ .dup-key-flash { background: rgba(255,193,7,0.25); }` 跳转闪烁高亮 |
| `vitest.config.ts` | `coverage.include` 追加 `'src/lib/duplicate-keys.ts'` |

## 5. 测试计划

新增 `src/lib/duplicate-keys.test.ts`（co-located，符合项目约定；无 `__tests__` 目录）。

**注意**：把 `duplicate-keys.ts` 加进 `vitest.config.ts` 的覆盖率白名单意味着它必须满足 **statements 99 / branches 95 / functions 100 / lines 99**——`functions: 100` 要求每个导出和内部函数都被调用，包括所有 early-return 分支。

用例清单（AAA 结构，描述性命名）：

```
collectKeyOccurrences
  ✓ 返回 null 当文本不是合法 JSON
  ✓ 返回空数组当 JSON 是空对象
  ✓ 收集顶层叶子键并标记 kind 为 leaf
  ✓ 收集中间层对象键并标记 kind 为 branch
  ✓ 空对象 {} 视为 leaf（与 flattenObject 行为一致）
  ✓ 数组值视为 leaf 且不递归进元素（项目约束 5）
  ✓ 保留字面重复键的全部出现（JSON.parse 会丢弃）
  ✓ offset 指向键名起始位置

findDuplicateKeys
  ✓ 返回空数组当无重复键名
  ✓ 按末段键名分组不同路径的同名键
  ✓ 同时纳入叶子键与中间层键
  ✓ 按 count 降序排序
  ✓ 同 count 时按键名字典序排序（保证稳定输出）
  ✓ 单次出现的键不进入结果
  ✓ 返回 null 当文本非法
  ✓ 键名含点号时不与嵌套路径混淆
```

组件层（`DuplicateKeysDrawer.tsx`）暂不加测试——项目现状是所有编辑器组件均无测试覆盖，为单个新组件破例引入 antd + Drawer 的测试环境成本与收益不匹配。逻辑正确性由纯函数测试保证。

## 6. 明确不做的事（YAGNI）

| 不做 | 原因 |
|------|------|
| 自动修复 / 重命名 / 合并 | 改键名会触发 `SchemaEditor.tsx:24-43` 的 `detectRenames` 启发式（同前缀不同末段即判为重命名），自动改名极易被误判为重命名并把译文值搬到错误的键；「合并」更会跨路径丢译文 |
| 实时检测（跟着 debounce 跑） | 需求明确为按钮触发的一次性审计。实时化需要常驻面板，与 Drawer 载体矛盾 |
| 译文编辑器侧的同类按钮 | locale 键结构由 Schema 派生（`applyLocaleSync` + 服务端 `syncSchemaChangesToLocales`），译文侧跑同一规则输出与 Schema 侧完全相同，重复出现只会让人怀疑两边算的不是一回事 |
| Monaco marker / gutter 图标 | 与现有 JSON 语法错误 marker 抢占视觉通道；且 `DEFAULT_OPTIONS` 未开 `glyphMargin` |
| 忽略清单 / 白名单 | 尚不知实际噪音水平。真实 i18n schema 中 `title`/`name`/`confirm` 合法重名是常态，但应在用户实际抱怨后再加，而非预先设计 |
| 顺手修复字面重复键的数据丢失缺陷 | AST 路线使其可被检测（`collectKeyOccurrences` 已能看见），但「检测到之后怎么处理」是独立议题。**本文档只让它可见，不改变现有静默丢弃行为** |

## 7. 遗留风险

1. **字面重复键的数据丢失路径依然存在**（§3.1）。本功能会让它首次变得可见——同一路径在结果中出现两次，即为字面重复。这可能反过来暴露既有数据问题，需要后续独立处理。
2. **Drawer 打开期间编辑导致 `offset` 失效**。已用顶部提示条缓解，未做自动重算。若实际使用中误跳频繁，再考虑「编辑后自动关闭 Drawer」或「offset 失效检测」。
3. **`SchemaEditor.tsx` 行数逼近 800 上限**。已尽量外提，后续应提取 `SchemaToolbar.tsx`。
