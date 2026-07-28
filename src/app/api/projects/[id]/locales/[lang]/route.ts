import { withApiHandler } from '@/lib/api-wrapper';
import { getLocale, updateLocale, deleteLocale } from '@/lib/data-layer';

export const GET = withApiHandler(async (_req, { params }) => {
  const result = await getLocale(params.id, params.lang);
  return result;
});

export const PUT = withApiHandler(async (req, { params }) => {
  const body = await req.json();
  const result = await updateLocale(params.id, params.lang, body.translations);
  return result;
});

export const DELETE = withApiHandler(async (_req, { params }) => {
  await deleteLocale(params.id, params.lang);
  return { success: true };
});
