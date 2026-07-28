import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ApiResponse, ErrorCode } from '@/types/api';

export type ApiHandler<T = any> = (
  req: Request,
  context: { params: Record<string, string> }
) => Promise<T>;

/**
 * 自定义业务错误
 */
export class CustomError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public httpStatus: number = 400
  ) {
    super(message);
    Object.setPrototypeOf(this, CustomError.prototype);
  }
}

/**
 * 统一 API 封装 HOF
 * 自动处理异常，统一响应格式
 *
 * 注意：流式响应接口（如导出 ZIP）不应使用此封装
 */
export function withApiHandler<T>(
  handler: ApiHandler<T>
): (
  req: Request,
  context: { params: Promise<Record<string, string>> }
) => Promise<NextResponse> {
  return async (req, context): Promise<NextResponse> => {
    try {
      const params = await context.params;
      const data = await handler(req, { params });
      const responseBody: ApiResponse<T> = {
        code: ErrorCode.SUCCESS,
        message: 'ok',
        data,
        timestamp: new Date().toISOString(),
      };
      return NextResponse.json(responseBody, { status: 200 });
    } catch (error) {
      console.error('[API Error]', error);

      if (error instanceof ZodError) {
        const message = `参数校验失败: ${error.message}`;
        return NextResponse.json(
          { code: ErrorCode.VALIDATION_ERROR, message, timestamp: new Date().toISOString() } as ApiResponse,
          { status: 422 }
        );
      }

      if (error instanceof CustomError) {
        return NextResponse.json(
          { code: error.code, message: error.message, timestamp: new Date().toISOString() } as ApiResponse,
          { status: error.httpStatus }
        );
      }

      const message = error instanceof Error ? error.message : '服务器内部错误，请稍后重试';
      return NextResponse.json(
        { code: ErrorCode.INTERNAL_ERROR, message, timestamp: new Date().toISOString() } as ApiResponse,
        { status: 500 }
      );
    }
  };
}
