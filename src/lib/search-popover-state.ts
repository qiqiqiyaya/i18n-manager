/**
 * 项目内译文搜索弹出层的开合状态机（纯 reducer，可单测）。
 *
 * 开关：`open = hasText && !dismissed`。
 * - SET_TEXT：输入内容变化。有文字 → 打开（同时清除 dismissed，满足"继续输入重新打开"）；
 *   无文字 → 必然关闭
 * - DISMISS：关闭（鼠标移出组合区域延时结束 / Esc / 点击外部 / 焦点移出）
 * - REOPEN：重新打开（鼠标移回组合区域 / 重新聚焦），无文字时无效
 *
 * 无变化的派发返回原状态引用，供 React useReducer 跳过一次重渲染。
 */

export interface SearchPopoverState {
  /** 输入框是否有非空文字 */
  hasText: boolean;
  /** 是否已被收起（鼠标移出 / Esc / 点击外部） */
  dismissed: boolean;
}

export type SearchPopoverAction =
  | { type: 'SET_TEXT'; hasText: boolean }
  | { type: 'DISMISS' }
  | { type: 'REOPEN' };

export const initialState: SearchPopoverState = { hasText: false, dismissed: false };

export function isSearchPopoverOpen(state: SearchPopoverState): boolean {
  return state.hasText && !state.dismissed;
}

export function searchPopoverReducer(
  state: SearchPopoverState,
  action: SearchPopoverAction
): SearchPopoverState {
  switch (action.type) {
    case 'SET_TEXT':
      if (!action.hasText) return { hasText: false, dismissed: false };
      // 已有文字且未被收起 → 原样返回（输入过程不产生无谓重渲染）
      if (state.hasText && !state.dismissed) return state;
      return { hasText: true, dismissed: false };
    case 'DISMISS':
      // 无文字或已收起 → 原样返回
      if (!state.hasText || state.dismissed) return state;
      return { ...state, dismissed: true };
    case 'REOPEN':
      // 无文字或未收起 → 原样返回
      if (!state.hasText || !state.dismissed) return state;
      return { ...state, dismissed: false };
  }
}

/** mousemove 桥接可测的矩形结构（只读四边） */
export interface RectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export type SearchRegion = 'input' | 'popup' | 'outside';

/**
 * 把鼠标点归类到「输入框 / 弹出层 / 两者之外」之一（含 bridge 扩展边）。
 *
 * 语义修正（Q1-A，修复点击跳转时闪烁）：弹出层旧位置在卸载后不应触发 REOPEN，
 * 桥接里「弹出层上悬停」只负责保持展开，重开仅由输入框悬停触发 —— 本函数区分二者，
 * 由调用方决定 input/popup 各自的动作。
 *
 * 判定顺序：先输入框后弹出层（重叠时输入框优先）。
 */
export function classifySearchRegion(
  x: number,
  y: number,
  inputRect: RectLike | null,
  popupRect: RectLike | null,
  bridge = 16
): SearchRegion {
  const inside = (r: RectLike | null): boolean =>
    r != null &&
    x >= r.left - bridge && x <= r.right + bridge &&
    y >= r.top - bridge && y <= r.bottom + bridge;

  if (inside(inputRect)) return 'input';
  if (inside(popupRect)) return 'popup';
  return 'outside';
}
