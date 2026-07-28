# 编辑器大数据量性能优化方案

> 创建日期：2026-07-02
> 最后更新：2026-07-28
> 相关组件：SchemaEditor, LocaleEditor, MonacoEditor
> 状态：已实施 — 已从 jsoneditor 迁移至 Monaco Editor

---

## 一、问题描述

Schema 编辑器（`SchemaEditor.tsx`）和译文编辑器（`LocaleEditor.tsx`）最初使用 `jsoneditor` 库的 tree 模式展示 JSON 数据。当数据量较大时（如数千个键或深层嵌套），`jsoneditor` 的 tree 模式会为每个节点创建独立 DOM 元素，导致：

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

## 二、已实施解决方案：迁移至 Monaco Editor

项目已将编辑器从 `jsoneditor` 迁移至 `@monaco-editor/react`（Monaco Editor 的 React 封装）。Monaco Editor 使用虚拟化文本渲染，仅渲染可视区域的行，从根本上解决了大数据量性能问题。

### 实施细节

- **`MonacoEditor.tsx`**：`@monaco-editor/react` 封装组件，使用 `next/dynamic` 动态导入（SSR 安全）
- **`SchemaEditor.tsx`**：左栏 Schema 编辑，Monaco JSON 模式 + RxJS 防抖解析
- **`LocaleEditor.tsx`**：右栏译文编辑，Monaco JSON 模式 + RxJS 防抖解析 + 翻译参考浮层
- **`ImportPreviewDialog.tsx`**：导入冲突预览使用 Monaco `DiffEditor` 并排对比

### Monaco Editor 配置

```typescript
const DEFAULT_OPTIONS = {
  language: 'json',
  theme: 'vs-dark',
  automaticLayout: true,
  formatOnPaste: true,
  formatOnType: false,
  readOnly: false,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  fontSize: 14,
  tabSize: 2,
  wordWrap: 'off',
  lineNumbers: 'on',
  folding: true,
  renderWhitespace: 'selection',
  bracketPairColorization: { enabled: true },
};
```

### 性能改善

- Monaco Editor 虚拟化渲染：仅渲染可视行，大数据量下无卡顿
- JSON 格式化：粘贴时自动格式化（`formatOnPaste: true`）
- 折叠支持：`folding: true`，可折叠/展开 JSON 嵌套结构
- 搜索：内置 `actions.find` 支持，支持正则、大小写敏感

---

## 三、历史方案对比（保留供参考）

### 方案 A：检测数据量，大 JSON 默认切 code 模式（原推荐）

**原理**：`jsoneditor` 的 code 模式内部使用 Ace 编辑器，对大量文本的处理性能远优于 tree 模式。

**状态**：已被 Monaco Editor 迁移替代。Monaco Editor 本身就是 code 模式编辑器，性能优于 Ace。

### 方案 B：取消 `expandAll` + 内置搜索导航

**状态**：不再适用。Monaco Editor 使用文本模式，无 DOM 节点展开问题。

### 方案 C：按顶层命名空间拆分 Tab

**状态**：可作为未来优化方向。当前 Monaco Editor 已解决性能问题，但按 namespace 拆分 Tab 仍可改善超大数据集的编辑体验。

### 方案 D：自定义虚拟滚动树（被禁止）

**状态**：仍被禁止。CLAUDE.md 规定编辑器必须使用 `@monaco-editor/react`。

### 方案 E：Schema 编辑器改为 code 模式 + 搜索

**状态**：已实施。Schema 和 Locale 编辑器均使用 Monaco Editor JSON code 模式。

---

## 四、当前架构下的进一步优化方向

### 1. 增量加载（按需加载语言文件）

当前 `useProjectEditor` 在加载项目时会请求所有语言文件。对于语言数量多的项目，可改为按需加载（仅在打开 Tab 时加载对应语言）。

### 2. Namespace Tab 拆分

对于超大 JSON（数千键），可按顶层 namespace 拆分为多个 Tab，每个 Tab 只渲染对应子树的 JSON 文本。这需要：
- 新增 `NamespaceTabs` 组件
- 编辑器内容按 namespace 过滤
- 保存时合并所有 namespace 的变更

### 3. Web Worker 解析

Monaco Editor 本身已在 Web Worker 中运行语法分析。对于自定义的 JSON 解析和 diff 计算（`SchemaEditor` 中的 `parseLogic`），可考虑移至 Web Worker 避免阻塞主线程。

---

## 五、关键设计约束

1. **编辑器强制使用 `@monaco-editor/react`**（来自 CLAUDE.md），任何方案不得替换编辑器组件
2. 旧版 `JsonEditor.tsx`（jsoneditor 封装）已弃用但保留在代码库中，可安全删除
3. 自动保存使用 RxJS 防抖，不得使用原生 `setTimeout`/`clearTimeout`
4. Schema 和 Locale 编辑器行为应保持一致（相同的防抖策略、校验逻辑、保存流程）

---

## 六、验收标准

- [x] 编辑器使用 Monaco Editor，大数据量下无卡顿
- [x] JSON 校验实时反馈（绿色/黄色/红色状态指示器）
- [x] 粘贴时自动格式化
- [x] 支持折叠/展开 JSON 结构
- [x] 导入冲突预览使用 DiffEditor 并排对比
- [x] 编辑功能和保存逻辑正常工作
- [x] RxJS 防抖替代原生 setTimeout
