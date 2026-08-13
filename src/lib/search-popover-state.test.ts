import { describe, expect, it } from 'vitest';
import {
  initialState,
  isSearchPopoverOpen,
  searchPopoverReducer,
  classifySearchRegion,
  type RectLike,
} from './search-popover-state';

/** 输入框矩形：left=10, top=10, right=210, bottom=50 */
const INPUT: RectLike = { left: 10, top: 10, right: 210, bottom: 50 };
/** 弹出层矩形：left=10, top=70, right=350, bottom=384（与输入框间隙 20px > bridge 16，间隙内点只属弹出层桥接） */
const POPUP: RectLike = { left: 10, top: 70, right: 350, bottom: 384 };

describe('searchPopoverReducer', () => {
  it('initial state is closed (no text)', () => {
    expect(initialState).toEqual({ hasText: false, dismissed: false });
    expect(isSearchPopoverOpen(initialState)).toBe(false);
  });

  it('opens when text is typed', () => {
    const state = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    expect(isSearchPopoverOpen(state)).toBe(true);
  });

  it('closes when text is cleared', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const cleared = searchPopoverReducer(open, { type: 'SET_TEXT', hasText: false });
    expect(isSearchPopoverOpen(cleared)).toBe(false);
  });

  it('dismisses after mouse leaves (close timer fired)', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const dismissed = searchPopoverReducer(open, { type: 'DISMISS' });
    expect(isSearchPopoverOpen(dismissed)).toBe(false);
  });

  it('reopens on mouse re-enter after dismiss', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const dismissed = searchPopoverReducer(open, { type: 'DISMISS' });
    const reopened = searchPopoverReducer(dismissed, { type: 'REOPEN' });
    expect(isSearchPopoverOpen(reopened)).toBe(true);
  });

  it('typing reopens after dismiss (Q2-A: 继续输入重新打开)', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const dismissed = searchPopoverReducer(open, { type: 'DISMISS' });
    const retyped = searchPopoverReducer(dismissed, { type: 'SET_TEXT', hasText: true });
    expect(isSearchPopoverOpen(retyped)).toBe(true);
  });

  it('typing more text while open returns same state (no churn)', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const again = searchPopoverReducer(open, { type: 'SET_TEXT', hasText: true });
    expect(again).toBe(open);
  });

  it('REOPEN is a no-op when no text', () => {
    const reopened = searchPopoverReducer(initialState, { type: 'REOPEN' });
    expect(reopened).toBe(initialState);
    expect(isSearchPopoverOpen(reopened)).toBe(false);
  });

  it('REOPEN is a no-op when already open', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const reopened = searchPopoverReducer(open, { type: 'REOPEN' });
    expect(reopened).toBe(open);
  });

  it('DISMISS is a no-op when no text', () => {
    const dismissed = searchPopoverReducer(initialState, { type: 'DISMISS' });
    expect(dismissed).toBe(initialState);
  });

  it('DISMISS is a no-op when already dismissed', () => {
    const open = searchPopoverReducer(initialState, { type: 'SET_TEXT', hasText: true });
    const dismissed = searchPopoverReducer(open, { type: 'DISMISS' });
    const again = searchPopoverReducer(dismissed, { type: 'DISMISS' });
    expect(again).toBe(dismissed);
  });
});

describe('classifySearchRegion', () => {
  it('returns input when point is inside input rect', () => {
    expect(classifySearchRegion(100, 30, INPUT, POPUP)).toBe('input');
  });

  it('returns popup when point is inside popup rect', () => {
    expect(classifySearchRegion(200, 200, INPUT, POPUP)).toBe('popup');
  });

  it('returns outside when point is beyond both rects', () => {
    expect(classifySearchRegion(500, 500, INPUT, POPUP)).toBe('outside');
  });

  it('treats a point in the gap between input and popup as inside bridge of popup', () => {
    // 输入框 bottom=50、弹出层 top=70，间隙 20px。点 (100,67) 距输入框 17px（>16，非 input）、距弹出层 3px（<16）→ popup
    expect(classifySearchRegion(100, 67, INPUT, POPUP)).toBe('popup');
  });

  it('treats a point within bridge of input edge as input', () => {
    // 输入框 left=10，点 (0,30) 距左缘 10px < bridge 16
    expect(classifySearchRegion(0, 30, INPUT, POPUP)).toBe('input');
  });

  it('returns outside for the popup position when popup rect is null (dismissed)', () => {
    // 关键回归：点击跳转后弹出层卸载 → 鼠标停在旧弹出层位置也不应触发重开
    expect(classifySearchRegion(200, 200, INPUT, null)).toBe('outside');
  });

  it('returns input when both rects contain the point (input wins)', () => {
    const overlappingPopup: RectLike = { left: 5, top: 5, right: 300, bottom: 100 };
    expect(classifySearchRegion(50, 30, INPUT, overlappingPopup)).toBe('input');
  });

  it('returns outside when point is outside both and beyond custom bridge', () => {
    // 点 (30,58) 距输入框 bottom=50 为 8px < 16，但自定义 bridge=5 → 在 input 之外
    expect(classifySearchRegion(30, 58, INPUT, POPUP, 5)).toBe('outside');
  });
});
