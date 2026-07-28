import { withApiHandler } from '@/lib/api-wrapper';
import { getAllProjects, searchProjects, createProject } from '@/lib/data-layer';
import { createProjectSchema } from '@/lib/validation';

/**
 * GET /api/projects?keyword=
 * 获取项目列表（支持模糊搜索）
 */
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const keyword = searchParams.get('keyword');

  if (keyword) {
    const list = await searchProjects(keyword);
    return { list };
  }

  const list = await getAllProjects();
  return { list };
});

/**
 * POST /api/projects
 * 创建项目
 */
export const POST = withApiHandler(async (req) => {
  const body = await req.json();
  const { title, description } = createProjectSchema.parse(body);
  const project = await createProject(title, description);
  return project;
});
