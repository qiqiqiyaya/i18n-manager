/**
 * Monaco 编辑器最小编辑计算
 *
 * 背景：`editor.setValue()` 会整体替换 model 的文本缓冲区，副作用是清空 undo/redo 栈、
 * 重置代码折叠状态、丢失选区。在实时协作场景下，别人每改一次值都会把本地这些状态清掉。
 *
 * 解法：改用 `editor.executeEdits()` / `model.pushEditOperations()` 施加最小编辑
 * ——它是**追加**到 undo 栈而非清空，且未触及的行保留折叠状态。
 *
 * 这里用行级公共前缀/后缀裁剪而非字符级 diff：JSON 编辑的实际变更几乎总是行内的
 * （改一个 value、增删一个键），行级粒度足够，且无需引入 diff 依赖。
 */

/** Monaco 的单个编辑操作描述（结构对齐 editor.IIdentifiedSingleEditOperation） */
export interface MinimalEdit {
  range: {
    /** 1-based 起始行号 */
    startLineNumber: number;
    /** 1-based 起始列号 */
    startColumn: number;
    /** 1-based 结束行号 */
    endLineNumber: number;
    /** 1-based 结束列号 */
    endColumn: number;
  };
  /** 替换进该范围的新文本 */
  text: string;
}

/**
 * 计算把 oldText 变成 newText 所需的最小整行范围替换
 *
 * @param oldText 编辑器当前内容
 * @param newText 目标内容
 * @returns 单个编辑操作；内容相同时返回 null（调用方应跳过操作）
 */
export function computeMinimalEdit(
  oldText: string,
  newText: string
): MinimalEdit | null {
  if (oldText === newText) return null;

  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');

  // 从头扫描公共前缀行数
  let prefix = 0;
  const maxPrefix = Math.min(oldLines.length, newLines.length);
  while (prefix < maxPrefix && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }

  // 从尾扫描公共后缀行数。
  // 关键约束：prefix + suffix 不得超过任一侧的行数，否则两个区间会重叠，
  // 算出的 range 无效（如全是重复行 'x\nx\nx' → 'x\nx\nx\nx' 的情况）。
  let suffix = 0;
  const maxSuffix = Math.min(oldLines.length - prefix, newLines.length - prefix);
  while (
    suffix < maxSuffix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }

  // 变更区间（独占上界）：oldLines 的 [start, oldEnd) 替换为 newLines 的 [start, newEnd)
  let start = prefix;
  let oldEnd = oldLines.length - suffix;
  let newEnd = newLines.length - suffix;

  // 纯插入（oldEnd === start）或纯删除（newEnd === start）时，变更区间在某一侧是空的。
  // 空区间无法表达为整行替换——整行范围必然至少覆盖一行，而换行符归属会算错。
  // 解法：把相邻的一行同时纳入两侧区间。因为该行在前缀/后缀内、两侧内容必然相同，
  // 纳入后语义不变，只是多替换了一行（代价可忽略，换来实现统一且正确）。
  if (oldEnd === start || newEnd === start) {
    if (start > 0) {
      // 向前借一行：前缀最后一行在两侧相同
      start--;
    } else {
      // 已在文档开头，向后借一行：后缀第一行在两侧相同
      oldEnd++;
      newEnd++;
    }
  }

  const lastReplacedIdx = oldEnd - 1;
  return {
    range: {
      startLineNumber: start + 1,
      startColumn: 1,
      endLineNumber: lastReplacedIdx + 1,
      endColumn: oldLines[lastReplacedIdx].length + 1,
    },
    text: newLines.slice(start, newEnd).join('\n'),
  };
}
