/**
 * 将嵌套对象扁平化为点分隔的单层对象
 * 如 { emp: { name: "姓名" } } → { "emp.name": "姓名" }
 * 不支持数组，遇到数组将抛出错误
 */
export function flattenObject(
  obj: Record<string, any>,
  prefix = ''
): Record<string, any> {
  const result: Record<string, any> = {};

  const keys = Object.keys(obj);

  for (const key of keys) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // 递归处理嵌套对象
      const nested = flattenObject(value, fullPath);
      // 空嵌套对象也保留为叶子："yiku": {} → "yiku": ""
      if (Object.keys(nested).length === 0) {
        result[fullPath] = '';
      } else {
        Object.assign(result, nested);
      }
    } else if (Array.isArray(value)) {
      throw new Error(`不支持数组类型: ${fullPath}`);
    } else {
      result[fullPath] = value;
    }
  }

  return result;
}

/**
 * 将扁平化的点分隔对象还原为嵌套对象
 * 如 { "emp.name": "张三", "emp.age": 30 } → { emp: { name: "张三", age: 30 } }
 * 若路径冲突，以最深层级为准并记录警告
 */
export function unflattenObject(
  flat: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [path, value] of Object.entries(flat)) {
    setNestedValue(result, path, value);
  }

  return result;
}

/**
 * 在嵌套对象中按点分隔路径设置值（会修改原对象）
 */
export function setNestedValue(
  obj: Record<string, any>,
  path: string,
  value: any
): void {
  const parts = path.split('.');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current)) {
      current[part] = {};
    } else if (typeof current[part] !== 'object' || current[part] === null || Array.isArray(current[part])) {
      // 路径冲突，覆盖为对象
      console.warn(`[utils] 路径冲突: ${parts.slice(0, i + 1).join('.')} 将被覆盖为对象`);
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * 检测键是否在扁平对象中已存在（用于重命名检测）
 */
export function keyExists(flattened: Record<string, any>, key: string): boolean {
  return key in flattened;
}

/**
 * 获取嵌套对象的所有叶子路径（点分隔）
 */
export function getLeafPaths(
  obj: Record<string, any>,
  prefix = ''
): string[] {
  const paths: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      const nested = getLeafPaths(value, path);
      // 空嵌套对象也视为叶子（与 flattenObject 行为一致）
      if (nested.length === 0) {
        paths.push(path);
      } else {
        paths.push(...nested);
      }
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * 根据叶子路径数组重建嵌套对象
 * 如 ["a.b", "a.c"] → { a: { b: '', c: '' } }
 * 所有叶子值设为空字符串
 */
export function createNestedFromPaths(paths: string[]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const path of paths) {
    setNestedValue(result, path, '');
  }
  return result;
}

/**
 * 递归对比两个嵌套对象，找出 oldObj 中缺失的叶子路径
 * 如 old: { a: { b: '' } }, new: { a: { b: '', c: '' } } → ["a.c"]
 */
export function findMissingPaths(
  oldObj: Record<string, any>,
  newObj: Record<string, any>,
  prefix = ''
): string[] {
  const missing: string[] = [];
  for (const [key, value] of Object.entries(newObj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!(key in oldObj)) {
      // 整个子树都是新的
      if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        missing.push(...getLeafPaths(value, path));
      } else {
        missing.push(path);
      }
    } else if (
      value !== null && typeof value === 'object' && !Array.isArray(value) &&
      oldObj[key] !== null && typeof oldObj[key] === 'object' && !Array.isArray(oldObj[key])
    ) {
      missing.push(...findMissingPaths(oldObj[key], value, path));
    }
  }
  return missing;
}

/**
 * 根据 schema 结构生成空翻译对象（递归）
 * schema: { a: { b: "desc" } } → { a: { b: "" } }
 */
export function emptyTranslationsFromSchema(
  schema: Record<string, any>
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = emptyTranslationsFromSchema(value);
    } else {
      result[key] = '';
    }
  }
  return result;
}

/**
 * 检测点分隔路径是否在嵌套对象中存在
 * 如 hasNestedPath({ a: { b: '' } }, "a.b") → true
 */
export function hasNestedPath(
  obj: Record<string, any>,
  path: string
): boolean {
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object' || Array.isArray(current)) {
      return false;
    }
    if (!(part in current)) return false;
    current = current[part];
  }
  return true;
}

/**
 * 深拷贝对象
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 递归深度合并：source（模板）覆盖 target，保留 target 已有值
 * 当 source 有嵌套对象但 target 是基本类型时，用 source 结构覆盖
 * 用于确保空嵌套对象的译文保持为 {} 而非 ""
 */
