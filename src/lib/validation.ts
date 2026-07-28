import { z } from 'zod';

/**
 * 项目标题：1~50 字符
 */
export const projectTitleSchema = z
  .string()
  .min(1, '标题不能为空')
  .max(50, '标题不能超过 50 个字符');

/**
 * 项目描述：最大 200 字符
 */
export const projectDescriptionSchema = z
  .string()
  .max(200, '描述不能超过 200 个字符')
  .optional();

/**
 * 创建项目输入
 */
export const createProjectSchema = z.object({
  title: projectTitleSchema,
  description: projectDescriptionSchema,
});

/**
 * 更新项目输入
 */
export const updateProjectSchema = z.object({
  title: projectTitleSchema.optional(),
  description: projectDescriptionSchema,
});

/**
 * 语言标识格式
 */
export const langSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, '语言标识只能包含字母、数字、下划线和连字符')
  .min(2, '语言标识至少 2 个字符')
  .max(20, '语言标识不能超过 20 个字符');

/**
 * Schema 对象校验：必须为 Record<string, string>，不能包含嵌套对象
 */
export const schemaObjectSchema: z.ZodType<Record<string, string>> = z
  .record(z.string(), z.string())
  .refine(
    (obj) => {
      // 确保所有值都是字符串（不包含嵌套对象）
      return Object.values(obj).every((v) => typeof v === 'string');
    },
    { message: 'Schema 值必须为字符串，不支持嵌套结构' }
  );

/**
 * 译文对象校验：必须为合法 JSON 对象
 */
export const translationObjectSchema: z.ZodType<Record<string, any>> = z
  .record(z.string(), z.any());

/**
 * 导入策略
 */
export const importStrategySchema = z
  .enum(['overwrite', 'skip', 'merge'])
  .default('merge');

/**
 * 导出语言列表
 */
export const exportLanguagesSchema = z
  .array(z.string())
  .min(1, '至少选择一个语言');

/**
 * 搜索关键字
 */
export const searchKeywordSchema = z.string().max(100).optional();
