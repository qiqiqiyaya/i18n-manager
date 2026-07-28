# 编辑器大数据量性能优化方案

> 创建日期：2026-07-02
> 相关组件：SchemaEditor, LocaleEditor, JsonEditor

---

## 一、问题描述

Schema 编辑器（`SchemaEditor.tsx`）和译文编辑器（`LocaleEditor.tsx`）均使用 `jsoneditor` 库的 tree 模式展示 JSON 数据。当数据量较大时（如数千个键或深层嵌套），`jsoneditor` 的 tree 模式会为每个节点创建独立 DOM 元素，导致：

- 页面加载卡顿
- 展开/收起操作响应慢
- 编辑时输入延迟

### 当前数据规模参考

| 指标 | 数值 |
|------|------|
| Schema 键数 | 340（扁平 `Record<string, string>`） |
| 单语言文件大小 | ~467KB |
| 根级节点数 | ~30-50（嵌套展开后约 340 叶节点） |

### 根因

`jsoneditor` tree 模式采用**全量 DOM 渲染**策略，无论节点是否可见都创建 DOM 元素，缺乏虚拟滚动机制。

---

## 二、方案对比

### 方案 A：检测数据量，大 JSON 默认切 code 模式（推荐 ✓）

**原理**：`jsoneditor` 的 code 模式内部使用 Ace 编辑器，对大量文本的处理性能远优于 tree 模式。在 `JsonEditor` 组件中添加自动检测逻辑，节点数超过阈值时默认使用 code 模式。

```tsx
// 递归统计 JSON 节点数
function countNodes(obj: any): number {
  if (!obj || typeof obj !== 'object') return 1;
  return 1 + Object.values(obj).reduce((sum, v) => sum + countNodes(v), 0);
}

// 在 JsonEditor 组件中判断
const effectiveMode = countNodes(data) > 500 ? 'code' : initialMode;
```

**优点**：
- 改动最小，仅修改 `JsonEditor.tsx`
- 用户可通过 `availableModes` 手动切回 tree
- 不违反 CLAUDE.md 的编辑器限制

**缺点**：
- code 模式没有树形结构的直观导航
- 用户对纯文本 JSON 编辑可能不熟悉

**工作量**：约 15 行代码修改

---

### 方案 B：取消 `expandAll` + 内置搜索导航

**原理**：大数据量时默认收起所有节点，减少初始渲染的 DOM 数；启用 `navigationBar` 让用户通过路径搜索导航到目标节点。

```tsx
// 根据数据量决定是否展开
expandAll={countNodes(data) < 200}

// 确保导航栏启用
navigationBar={true}
```

**优点**：
- 零侵入，只需改参数
- 用户按需展开节点，渲染压力分散

**缺点**：
- 展开大节点时仍然会卡顿
- 治标不治本

**工作量**：约 5 行代码修改

---

### 方案 C：按顶层命名空间拆分 Tab

**原理**：将 JSON 按顶层 key 拆分为多个 Tab 页，每个 Tab 只渲染对应的子树，大幅降低单次渲染的节点数。

```
[Default-Menu] [Organization] [Employee] [Setting] ...
      ↓               ↓             ↓           ↓
  只显示子树         只显示子树     只显示子树    只显示子树
```

```tsx
// 主控组件
const [activeNamespace, setActiveNamespace] = useState<string | null>(null);

// 根据选中 namespace 过滤数据
const filteredData = activeNamespace
  ? { [activeNamespace]: data[activeNamespace] }
  : data;
```

**优点**：
- 每个 Tab 数据量减少 80%+
- 操作流畅，用户体验好

**缺点**：
- 需新增 NamespaceTabs 组件
- 跨 namespace 的编辑和对比不方便
- 修改范围较大

**工作量**：约 100-150 行代码（新增组件 + 修改编辑器）

---

### 方案 D：自定义虚拟滚动树 ❌（被禁止）

**原理**：用虚拟滚动技术（如 `react-window`）替换 jsoneditor，只渲染可视区域的节点。

**被禁止原因**：CLAUDE.md 第 6 节规定：
> 编辑器必须使用 `jsoneditor`，不得用 Ant Design Table/Tree 替代

此项禁令涵盖所有编辑器替换方案，包括虚拟滚动树。

---

### 方案 E：Schema 编辑器改为 code 模式 + 搜索

**原理**：Schema 类型为 `Record<string, string>`（扁平键值对），不需要 tree 模式的结构化展示。默认使用 code 模式，配合内置搜索即可满足编辑需求。

```tsx
// SchemaEditor 默认 code 模式
<JsonEditorComponent data={schema} onChange={handleChange}
  mode="code" availableModes={['code', 'tree', 'form']} />
```

**优点**：
- 对扁平数据结构最合适
- code 模式性能最佳

**缺点**：
- 与 LocaleEditor 行为不一致

**工作量**：约 5 行代码修改

---

## 三、推荐实施路线

### 第一阶段（短期，立即实施）

**目标**：以最小改动解决当前卡顿

| 步骤 | 操作 | 涉及文件 | 工作量 |
|------|------|----------|--------|
| 1 | `JsonEditor` 添加 `countNodes` 工具函数，检测数据量 | `src/components/json-editor/JsonEditor.tsx` | +10 行 |
| 2 | 节点数 ≥ 500 时默认切 code 模式，保留切换按钮 | `src/components/json-editor/JsonEditor.tsx` | +5 行 |
| 3 | 移除 `expandAll`，或仅在节点数 < 100 时展开 | `SchemaEditor.tsx`, `LocaleEditor.tsx` | +4 行 |

**预期效果**：大 JSON 文件加载后自动进入 code 模式，秒级可用；小文件保持 tree 模式，体验不变。

### 第二阶段（中期，按需实施）

**目标**：进一步优化中大数据的编辑体验

| 步骤 | 操作 | 涉及文件 | 工作量 |
|------|------|----------|--------|
| 1 | 新增 `NamespaceTabs` 组件，拆分顶层 namespace | `src/components/project/` | ~80 行 |
| 2 | Tab 切换时按 namespace 过滤数据传给 jsoneditor | `SchemaEditor.tsx` 或 `LocaleEditor.tsx` | ~50 行 |
| 3 | 搜索栏支持全局搜（跨 namespace） | `src/components/common/SearchHighlight.tsx`（待创建） | ~60 行 |

**预期效果**：每个 Tab 只显示一个 namespace 的子树，即使总数据量上万也能流畅操作。

---

## 四、关键设计约束

1. **编辑器强制使用 `jsoneditor`**（来自 CLAUDE.md），任何方案不得替换编辑器组件
2. 保留 `availableModes` 切换能力，用户可随时在 tree / code / form 间切换
3. 自动模式切换应有明确提示，避免用户迷惑
4. Schema 和 Locale 可以有不同的默认模式（Schema 更简单，可默认 code）

---

## 五、验收标准

- [ ] 500 节点以下的 JSON 默认展示 tree 模式，操作无明显卡顿
- [ ] 500 节点以上的 JSON 默认展示 code 模式，加载 < 1 秒
- [ ] 用户可随时通过模式切换按钮回到 tree 模式
- [ ] 编辑功能和保存逻辑不受模式切换影响
- [ ] `expandAll` 仅在数据量小时启用，大数据量默认收起
