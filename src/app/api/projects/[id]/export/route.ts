import { NextRequest, NextResponse } from 'next/server';
import { CustomError } from '@/lib/api-wrapper';
import { getProjectById, getExportData } from '@/lib/data-layer';
import { exportLanguagesSchema } from '@/lib/validation';
import { ErrorCode } from '@/types/api';

/**
 * POST /api/projects/[id]/export
 * 导出选中语言文件为 ZIP
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id } = await params;
    await getProjectById(id);

    const body = await req.json();
    const languages = exportLanguagesSchema.parse(body.languages);
    const { files } = await getExportData(id, languages);

    // 动态导入 archiver（ESM only）
    const archiverModule = (await import('archiver')) as any;
    const archiver = archiverModule.default || archiverModule;
    const archive = archiver('zip', { zlib: { level: 9 } });

    const chunks: Buffer[] = [];
    archive.on('data', (chunk: Buffer) => chunks.push(chunk));

    return new Promise<NextResponse>((resolve, reject) => {
      archive.on('end', () => {
        const zipBuffer = Buffer.concat(chunks);
        resolve(
          new NextResponse(zipBuffer, {
            status: 200,
            headers: {
              'Content-Type': 'application/zip',
              'Content-Disposition': `attachment; filename="project-${id}-locales.zip"`,
              'Content-Length': zipBuffer.length.toString(),
            },
          })
        );
      });

      archive.on('error', (err: Error) => {
        reject(new CustomError(ErrorCode.INTERNAL_ERROR, '打包失败: ' + err.message, 500));
      });

      for (const file of files) {
        archive.append(file.content, { name: file.name });
      }

      archive.finalize();
    });
  } catch (error: any) {
    console.error('[API Export Error]', error);
    if (error instanceof CustomError) {
      return NextResponse.json(
        { code: error.code, message: error.message, timestamp: new Date().toISOString() },
        { status: error.httpStatus }
      );
    }
    const message = error instanceof Error ? error.message : '服务器内部错误';
    return NextResponse.json(
      { code: ErrorCode.INTERNAL_ERROR, message, timestamp: new Date().toISOString() },
      { status: 500 }
    );
  }
}
