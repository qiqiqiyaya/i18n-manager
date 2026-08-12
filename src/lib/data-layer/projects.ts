import fs from 'fs-extra';
import path from 'path';
import { ProjectMeta } from '@/types/project';
import { SchemaObject } from '@/types/schema';
import { ErrorCode } from '@/types/api';
import { CustomError } from '../api-wrapper';
import { DATA_DIR, getProjectDir, ensureProjectDir, atomicWriteJson, readJson } from './io';

/**
 * 获取所有项目列表
 */
export async function getAllProjects(): Promise<ProjectMeta[]> {
  const projectsDir = path.join(DATA_DIR, 'projects');
  await fs.ensureDir(projectsDir);

  const entries = await fs.readdir(projectsDir, { withFileTypes: true });
  const projects: ProjectMeta[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const metaPath = path.join(projectsDir, entry.name, 'meta.json');
      const meta = await readJson<ProjectMeta | null>(metaPath, null);
      if (meta) {
        projects.push(meta);
      }
    }
  }

  // 按更新时间降序排列
  projects.sort(
    (a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );

  return projects;
}

/**
 * 搜索项目（按标题和描述模糊匹配）
 */
export async function searchProjects(keyword: string): Promise<ProjectMeta[]> {
  const all = await getAllProjects();
  const lowerKeyword = keyword.toLowerCase();
  return all.filter(
    (p) =>
      p.title.toLowerCase().includes(lowerKeyword) ||
      (p.description && p.description.toLowerCase().includes(lowerKeyword))
  );
}

/**
 * 获取单个项目
 */
export async function getProjectById(
  projectId: string
): Promise<{
  meta: ProjectMeta;
  schema: SchemaObject;
  locales: string[];
}> {
  const projectDir = await ensureProjectDir(projectId);
  const metaPath = path.join(projectDir, 'meta.json');
  const schemaPath = path.join(projectDir, 'schema.json');
  const localesDir = path.join(projectDir, 'locales');

  const meta = await readJson<ProjectMeta | null>(metaPath, null);
  if (!meta) {
    throw new CustomError(
      ErrorCode.NOT_FOUND,
      '项目不存在',
      404
    );
  }

  const schema = await readJson<SchemaObject>(schemaPath, {});

  // 获取 locales 目录下所有 .json 文件名（不含扩展名）
  let locales: string[] = [];
  try {
    const files = await fs.readdir(localesDir);
    locales = files
      .filter((f) => f.endsWith('.json') && f !== 'meta.json' && f !== 'schema.json')
      .map((f) => f.replace(/\.json$/, ''))
      .sort();
  } catch {
    locales = [];
  }

  return { meta, schema, locales };
}

/**
 * 创建项目
 */
export async function createProject(
  title: string,
  description?: string
): Promise<ProjectMeta> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const meta: ProjectMeta = {
    id,
    title,
    description,
    createdAt: now,
    updatedAt: now,
  };

  const projectDir = getProjectDir(id);
  await fs.ensureDir(path.join(projectDir, 'locales'));

  // 写入 meta
  await atomicWriteJson(path.join(projectDir, 'meta.json'), meta);
  // 初始化空 schema
  await atomicWriteJson(path.join(projectDir, 'schema.json'), {});

  return meta;
}

/**
 * 更新项目
 */
export async function updateProject(
  projectId: string,
  updates: { title?: string; description?: string; referenceEnabled?: boolean }
): Promise<ProjectMeta> {
  const projectDir = getProjectDir(projectId);
  const metaPath = path.join(projectDir, 'meta.json');

  const existing = await readJson<ProjectMeta | null>(metaPath, null);
  if (!existing) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  const updated: ProjectMeta = {
    ...existing,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  await atomicWriteJson(metaPath, updated);
  return updated;
}

/**
 * 删除项目（递归删除整个项目目录）
 */
/**
 * 检查项目是否存在（基于 meta.json）
 */
export async function isProjectExists(projectId: string): Promise<boolean> {
  const projectDir = getProjectDir(projectId);
  return readJson<unknown>(path.join(projectDir, 'meta.json'), null).then((v) => v !== null);
}

export async function deleteProject(projectId: string): Promise<void> {
  const projectDir = getProjectDir(projectId);

  if (!(await fs.pathExists(projectDir))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  await fs.remove(projectDir);
}
