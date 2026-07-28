import fs from 'fs-extra';
import path from 'path';
import { SchemaObject } from '@/types/schema';
import { ErrorCode } from '@/types/api';
import { CustomError } from '../api-wrapper';
import { flattenObject, unflattenObject } from '../utils';
import { getProjectDir, atomicWriteJson, readJson } from './io';
import { updateProject } from './projects';
import { getSchema, updateSchema } from './schema';

// ============ 导入类型定义 ============

export interface ImportPreview {
  addedKeys: string[];
  diffKeys: Array<{ key: string; oldVal: any; newVal: any }>;
}

export interface ImportResult {
  success: boolean;
  importedLang: string;
}

// ============ 导入 ============

/**
 * 处理导入预览
 */
export async function previewImport(
  projectId: string,
  fileContent: Record<string, any>,
  fileName: string
): Promise<{
  lang: string;
  preview: ImportPreview;
}> {
  // 从文件名提取语言标识
  const lang = fileName.replace(/\.json$/i, '');
  if (!/^[a-zA-Z0-9_-]{2,20}$/.test(lang)) {
    throw new CustomError(
      ErrorCode.VALIDATION_ERROR,
      `无法从文件名 "${fileName}" 识别有效的语言标识`,
      422
    );
  }

  const projectDir = getProjectDir(projectId);
  if (!(await fs.pathExists(path.join(projectDir, 'meta.json')))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  const schema = await getSchema(projectId);
  const schemaFlat = flattenObject(schema);

  // 扁平化导入数据
  const flatImport = flattenForImport(fileContent);

  const addedKeys: string[] = [];
  const diffKeys: Array<{ key: string; oldVal: any; newVal: any }> = [];

  // 获取当前已有的译文（如果存在）
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);
  const existing = await readJson<Record<string, any>>(localePath, {});

  for (const [key, value] of Object.entries(flatImport)) {
    if (!(key in schemaFlat)) {
      addedKeys.push(key);
    } else if (key in existing && JSON.stringify(existing[key]) !== JSON.stringify(value)) {
      diffKeys.push({ key, oldVal: existing[key], newVal: value });
    } else if (!(key in existing)) {
      addedKeys.push(key);
    }
  }

  return {
    lang,
    preview: { addedKeys, diffKeys },
  };
}

/**
 * 执行导入
 */
export async function executeImport(
  projectId: string,
  fileContent: Record<string, any>,
  fileName: string,
  strategy: 'overwrite' | 'skip' | 'merge' = 'merge'
): Promise<ImportResult> {
  const lang = fileName.replace(/\.json$/i, '');
  const projectDir = getProjectDir(projectId);
  const localePath = path.join(projectDir, 'locales', `${lang}.json`);
  const existing = await readJson<Record<string, any>>(localePath, {});

  // 扁平化后合并，再还原为嵌套结构保存
  const flatExisting = flattenForImport(existing);
  const flatImport = flattenForImport(fileContent);

  let flatMerged: Record<string, any>;
  switch (strategy) {
    case 'overwrite':
      flatMerged = { ...flatExisting, ...flatImport };
      break;
    case 'skip':
      flatMerged = { ...flatImport, ...flatExisting };
      break;
    case 'merge':
    default:
      flatMerged = { ...flatExisting };
      for (const [key, value] of Object.entries(flatImport)) {
        if (!(key in flatExisting)) {
          flatMerged[key] = value;
        }
      }
      break;
  }

  // 保存为嵌套结构
  await atomicWriteJson(localePath, unflattenObject(flatMerged));

  // Schema 同步（扁平键对比，保存为嵌套结构）
  const schema = await getSchema(projectId);
  const schemaFlat = flattenObject(schema);
  const newSchemaKeys: Record<string, string> = {};
  for (const key of Object.keys(flatImport)) {
    if (!(key in schemaFlat)) {
      newSchemaKeys[key] = '';
    }
  }
  if (Object.keys(newSchemaKeys).length > 0) {
    const mergedFlat = { ...schemaFlat, ...newSchemaKeys };
    await updateSchema(projectId, unflattenObject(mergedFlat) as SchemaObject);
  }

  await updateProject(projectId, {});
  return { success: true, importedLang: lang };
}

// ============ 导出 ============

/**
 * 获取导出文件列表
 */
export async function getExportData(
  projectId: string,
  languages: string[]
): Promise<{
  files: Array<{ name: string; content: string }>;
}> {
  const projectDir = getProjectDir(projectId);

  if (!(await fs.pathExists(path.join(projectDir, 'meta.json')))) {
    throw new CustomError(ErrorCode.NOT_FOUND, '项目不存在', 404);
  }

  const files: Array<{ name: string; content: string }> = [];

  // 添加 schema.json
  const schema = await getSchema(projectId);
  files.push({
    name: 'schema.json',
    content: JSON.stringify(schema, null, 2),
  });

  // 添加选中的语言文件
  for (const lang of languages) {
    const localePath = path.join(projectDir, 'locales', `${lang}.json`);
    if (await fs.pathExists(localePath)) {
      const content = await fs.readFile(localePath, 'utf-8');
      files.push({
        name: `${lang}.json`,
        content,
      });
    }
  }

  return { files };
}

// ============ 内部辅助 ============

/**
 * 扁平化导入数据（支持嵌套结构展开）
 */
function flattenForImport(
  obj: Record<string, any>,
  prefix = ''
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = flattenForImport(value, fullPath);
      Object.assign(result, nested);
    } else if (Array.isArray(value)) {
      result[fullPath] = value;
    } else {
      result[fullPath] = value;
    }
  }

  return result;
}
