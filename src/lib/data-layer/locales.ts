import fs from 'fs-extra';
import path from 'path';
import { TranslationObject } from '@/types/schema';
import { ErrorCode } from '@/types/api';
import { CustomError } from '../api-wrapper';
import { createNestedFromPaths, flattenObject, unflattenObject } from '../utils';
import { getProjectDir, atomicWriteJson, readJson } from './io';
import { updateProject, getProjectById, isProjectExists } from './projects';
import { getSchema } from './schema';

/**
 * 获取项目已添加的语言列表
 */
export async function getLocales(projectId: string): Promise<string[]> {
  const { locales } = await getProjectById(projectId);
  return locales;
}

/**
 * 添加新语言
 */
export async function addLocale(
  projectId: string,
  lang: string
): Promise<{ lang: string; translations: TranslationObject }> {
  const projectDir = getProjectDir(projectId);
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);

  if (!(await isProjectExists(projectId))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  if (await fs.pathExists(localePath)) {
    throw new CustomError(ErrorCode.CONFLICT, `语言 "${lang}" 已存在`, 409);
  }

  // 从当前 schema 的扁平键生成嵌套空译文
  const schema = await getSchema(projectId);
  const schemaKeys = Object.keys(flattenObject(schema));
  const emptyTranslations = createNestedFromPaths(schemaKeys);

  await atomicWriteJson(localePath, emptyTranslations);

  // 更新项目时间戳
  await updateProject(projectId, {});

  return { lang, translations: emptyTranslations };
}

/**
 * 获取某个语言的译文
 */
export async function getLocale(
  projectId: string,
  lang: string
): Promise<{ lang: string; translations: TranslationObject }> {
  const projectDir = getProjectDir(projectId);
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);

  if (!(await fs.pathExists(localePath))) {
    throw new CustomError(
      ErrorCode.NOT_FOUND,
      `语言 "${lang}" 文件不存在`,
      404
    );
  }

  const translations = await readJson<TranslationObject>(localePath, {});
  return { lang, translations };
}

/**
 * 更新某个语言的译文
 */
export async function updateLocale(
  projectId: string,
  lang: string,
  translations: TranslationObject
): Promise<{ lang: string; translations: TranslationObject }> {
  const projectDir = getProjectDir(projectId);
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);

  if (!(await fs.pathExists(localePath))) {
    throw new CustomError(
      ErrorCode.NOT_FOUND,
      `语言 "${lang}" 文件不存在`,
      404
    );
  }

  await atomicWriteJson(localePath, translations);

  // 更新项目时间戳
  await updateProject(projectId, {});

  return { lang, translations };
}

/**
 * 删除某个语言
 */
export async function deleteLocale(
  projectId: string,
  lang: string
): Promise<void> {
  const projectDir = getProjectDir(projectId);
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);

  if (!(await fs.pathExists(localePath))) {
    throw new CustomError(
      ErrorCode.NOT_FOUND,
      `语言 "${lang}" 文件不存在`,
      404
    );
  }

  // 检查是否最后一个语言
  const locales = await getLocales(projectId);
  if (locales.length <= 1 && locales.includes(lang)) {
    throw new CustomError(
      ErrorCode.CONFLICT,
      '至少保留一个语言，无法删除',
      409
    );
  }

  await fs.remove(localePath);

  // 更新项目时间戳
  await updateProject(projectId, {});
}

/**
 * 增量更新译文（扁平化路径）
 * @param updates 新增/修改的扁平键路径 → 值映射
 * @param deletes 待删除的扁平键路径列表
 */
export async function updateLocaleIncremental(
  projectId: string,
  lang: string,
  updates: Record<string, any>,
  deletes: string[]
): Promise<void> {
  const projectDir = getProjectDir(projectId);
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);

  if (!(await fs.pathExists(localePath))) {
    throw new CustomError(ErrorCode.NOT_FOUND, `语言 "${lang}" 文件不存在`, 404);
  }

  const current = await readJson<Record<string, any>>(localePath, {});
  const flatCurrent = flattenObject(current);

  // 应用更新
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      delete flatCurrent[key];
    } else {
      flatCurrent[key] = value;
    }
  }

  // 应用删除
  for (const key of deletes) {
    delete flatCurrent[key];
  }

  // 还原为嵌套结构并写入
  await atomicWriteJson(localePath, unflattenObject(flatCurrent));
  await updateProject(projectId, {});
}

// ============ 内部辅助 ============
