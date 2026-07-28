/**
 * data-layer 统一导出入口
 *
 * 模块结构：
 * - io.ts           底层文件 I/O 原语（原子写入、读取、路径工具）
 * - projects.ts     项目 CRUD（列表、搜索、创建、更新、删除）
 * - schema.ts       Schema 管理（读写、增量更新、键变更同步）
 * - locales.ts      Locale 管理（语言列表、增删改查、增量更新）
 * - import-export.ts 导入/导出（预览、执行导入、导出打包）
 */

export {
  DATA_DIR,
  getProjectDir,
  ensureProjectDir,
  atomicWriteJson,
  readJson,
} from './io';

export {
  getAllProjects,
  searchProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  isProjectExists,
} from './projects';

export {
  getSchema,
  updateSchema,
  updateSchemaIncremental,
} from './schema';

export {
  getLocales,
  addLocale,
  getLocale,
  updateLocale,
  deleteLocale,
  updateLocaleIncremental,
} from './locales';

export {
  previewImport,
  executeImport,
  getExportData,
} from './import-export';

export type {
  ImportPreview,
  ImportResult,
} from './import-export';
