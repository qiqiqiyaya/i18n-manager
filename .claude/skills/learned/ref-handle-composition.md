---
name: ref-handle-composition
description: "Compose a wrapped editor/child imperative handle with parent-added methods via forwardRef + useImperativeHandle"
user-invocable: false
origin: auto-extracted
---

# 组合子组件 Imperative Handle（forwardRef + useImperativeHandle 展开组合）

**Extracted:** 2026-08-02
**Context:** 包装组件（如 SchemaEditor 包装 MonacoEditor）需要向父组件同时暴露"内部子句柄的全部方法 + 自身新增方法"

## Problem
直接 `useImperativeHandle(ref, () => ({ flushSave }))` 会丢掉子句柄的方法，父组件无法同时调用 `getValue` 和 `flushSave`。用 `useRef<ChildHandle>` 只转发新增方法也一样。

## Solution
交叉类型定义句柄，`useImperativeHandle` 中展开子句柄再追加新方法：

```tsx
// 子组件句柄：getValue/setValue/focus/find/scrollToRatio...
export interface MonacoEditorHandle { /* ... */ }

// 包装组件句柄 = 子句柄全部方法 + 新增方法
export type SchemaEditorHandle = MonacoEditorHandle & { flushSave: () => void };

const SchemaEditor = forwardRef<SchemaEditorHandle, Props>(
  function SchemaEditor(props, ref) {
    const editorRef = useRef<MonacoEditorHandle>(null);

    // 新增方法（内含去重逻辑，依赖 useCallback）
    const flushSave = useCallback(() => { /* ... */ }, [deps]);

    // 关键：展开子句柄 + 追加新方法
    useImperativeHandle(ref, () => ({
      ...(editorRef.current as MonacoEditorHandle),
      flushSave,
    }), [editorRef, flushSave]);
    // editorRef.current 首次渲染为 null，父组件拿到的是转发代理，
    // 方法调用时才经 ref.current 读到最新编辑器实例
  }
);
```

关键点：
1. **Hooks 顺序**：`useImperativeHandle` 的工厂函数若引用 `flushSave`（或它依赖的 `parseLogic`），必须放在这些 `useCallback`/`useMemo` 定义**之后**。
2. **交叉类型导出**：`SchemaEditorHandle` 必须 `export`，父组件 `useRef<SchemaEditorHandle>` 才能调用新增方法。
3. **两级 ref**：父组件持 `useRef<SchemaEditorHandle>` 传给包装组件；包装组件内部再持 `useRef<MonacoEditorHandle>` 传给真正的编辑器。

## When to Use
- 包装第三方编辑器/复杂组件，需向父组件暴露"子方法 + 自定义方法"
- 父组件需要 `ref.current.flushSave()` 这类命令式触发（绕过受控 prop 流程）
- React 18 用 forwardRef；React 19 可用 ref 作为 prop，组合逻辑相同
