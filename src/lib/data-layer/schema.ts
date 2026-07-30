import fs from 'fs-extra';
import path from 'path';
import { SchemaObject } from '@/types/schema';
import { ErrorCode } from '@/types/api';
import { CustomError } from '../api-wrapper';
import { flattenObject, unflattenObject, emptyTranslationsFromSchema, deepMergeTemplate } from '../utils';
import { getIO } from '../socket-handler';
import { getProjectDir, atomicWriteJson, readJson } from './io';
import { updateProject, isProjectExists } from './projects';

/**
 * 获取 Schema
 */
export async function getSchema(
  projectId: string
): Promise<SchemaObject> {
  const projectDir = getProjectDir(projectId);
  const schemaPath = path.join(projectDir, 'schema.json');

  if (!(await isProjectExists(projectId))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  return readJson<SchemaObject>(schemaPath, {});
}

/**
 * 更新 Schema（直接写入嵌套对象）
 */
export async function updateSchema(
  projectId: string,
  schema: SchemaObject
): Promise<SchemaObject> {
  const projectDir = getProjectDir(projectId);
  const schemaPath = path.join(projectDir, 'schema.json');

  if (!(await isProjectExists(projectId))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  // 获取旧 Schema 以计算键差异（扁平化后比较）
  const oldSchema = await getSchema(projectId);
  const oldFlatKeys = Object.keys(flattenObject(oldSchema));
  const newFlatKeys = Object.keys(flattenObject(schema));

  const addedKeys = newFlatKeys.filter((k) => !oldFlatKeys.includes(k));
  const removedKeys = oldFlatKeys.filter((k) => !newFlatKeys.includes(k));

  // 直接写入嵌套对象
  await atomicWriteJson(schemaPath, schema);
  await updateProject(projectId, {});

  // 更新时间戳
  lastSchemaTimestamps.set(projectId, Date.now());

  // 同步键变更到所有译文
  await syncSchemaChangesToLocales(projectId, addedKeys, removedKeys);

  return schema;
}

/**
 * 增量更新 Schema（扁平化路径）
 * @param updates 新增/修改的扁平键路径 → 值映射
 * @param deletes 待删除的扁平键路径列表
 * @param clientTimestamp 客户端时间戳（可选，用于冲突检测）
 */
export async function updateSchemaIncremental(
  projectId: string,
  updates: Record<string, any>,
  deletes: string[],
  clientTimestamp?: number
): Promise<void> {
  const projectDir = getProjectDir(projectId);
  const schemaPath = path.join(projectDir, 'schema.json');

  if (!(await isProjectExists(projectId))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  // 时间戳冲突检测（仅在提供客户端时间戳时检查）
  if (typeof clientTimestamp === 'number') {
    const lastTimestamp = lastSchemaTimestamps.get(projectId) || 0;
    if (clientTimestamp < lastTimestamp) {
      throw new CustomError(
        ErrorCode.CONFLICT,
        'Schema 已被其他用户更新，请刷新后重试',
        409
      );
    }
  }

  const currentSchema = await getSchema(projectId);
  const flatSchema = flattenObject(currentSchema);

  // 确定真正新增的键（在旧 schema 中不存在的）
  const addedKeys = Object.keys(updates).filter((key) => !(key in flatSchema));

  // 应用更新
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      delete flatSchema[key];
    } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // 嵌套对象：保留原样，不调用 String()
      flatSchema[key] = value;
    } else {
      flatSchema[key] = String(value);
    }
  }

  // 应用删除
  for (const key of deletes) {
    delete flatSchema[key];
  }

  // 写回文件（还原为嵌套结构）
  await atomicWriteJson(schemaPath, unflattenObject(flatSchema));

  // 更新最后时间戳
  const nowTimestamp = Date.now();
  lastSchemaTimestamps.set(projectId, nowTimestamp);

  // 同步键变更到所有译文
  await syncSchemaChangesToLocales(projectId, addedKeys, deletes);
}

// Schema 更新时间戳（模块级，用于 HTTP API 冲突检测）
const lastSchemaTimestamps: Map<string, number> = new Map();

// ============ 内部辅助 ============

/**
 * 将 Schema 的键变更同步到该项目的所有译文文件
 * @param addedKeys 新增的扁平键路径列表
 * @param removedKeys 删除的扁平键路径列表
 */
async function syncSchemaChangesToLocales(
  projectId: string,
  addedKeys: string[],
  removedKeys: string[]
): Promise<void> {
  if (addedKeys.length === 0 && removedKeys.length === 0) return;

  const projectDir = getProjectDir(projectId);
  const localesDir = path.join(projectDir, 'locales');

  // 在循环前读取 schema，避免每语言重复 I/O
  const schemaData = await getSchema(projectId);
  const schemaTemplate = emptyTranslationsFromSchema(schemaData);

  // 获取所有语言文件
  let localeFiles: string[] = [];
  try {
    const files = await fs.readdir(localesDir);
    localeFiles = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
  } catch {
    return; // 尚无语言文件，无需同步
  }

  for (const lang of localeFiles) {
    const localePath = path.join(localesDir, `${lang}.json`);
    const current = await readJson<Record<string, any>>(localePath, {});

    if (addedKeys.length > 0 || removedKeys.length > 0) {
      const flatCurrent = flattenObject(current);

      // 新增键 → 以空字符串填充
      for (const key of addedKeys) {
        if (!(key in flatCurrent)) {
          flatCurrent[key] = '';
        }
      }

      // 删除键 → 从译文中移除
      for (const key of removedKeys) {
        delete flatCurrent[key];
      }

      // 写回文件（还原为嵌套结构）
      const unflattened = unflattenObject(flatCurrent);
      const finalTranslations = deepMergeTemplate(unflattened, schemaTemplate);

      await atomicWriteJson(localePath, finalTranslations);
    }
  }

  // 广播同步事件给该项目的所有在线客户端
  const io = getIO();
  if (io) {
    io.to(`room:project-${projectId}`).emit('locale:synced', {
      projectId,
      addedKeys,
      removedKeys,
    });

    // 同时广播 schema:updated，通知客户端 Schema 已变更
    // 从项目目录读取最新的 schema 文件
    try {
      const schemaData = await getSchema(projectId);
      io.to(`room:project-${projectId}`).emit('schema:updated', {
        projectId,
        schema: schemaData,
        addedKeys,
        removedKeys,
        timestamp: Date.now(),
        clientId: 'server',
      });
    } catch {
      // 如果读取失败，静默忽略
    }
  }
}
