/**
 * 统一 API 响应结构
 * @template T data 字段的具体类型
 */
export interface ApiResponse<T = any> {
  /** 业务状态码：0 表示成功，非 0 表示失败 */
  code: number;
  /** 提示信息，成功时为 "ok" */
  message: string;
  /** 实际载荷数据 */
  data?: T;
  /** 服务端时间戳 */
  timestamp?: string;
}

/**
 * 业务错误码枚举
 */
export enum ErrorCode {
  SUCCESS = 0,
  BAD_REQUEST = 400,
  NOT_FOUND = 404,
  CONFLICT = 409,
  INTERNAL_ERROR = 500,
  VALIDATION_ERROR = 422,
}
