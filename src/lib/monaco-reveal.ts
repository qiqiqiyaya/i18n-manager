/**
 * Monaco 键行定位纯函数。
 *
 * 只依赖 model.getLineContent（结构化最小接口），不 import monaco——
 * 既便于用轻量桩单测，也避免在纯逻辑模块里引入重型依赖。
 * Monaco 的 editor.ITextModel 天然满足 LineModel 结构。
 */

export interface LineModel {
  getLineContent: (lineNumber: number) => string;
  getLineCount: () => number;
}

/**
 * 从某行反推该键的完整点分路径（支持嵌套结构）。
 * 向上扫描以更浅缩进开启对象且包裹当前键的父级，拼出点分路径。
 * 例：{"a": {"b": "x"}} 光标在 "b" 行 → 返回 "a.b"。
 * 非键行（`{`、`}`、数组元素等）返回 null。
 */
export function inferKeyPath(model: LineModel, lineNumber: number): string | null {
  const currentLine = model.getLineContent(lineNumber);
  const keyMatch = currentLine.match(/^\s*"([^"]+)"\s*:/);
  if (!keyMatch) return null;

  const path: string[] = [keyMatch[1]];
  const currentIndent = (currentLine.match(/^\s*/)?.[0] ?? '').length;
  let parentIndent = currentIndent;

  // 向上扫描寻找父级键（缩进更浅、且开启对象包裹当前键）
  for (let i = lineNumber - 1; i >= 1; i--) {
    const line = model.getLineContent(i);
    const trimmed = line.trim();
    if (!trimmed) continue;

    const indent = (line.match(/^\s*/)?.[0] ?? '').length;
    if (indent >= parentIndent) continue;

    const parentMatch = line.match(/^\s*"([^"]+)"\s*:\s*\{/);
    if (parentMatch) {
      path.unshift(parentMatch[1]);
      parentIndent = indent;
    }
  }

  return path.join('.');
}

/**
 * 定位指定点分键路径在 model 中的行号。
 * 同名末段键靠完整路径消歧；文件内存在重复键时返回第一个匹配行。
 * 找不到返回 null。
 */
export function findKeyLine(model: LineModel, keyPath: string): number | null {
  const lastLine = model.getLineCount();
  for (let line = 1; line <= lastLine; line++) {
    if (inferKeyPath(model, line) === keyPath) return line;
  }
  return null;
}

/**
 * 计算 Monaco 编辑器中某个位置（光标/选中起点）的屏幕锚点。
 * 只依赖 getDomNode + getScrolledVisiblePosition（结构化最小接口），不 import monaco。
 */
export interface AnchorEditor {
  getDomNode: () => HTMLElement | null;
  getScrolledVisiblePosition: (position: { lineNumber: number; column: number }) => {
    top: number;
    left: number;
    height: number;
    width?: number;
  } | null;
}

export function computeEditorAnchor(
  editor: AnchorEditor,
  position: { lineNumber: number; column: number }
): { x: number; y: number } {
  const node = editor.getDomNode();
  if (!node) return { x: 0, y: 0 };
  const rect = node.getBoundingClientRect();
  const sp = editor.getScrolledVisiblePosition(position);
  if (!sp) return { x: rect.left, y: rect.top };
  return { x: rect.left + sp.left, y: rect.top + sp.top + (sp.height || 14) };
}
