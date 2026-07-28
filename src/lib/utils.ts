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

  // 按键名字典序排列以保证一致性
  const keys = Object.keys(obj).sort();

  for (const key of keys) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    const value = obj[key];

    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // 递归处理嵌套对象
      const nested = flattenObject(value, fullPath);
      Object.assign(result, nested);
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
