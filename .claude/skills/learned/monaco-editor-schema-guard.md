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

## 问题 3：批量加载 locale 时缺失 key 不补回

**场景**：刷新页面后 `useProjectEditor.loadProject()` 批量加载所有语言。磁盘上 `us-en.json` 缺少某些 key（用户之前没填写），但 UI 编辑器中没有显示这些缺失的 key（值为空）。

**根因**：`setOpenLocales` 是简单赋值，没有按 Schema 模板合并。而单语言打开 `openLocale` 有 `mergeTemplate` 逻辑，两者行为不一致。

**修复**：让 `setOpenLocales` 也对每个语言做 Schema 模板合并（`editorStore.ts`）：

```typescript
setOpenLocales: (locales) =>
  set((state) => {
    const template = emptyTranslationsFromSchema(state.schema);
    const sanitizedLocales: Record<string, TranslationObject> = {};
    for (const [lang, translations] of Object.entries(locales)) {
      sanitizedLocales[lang] = deepMergeTemplate(translations, template);
    }
    return { openLocales: sanitizedLocales };
  }),
```

**核心原则**：批量操作和单操作要保持一致的数据 sanitize 逻辑。

## 问题 4：useMemo 闭包中 activeLang 过期导致 flush 写入错误语言

**场景**：用户在 zh-CN 编辑器中修改值 → 立刻切到 en-US Tab → 切回来发现 zh-CN 的修改丢失。

**根因**：`parseLogic` 通过 `useMemo([activeLang, ...])` 创建，闭包捕获了 `activeLang`。React 在同一渲染周期内先用新 `activeLang` 重建了 `parseLogic`，然后 `useEffect([activeLang])` 中调用它 flush。此时 `parseLogic` 内部的 `activeLang` 已是 `'en-US'`，`updateTranslation('en-US', zhCN内容)` 把旧语言编辑内容错误写入新语言。

**修复**：flush 时不复用 `parseLogic`，直接用稳定的 `updateTranslation` + 显式 `prevLang`：

```typescript
// useEffect([activeLang]) 中切 Tab flush 逻辑
const prevLang = prevActiveLangRef.current;
if (prevLang && prevLang !== activeLang && isEditingRef.current) {
  const text = editorTextRef.current;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const currentHash = JSON.stringify(parsed);
      if (currentHash !== lastSyncedRef.current) {
        updateTranslation(prevLang, parsed);  // ← 显式传旧语言
        lastSyncedRef.current = currentHash;
        sendLocaleSave?.(prevLang, parsed);
      }
    }
  } catch { /* JSON 不合法时不 flush */ }
}
```

**核心原则**：在 effect 中需要"当前渲染周期的值"和"上一渲染周期的值"同时存在时，不能依赖 `useMemo`/`useCallback` 的闭包（它们会随依赖更新），必须用 ref 保存上一周期值，并直接调用稳定的 store 方法。同一次 effect 中 `prevLang`（ref 保存）和 `activeLang`（当前渲染）可能指向不同值，需要明确传参而非依赖闭包隐式捕获。

## 问题 5：flattenObject 的 .sort() 导致左右编辑器 key 顺序不一致

**场景**：Schema 编辑器中的 key 按用户手动输入顺序排列，但译文编辑器中的 key 按字典序排列。两侧滚动同步时 key 位置不对应。

**根因**：`flattenObject` 中 `Object.keys(obj).sort()` 对 key 进行了字典排序。`applyLocaleSync` 路径是 "flatten → 操作 → unflatten"，导致译文重建后 key 顺序变为字典序。而 Schema 侧保持用户输入顺序。

**修复**：

1. 删除 `flattenObject` 的 `.sort()`，默认保持 Schema 的 key 顺序：
```typescript
// utils.ts flattenObject
const keys = Object.keys(obj); // 去掉 .sort()
```

2. 在 `editorStore` 新增 `sortAllKeys()` 方法，用户手动触发排序：
```typescript
sortAllKeys: () =>
  set((state) => {
    const sortKeys = (obj: Record<string, any>): Record<string, any> => {
      const result: Record<string, any> = {};
      for (const key of Object.keys(obj).sort()) {
        const value = obj[key];
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          result[key] = sortKeys(value);
        } else {
          result[key] = value;
        }
      }
      return result;
    };
    const sortedSchema = sortKeys(state.schema);
    const sortedLocales: Record<string, TranslationObject> = {};
    for (const [lang, translations] of Object.entries(state.openLocales)) {
      sortedLocales[lang] = sortKeys(translations);
    }
    return { schema: sortedSchema, openLocales: sortedLocales };
  }),
```

3. Schema 编辑器工具栏加"排序"按钮，触发 `sortAllKeys()` + Socket.IO 持久化。

**核心原则**：默认以 Schema 为主导（数据源头），排序操作由用户显式触发；`flatten/unflatten` 工具函数不应改变 key 顺序。