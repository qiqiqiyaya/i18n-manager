import { NextRequest, NextResponse } from 'next/server';
import { previewImport, executeImport } from '@/lib/data-layer';
import { importStrategySchema } from '@/lib/validation';
import { CustomError } from '@/lib/api-wrapper';
import { ErrorCode, ApiResponse } from '@/types/api';

/**
 * POST /api/projects/[id]/import
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const strategy = importStrategySchema.parse(formData.get('strategy') || 'merge');
    const confirmed = formData.get('confirmed') === 'true';

    if (!file) {
      return NextResponse.json(
        { code: ErrorCode.BAD_REQUEST, message: '请上传文件', timestamp: new Date().toISOString() } as ApiResponse,
        { status: 400 }
      );
    }

    if (!file.name.endsWith('.json')) {
      return NextResponse.json(
        { code: ErrorCode.VALIDATION_ERROR, message: '仅支持 JSON 文件', timestamp: new Date().toISOString() } as ApiResponse,
        { status: 422 }
      );
    }

    const fileText = await file.text();
    let fileContent: Record<string, any>;
    try { fileContent = JSON.parse(fileText); }
    catch {
      return NextResponse.json(
        { code: ErrorCode.VALIDATION_ERROR, message: '文件内容不是合法 JSON', timestamp: new Date().toISOString() } as ApiResponse,
        { status: 422 }
      );
    }

    if (!confirmed) {
      const result = await previewImport(id, fileContent, file.name);
      return NextResponse.json(
        { code: ErrorCode.CONFLICT, message: '检测到导入冲突，请确认', data: { preview: result.preview, lang: result.lang }, timestamp: new Date().toISOString() } as ApiResponse,
        { status: 409 }
      );
    }

    const result = await executeImport(id, fileContent, file.name, strategy);
    return NextResponse.json(
      { code: ErrorCode.SUCCESS, message: 'ok', data: result, timestamp: new Date().toISOString() } as ApiResponse,
      { status: 200 }
    );
  } catch (error) {
    console.error('[API Error]', error);

    if (error instanceof CustomError) {
      return NextResponse.json(
        { code: error.code, message: error.message, timestamp: new Date().toISOString() } as ApiResponse,
        { status: error.httpStatus }
      );
    }

    const message = error instanceof Error ? error.message : '服务器内部错误';
    return NextResponse.json(
      { code: ErrorCode.INTERNAL_ERROR, message, timestamp: new Date().toISOString() } as ApiResponse,
      { status: 500 }
    );
  }
}
