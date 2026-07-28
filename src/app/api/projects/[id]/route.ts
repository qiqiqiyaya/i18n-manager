import { withApiHandler } from '@/lib/api-wrapper';
import { getProjectById, updateProject, deleteProject } from '@/lib/data-layer';
import { updateProjectSchema } from '@/lib/validation';

export const GET = withApiHandler(async (_req, { params }) => {
  const project = await getProjectById(params.id);
  return project;
});

export const PUT = withApiHandler(async (req, { params }) => {
  const body = await req.json();
  const updates = updateProjectSchema.parse(body);

  const meta = await updateProject(params.id, updates);
  return { meta };
});

export const DELETE = withApiHandler(async (_req, { params }) => {
  await deleteProject(params.id);
  return { success: true };
});
