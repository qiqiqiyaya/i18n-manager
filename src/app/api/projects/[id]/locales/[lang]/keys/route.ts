import { withApiHandler } from '@/lib/api-wrapper';
import { updateLocaleIncremental } from '@/lib/data-layer';

/**
 * PATCH /api/projects/[id]/locales/[lang]/keys
 * 增量更新译文（仅传输变更的扁平化键值对）
 */
export const PATCH = withApiHandler(async (req, { params }) => {
  const body = await req.json();
  const { updates = {}, deletes = [] } = body;

  await updateLocaleIncremental(params.id, params.lang, updates, deletes);

  return { success: true };
});
