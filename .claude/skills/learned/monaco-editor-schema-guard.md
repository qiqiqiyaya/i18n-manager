---
name: monaco-editor-schema-guard
description: "Monaco 编辑器防抖编辑 + Zustand store 同步 + Schema 完整性保护的守卫策略"
user-invocable: false
origin: auto-extracted
---

# Monaco 编辑器编辑状态守卫与 Schema 完整性保护

**Extracted:** 2026-08-03
**Context:** 多语言翻译编辑器（i18n-manager），使用 Monaco Editor + Zustand + RxJS 防抖，左右分栏 Schema/译文对照

## 问题 1：isEditingRef 守卫导致语言切换冻结

**场景**：用户在译文编辑器中编辑后，`isEditingRef.current === true`。当外部 `openLocales` 变更（如 Schema 编辑触发 `applyLocaleSync` 更新了所有 locale 数据），`useEffect` 因 `isEditingRef` 守卫直接 return，显示警告但不更新编辑器。之后点击其他语言 Tab 时，因为 `isEditingRef` 仍为 `true`，语言切换也被阻止——编辑器"冻结"。

**根因**：单个 `useEffect([activeLang, openLocales])` 中 `isEditingRef` 检查挡在所有逻辑之前，无法区分"用户切换语言"和"外部数据更新"。

**修复**：拆分为两个独立的 `useEffect`：

```tsx
// Effect 1：activeLang 变化 → 无条件同步（用户切换 Tab）
useEffect(() => {
  isEditingRef.current = false;
  setSchemaChangeWarning(false);
  if (activeLang && openLocales[activeLang]) {
    const formatted = JSON.stringify(openLocales[activeLang], null, 2);
    setEditorText(formatted);
    lastSyncedRef.current = formatted;
    editorRef.current?.setValue(formatted);
  }
}, [activeLang]);

// Effect 2：openLocales 变化（同语言内）→ 保留 isEditingRef 守卫
useEffect(() => {
  if (!activeLang) return;
  if (isEditingRef.current) {
    setSchemaChangeWarning(true);
    return;
  }
  // ... 同步编辑器 ...
}, [openLocales]);
```

**核心原则**：区分"用户主动操作"（Tab 切换，无条件同步）和"外部数据变更"（同语言内，需要守卫）。

## 问题 2：译文编辑器删除 key 后不自动补回

**场景**：Schema 定义了 `key1`，用户在 zh-CN 编辑器中手动删除 `key1`，期望系统自动补回（值为空），但实际没有。

**根因**：`updateTranslation` 直接接受用户解析后的 JSON 写入 store，未经 Schema 校验。

**修复**：在 `updateTranslation` 中按 Schema sanitize + 在安全时机（blur/Ctrl+S/Tab 切换）同步回编辑器。

### Store 层（`editorStore.ts`）：

```typescript
updateTranslation: (lang, translations) =>
  set((state) => {
    const template = emptyTranslationsFromSchema(state.schema);
    const sanitized = deepMergeTemplate(translations, template);
    return {
      openLocales: { ...state.openLocales, [lang]: sanitized },
      isDirty: true,
      saveStatus: 'dirty',
    };
  }),
```

### 编辑器同步层（`LocaleEditor.tsx` handleBlur）：

```typescript
const handleBlur = useCallback(() => {
  isEditingRef.current = false;
  // 从 store 同步 sanitized 内容回编辑器
  if (activeLang && openLocales[activeLang]) {
    const sanitized = JSON.stringify(openLocales[activeLang], null, 2);
    if (sanitized !== editorTextRef.current) {
      setEditorText(sanitized);
      lastSyncedRef.current = sanitized;
      editorRef.current?.setValue(sanitized);
    }
  }
  // ... 保留原有 JSON 校验 ...
}, [activeLang, openLocales]);
```

### 设计决策：延迟同步，不打断输入

| 时机 | 行为 |
|------|------|
| 防抖 onChange → parseLogic → updateTranslation | store 已 sanitize，但**不写回 Monaco**（避免打断输入） |
| blur / Ctrl+S / 切 Tab | **写回 Monaco**（用户不在编辑，安全时机） |

## 何时使用

- Monaco 编辑器 + Zustand 外部 store 同步场景
- 需要在编辑中保护用户输入不被外部更新覆盖
- 需要对用户编辑内容做 Schema/模板约束（补回缺失 key、移除多余 key）
- `isEditingRef` 守卫模式导致 UI 卡死的排查