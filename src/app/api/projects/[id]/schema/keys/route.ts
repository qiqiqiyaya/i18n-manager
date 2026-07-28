import { withApiHandler } from '@/lib/api-wrapper';
import { updateSchemaIncremental } from '@/lib/data-layer';
import { ErrorCode } from '@/types/api';
import { CustomError } from '@/lib/api-wrapper';

/**
 * PATCH /api/projects/[id]/schema/keys
 * 增量更新 Schema（仅传输变更的扁平化键值对）
 * 可选时间戳参数，用于冲突检测
 */
export const PATCH = withApiHandler(async (req, { params }) => {
  const body = await req.json();
  const { updates = {}, deletes = [], timestamp } = body;

  // 如果提供了时间戳，进行冲突检测
  if (typeof timestamp === 'number') {
    await updateSchemaIncremental(params.id, updates, deletes, timestamp);
  } else {
    await updateSchemaIncremental(params.id, updates, deletes);
  }

  return { success: true, affectedKeys: [...Object.keys(updates), ...deletes] };
});
