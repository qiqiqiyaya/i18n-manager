import { withApiHandler } from '@/lib/api-wrapper';
import { getLocales, addLocale } from '@/lib/data-layer';
import { langSchema } from '@/lib/validation';

export const GET = withApiHandler(async (_req, { params }) => {
  const locales = await getLocales(params.id);
  return { locales };
});

export const POST = withApiHandler(async (req, { params }) => {
  const body = await req.json();
  const lang = langSchema.parse(body.lang);
  const result = await addLocale(params.id, lang);
  return result;
});
