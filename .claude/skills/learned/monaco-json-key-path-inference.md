---
name: monaco-json-key-path-inference
description: "Infer dotted key path under a cursor in nested JSON by scanning upward for shallower-indented parent object keys"
user-invocable: false
origin: auto-extracted
---

# 嵌套 JSON 键路径推断（向上扫描缩进）

**Extracted:** 2026-08-02
**Context:** 光标位于嵌套对象叶子键上时，需要把裸键名还原为扁平化点分路径（`parent.key1`），用于键级锁定、翻译参考、增量同步

## Problem
正则 `^\s*"([^"]+)"\s*:` 只能提取当前行裸键名（`key1`），匹配不了扁平化路径（`parent.key1`）。

## Solution
从当前行向上逐行扫描，用缩进深度判断父级包裹关系：

```typescript
const inferKeyPath = useCallback((model: editor.ITextModel, lineNumber: number): string | null => {
  const currentLine = model.getLineContent(lineNumber);
  const keyMatch = currentLine.match(/^\s*"([^"]+)"\s*:/);
  if (!keyMatch) return null;

  const path: string[] = [keyMatch[1]];
  const currentIndent = (currentLine.match(/^\s*/)?.[0] ?? '').length;
  let parentIndent = currentIndent;

  // 向上扫描：缩进更浅、且开启对象包裹当前键的行才是父级
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = (line.match(/^\s*/)?.[0] ?? '').length;
    if (indent >= parentIndent) continue;  // 同层/更深不是父级（防兄弟对象误判）

    const parentMatch = line.match(/^\s*"([^"]+)"\s*:\s*\{/);
    if (parentMatch) {
      path.unshift(parentMatch[1]);
      parentIndent = indent;  // 逐级上升，只认更浅的包裹者
    }
  }

  return path.join('.');
}, []);
```

已验证边界：
- **兄弟对象不误判为父级**：`{"a": {...}, "b": {...}}` 光标在 `b` 行时，`a` 缩进与 `b` 相同，被 `indent >= parentIndent` 过滤。
- **多层嵌套**：`a.b.c` 通过逐级 `unshift` 拼出。
- **数组/非对象行**：无 `"key":` 匹配则返回 null，调用方决定隐藏参考浮层。

## When to Use
- Monaco 编辑器需把光标位置的键映射到扁平化点分路径
- 键级锁定、翻译参考浮层、增量 diff 需要"当前编辑的是哪个完整路径"
- 任何缩进式结构化文本（JSON/YAML）的父级键推断
