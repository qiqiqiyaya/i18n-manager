import { withApiHandler } from '@/lib/api-wrapper';
import { getSchema, updateSchema } from '@/lib/data-layer';
import { schemaObjectSchema } from '@/lib/validation';

export const GET = withApiHandler(async (_req, { params }) => {
  const schema = await getSchema(params.id);
  return { schema };
});

export const PUT = withApiHandler(async (req, { params }) => {
  const body = await req.json();
  const schema = schemaObjectSchema.parse(body.schema);
  const updatedSchema = await updateSchema(params.id, schema);
  return { schema: updatedSchema };
});
