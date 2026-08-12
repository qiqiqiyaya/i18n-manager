/**
 * 「速查」浮层状态机（纯 reducer，可单测）。
 *
 * 三态：hidden（不显示）⇄ expanded（完整弹层）⇄ collapsed（滚动折叠成小标记）
 * - SET_TOKEN / MISS：编辑器中指向/选中 token → 弹层或消失
 * - SCROLL：源编辑器滚动 → 折叠成屏幕固定标记（避免弹层被滚动内容拖走）
 * - HOVER_MARKER：悬停标记 → 恢复完整弹层
 * - ENTER_POPOVER：鼠标移入弹层 → 保持展开（组件借此取消 pending close 定时器）
 * - LEAVE / CLOSE：离开或显式关闭 → 彻底消失（标记一并清除）
 */

export type ReferenceMode = 'hidden' | 'expanded' | 'collapsed';

export interface ReferenceToken {
  /** 查询用 token（选中文本或光标所在键路径） */
  token: string;
  /** 弹层锚点（屏幕坐标） */
  anchor: { x: number; y: number };
  /** 来自哪个编辑器 */
  source: 'schema' | 'locale';
}

export interface ReferenceState {
  mode: ReferenceMode;
  token: ReferenceToken | null;
}

export type ReferenceAction =
  | { type: 'SET_TOKEN'; token: ReferenceToken }
  | { type: 'MISS' }
  | { type: 'SCROLL' }
  | { type: 'HOVER_MARKER' }
  | { type: 'ENTER_POPOVER' }
  | { type: 'LEAVE' }
  | { type: 'CLOSE' };

export const initialState: ReferenceState = { mode: 'hidden', token: null };

export function referenceReducer(
  state: ReferenceState,
  action: ReferenceAction
): ReferenceState {
  switch (action.type) {
    case 'SET_TOKEN':
      return { mode: 'expanded', token: action.token };
    case 'MISS':
    case 'LEAVE':
    case 'CLOSE':
      return initialState;
    case 'SCROLL':
      // 只在展开态折叠；隐藏态保持隐藏、折叠态保持折叠
      return state.mode === 'expanded'
        ? { mode: 'collapsed', token: state.token }
        : state;
    case 'HOVER_MARKER':
      // 只有从折叠态恢复为展开；隐藏态无标记可悬停
      return state.mode === 'collapsed'
        ? { mode: 'expanded', token: state.token }
        : state;
    case 'ENTER_POPOVER':
      // 保持现状；组件借此取消 pending close 定时器
      return state;
  }
  // 穷尽联合：所有 action 均已处理并返回；新增 action 类型时 TS 会在此报「不是所有代码路径都有返回值」
}
