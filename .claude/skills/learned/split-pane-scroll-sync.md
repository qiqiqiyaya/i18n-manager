---
name: split-pane-scroll-sync
description: "Sync scroll between two editors of different heights using normalized ratio, rAF throttle, and dual loop-prevention flags"
user-invocable: false
origin: auto-extracted
---

# 双栏编辑器滚动同步（比例归一 + 防循环双标志）

**Extracted:** 2026-08-02
**Context:** 左右两个编辑器（如 Schema vs 译文对照）内容高度不同，需要滚动位置联动

## Problem
直接同步 `scrollTop` 像素值在两个内容高度不同的编辑器间会错位；且 A 同步 B、B 又同步 A 会产生抖动/死循环。

## Solution
用**滚动比例**（0-1）而非像素归一化，`requestAnimationFrame` 节流，双标志防循环：

**Monaco 侧**（`scrollToRatio` 暴露到句柄）：
```typescript
// 上报：rAF 节流 + 计算比例
let scrollRafId: number | null = null;
editorInstance.onDidScrollChange(() => {
  if (scrollRafId !== null) return;
  if (isSyncingScrollRef.current) return;      // 内部防循环标志
  scrollRafId = requestAnimationFrame(() => {
    scrollRafId = null;
    const scrollTop = editorInstance.getScrollTop();
    const maxScroll = Math.max(0, editorInstance.getScrollHeight() - (editorInstance.getLayoutInfo()?.height ?? 0));
    onScrollChange?.(maxScroll > 0 ? scrollTop / maxScroll : 0);
  });
});

// 接收：写入滚动位置 + 微任务重置内部标志
scrollToRatio: (ratio: number) => {
  const editor = editorRef.current;
  if (!editor) return;
  isSyncingScrollRef.current = true;
  const maxScroll = Math.max(0, editor.getScrollHeight() - (editor.getLayoutInfo()?.height ?? 0));
  editor.setScrollTop(Math.round(ratio * maxScroll));
  // 用 queueMicrotask 而非 setTimeout：在当前任务结束后立即重置，
  // 不引入可感知延迟（50ms setTimeout 会导致后续滚动事件丢失）
  queueMicrotask(() => { isSyncingScrollRef.current = false; });
}
```

**父组件侧**（双向绑定两个 ref）：
```typescript
const isScrollingRef = useRef(false);
const handleSchemaScroll = useCallback((ratio: number) => {
  if (isScrollingRef.current) return;          // 父层防循环标志
  isScrollingRef.current = true;
  localeEditorRef.current?.scrollToRatio(ratio);
  queueMicrotask(() => { isScrollingRef.current = false; });
}, []);
```

关键点：
1. **比例而非像素**：`scrollTop / (scrollHeight - clientHeight)` 归一化，兼容内容高度不同的两栏。
2. **双标志防循环**：Monaco 层 `isSyncingScrollRef`（写入时跳过上报）+ 父层 `isScrollingRef`（写入对端时跳过回读），缺一都可能抖动。
3. **rAF 节流**：`onDidScrollChange` 高频触发，用 `requestAnimationFrame` 合并到下一帧。
4. **微任务重置**：用 `queueMicrotask` 而非 `setTimeout(fn, 50)` 重置防循环标志。`setTimeout` 的 50ms 窗口会导致期间所有滚动事件丢失，产生可感知的延迟。`queueMicrotask` 在当前微任务队列完成后立即执行，`setScrollTop` 触发的 scroll 事件在同一周期内被跳过，下一帧立即可响应。

## When to Use
- 左右对照/差异编辑器需要滚动联动
- 两栏内容高度不一致（Schema vs 译文）
- 任何"组件间相互写入滚动位置"的同步场景