export function deepMergeTemplate(
  target: Record<string, any>,
  source: Record<string, any>
): Record<string, any> {
  const result = deepClone(target);
  for (const [key, value] of Object.entries(source)) {
    if (!(key in result)) {
      result[key] = deepClone(value);
    } else if (
      value !== null && typeof value === 'object' && !Array.isArray(value)
    ) {
      if (result[key] !== null && typeof result[key] === 'object' && !Array.isArray(result[key])) {
        result[key] = deepMergeTemplate(result[key], value);
      } else {
        result[key] = deepClone(value);
      }
    }
  }
  return result;
}

/**
 * 根据光标位置确定要插入键的目标嵌套路径
 * 逐行扫描 JSON 文本，追踪大括号深度和当前键路径
 * @param text - JSON 文本内容
 * @param cursorLine - 光标所在行号（0-based）
 * @returns 目标对象的嵌套路径（空数组表示根级别）
 */
export function determineInsertionPath(
  text: string,
  cursorLine: number
): string[] {
  const lines = text.split('\n');
  const path: string[] = [];

  for (let i = 0; i <= cursorLine && i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // 检查 "key": { 模式——打开新对象的键
    const keyOpenMatch = trimmed.match(/"([^"]+)"\s*:\s*\{/);
    const closes = (trimmed.match(/\}/g) || []).length;

    if (i < cursorLine) {
      // 光标前的行：正常追踪路径
      if (keyOpenMatch) {
        path.push(keyOpenMatch[1]);
      }
      // 处理闭合大括号（减去已由 keyOpenMatch 处理的 `{`）
      for (let j = 0; j < closes - (keyOpenMatch ? 1 : 0); j++) {
        if (path.length > 0) path.pop();
      }
    } else {
      // 光标所在行：根据上下文决定插入位置

      // 情况 1: 行有 "key": { → 插入到该对象内部
      if (keyOpenMatch) {
        path.push(keyOpenMatch[1]);
        return path;
      }

      // 情况 2: 行有 }（闭合括号）→ 插入到被关闭的对象内部（path 即该对象）
      if (closes > 0) {
        return [...path];
      }

      // 情况 3: 行有 key-value 对 → 插入到当前层级
      const keyMatch = trimmed.match(/"([^"]+)"\s*:/);
      if (keyMatch) {
        return [...path];
      }

      // 情况 4: 默认 → 插入到当前层级
      return [...path];
    }
  }

  return [];
}

/**
 * 插入编辑描述：标记是在行首还是行尾插入
 */
export type InsertEditDescriptor = {
  /** true = 在行首插入，false = 在行尾插入 */
  insertAtStart: boolean;
  /** 可选的精确列号（1-based），指定后忽略 insertAtStart */
  column?: number;
  /** 要插入的文本内容 */
  text: string;
};

/**
 * 根据光标所在行内容构建 Monaco 编辑操作描述
 * @param cursorLine - 光标所在行的完整文本
 * @param indent - 该行的缩进字符串
 * @param key - 新生成的 key 名称
 * @returns 编辑描述
 */
export function buildInsertEdit(
  cursorLine: string,
  indent: string,
  key: string,
  targetHasKeys: boolean = false
): InsertEditDescriptor {
  const trimmed = cursorLine.trim();

  // 情况 0: 行包含空内联对象 `{}`（如 `"key": {},`）→ 在 { 和 } 之间插入
  if (trimmed.match(/\{\s*\}/)) {
    const bracePos = cursorLine.indexOf('{');
    return {
      insertAtStart: false,
      column: bracePos + 2,
      text: `\n${indent}  "${key}": ""`,
    };
  }

  // 情况 1: 光标在 { 上 → 在 { 之后插入（缩进 +2）
  // 如果目标对象已有 key，新 key 需要尾逗号
  if (trimmed.endsWith('{') || trimmed === '{') {
    const comma = targetHasKeys ? ',' : '';
    return {
      insertAtStart: false,
      text: `\n${indent}  "${key}": ""${comma}`,
    };
  }

  // 情况 2: 光标在 } 或 }, 上 → 在上一行行尾插入（加逗号 + 新行 + 新 key）
  // key 缩进比 } 多 2，因为 key 在对象内部
  if (trimmed === '}' || trimmed === '},') {
    return {
      insertAtStart: true,
      text: `,\n${indent}  "${key}": ""`,
    };
  }

  // 情况 3: 光标在逗号行 → 在行尾插入（带尾逗号，因为后面还有条目）
  if (trimmed.endsWith(',')) {
    return {
      insertAtStart: false,
      text: `\n${indent}"${key}": "",`,
    };
  }

  // 情况 4: 默认（key-value 行）→ 行尾加逗号，插入新行
  return {
    insertAtStart: false,
    text: `,\n${indent}"${key}": ""`,
  };
}
