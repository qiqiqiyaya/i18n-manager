# Find Widget 触发错误滚动同步 —— 根因分析与修复记录

> 状态：已修复（2026-08-11）
> 涉及：`src/components/json-editor/MonacoEditor.tsx` `onDidScrollChange` 处理器

## 1. 现象

初次进入多语言编辑器页面，在主表 Schema 编辑器按 `Ctrl+F` 弹出查找框后，**右侧译文编辑器自动向下滚动**；按 `Escape` 关闭查找框后，**右侧译文编辑器又向上滚动回原位**。

## 2. 根因

### 2.1 滚动同步机制

项目实现了左右编辑器双向滚动同步（`page.tsx:44-60`）：

- Schema 编辑器 `onDidScrollChange` → 计算滚动比例 `ratio` → `handleSchemaScroll` → 调用 `localeEditorRef.scrollToRatio(ratio)`
- Locale 编辑器 `onDidScrollChange` → `handleLocaleScroll` → 调用 `schemaEditorRef.scrollToRatio(ratio)`
- `isScrollingRef` 防止反馈循环（Schema→Locale→Schema→…）

### 2.2 触发条件

Monaco 的 `onDidScrollChange` 事件在**任何滚动位置变化时**都会触发，包括：

1. **用户滚动**（鼠标滚轮/触控板）—— `scrollTop` 变化，`scrollHeight` 不变
2. **布局变化**（如 find widget 出现/消失）—— `scrollHeight` 变化，可能伴随 `scrollTop` 微调

实测数据（`getScrollHeight()` + `getScrollTop()`）：

| 时机 | Schema scrollTop | Schema scrollHeight | Locale scrollTop |
|------|-----------------|--------------------|-------------------|
| 编辑器已滚动到某位置 | 500 | 1596 | ~534 |
| **Ctrl+F 打开查找框** | **533** | **1629**（+33px） | **548**（同步到右栏） |
| Escape 关闭查找框 | **500** | **1596**（-33px） | **534**（同步回原位） |

查找框出现时，编辑器的 `scrollHeight` 增加了 33px（查找框占用了编辑器顶部 34px 的空间），`onDidScrollChange` 事件触发，滚动比例从 `500/837` 变为 `533/870`，新比例被同步到右栏。关闭查找框后 `scrollHeight` 恢复，再次触发同步，右栏跳回原位。

### 2.3 关键区分

- **用户滚动**：`scrollTop` 变化，`scrollHeight` **不变** → 应当同步
- **查找框出现/消失**：`scrollHeight` 变化（+33px/-33px）→ 不应同步
- **内容编辑**：`scrollHeight` 变化，`scrollTop` 可能不变 → 不应同步
- **初始加载**：`scrollHeight` 从 0 变化 → 不应同步

## 3. 修复方案

在 `MonacoEditor.tsx` 的 `onDidScrollChange` 处理器中，新增 `prevScrollHeight` 闭包变量，当 `scrollHeight` 变化时跳过滚动同步：

```tsx
// 修复前
editorInstance.onDidScrollChange(() => {
    // ... rAF throttle ...
    const scrollTop = editorInstance.getScrollTop();
    const scrollHeight = editorInstance.getScrollHeight();
    const clientHeight = editorInstance.getLayoutInfo()?.height ?? 0;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    onScrollChange?.(ratio);
});

// 修复后
let prevScrollHeight = 0;
editorInstance.onDidScrollChange(() => {
    // ... rAF throttle ...
    const scrollTop = editorInstance.getScrollTop();
    const scrollHeight = editorInstance.getScrollHeight();
    // 当 scrollHeight 变化时（如 find widget 打开/关闭导致布局变化），
    // 跳过滚动同步——这是布局变化而非用户滚动
    if (scrollHeight !== prevScrollHeight) {
        prevScrollHeight = scrollHeight;
        return;
    }
    const clientHeight = editorInstance.getLayoutInfo()?.height ?? 0;
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    const ratio = maxScroll > 0 ? scrollTop / maxScroll : 0;
    onScrollChange?.(ratio);
});
```

## 4. 改动文件

| 文件 | 动作 | 行数 |
|------|------|------|
| `src/components/json-editor/MonacoEditor.tsx` | UPDATE | `:93-105` - 加 3 行（`prevScrollHeight` + 判断 + 更新） |

## 5. 验证

- **修复前**：Ctrl+F → 右栏跳动；Escape → 右栏跳回
- **修复后**：Ctrl+F / Escape → 右栏不动；正常滚动 → 双向同步仍正常
- `npx tsc --noEmit && npm test`

## 6. 边界情况

| 场景 | scrollHeight 变化 | 行为 |
|------|------------------|------|
| 用户滚动鼠标滚轮 | 不变 | 正常同步 ✅ |
| 查找框出现/消失 | 变化（+33/-33px） | 跳过同步 ✅ |
| 编辑 JSON 内容（换行/删除行） | 变化 | 跳过同步（该次不触发，下次用户滚动正常同步） ✅ |
| 初始加载 | 0 → 实际高度 | 跳过同步（ratio=0 的归零操作，跳过无害） ✅ |