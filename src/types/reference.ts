/**
 * 「速查」浮层相关类型
 */

/**
 * 编辑器上报的查询载荷：token + 屏幕锚点。
 * 编辑器只负责上报「当前选中/光标 token 和锚点」，浮层由 page 统一挂载。
 */
export interface ReferenceTokenPayload {
  /** 查询用 token（选中文本或光标所在键路径） */
  token: string;
  /** 弹层锚点（屏幕坐标） */
  anchor: { x: number; y: number };
}
