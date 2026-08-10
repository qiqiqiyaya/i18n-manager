import { parseTree, type Node, type ParseError } from 'jsonc-parser';

/**
 * Schema 重复 Key 检测
 *
 * 为什么走 AST 而不是 JSON.parse：
 * JSON.parse 对字面重复键 `{"a":1,"a":2}` 静默保留最后一个，重复键在任何代码
 * 能观察到它之前就已消失。本模块用 jsonc-parser 的 parseTree 在 token 层遍历，
 * 因此字面重复键会被全部保留，且每个键都带有源文本 offset 可供跳转定位。
 *
 * 详见 docs/schema-duplicate-key-detection.md
 */

/** 单个键节点的出现位置 */
export interface KeyOccurrence {
  /** 完整点分隔路径，如 user.profile.name */
  path: string;
  /** 键名（路径最后一段） */
  keyName: string;
  /** 该键在源文本中的字符偏移（指向键名的起始引号） */
  offset: number;
  /** 节点类型：叶子键 / 中间层对象键 */
  kind: 'leaf' | 'branch';
}

/** 一组同名键 */
export interface DuplicateGroup {
  keyName: string;
  count: number;
  occurrences: KeyOccurrence[];
}

/**
 * 判断值节点是否应视为「中间层分组」。
 * 空对象 `{}` 视为叶子——与 flattenObject（utils.ts:22-23）和
 * getLeafPaths（utils.ts:101-102）的既有行为保持一致。
 * 数组一律视为叶子——项目约束 5：flattenObject 原样保留数组作为叶子值。
 */
function isBranchValue(valueNode: Node): boolean {
  return valueNode.type === 'object' && valueNode.children!.length > 0;
}

/**
 * 深度优先遍历对象节点，把每个 property 记入 out。
 * 先记录自身再递归，保证输出为文档顺序（前序），Drawer 子行据此展示。
 *
 * 前置条件：调用方已确认 parseTree 无 errors，此时 jsonc-parser 保证
 * 每个 property 都有 children[0]（字符串键名）和 children[1]（值），
 * 因此这里不做残缺结构的防御——那些分支不可达，写了反而误导读者。
 */
function walkObject(
  objectNode: Node,
  prefix: string,
  out: KeyOccurrence[]
): void {
  for (const property of objectNode.children!) {
    // property 节点结构：children[0] = 键名节点，children[1] = 值节点
    const keyNode = property.children![0];
    const valueNode = property.children![1];

    const keyName = keyNode.value as string;
    const path = prefix ? `${prefix}.${keyName}` : keyName;
    const isBranch = isBranchValue(valueNode);

    out.push({
      path,
      keyName,
      offset: keyNode.offset,
      kind: isBranch ? 'branch' : 'leaf',
    });

    if (isBranch) {
      walkObject(valueNode, path, out);
    }
  }
}

/**
 * 从 JSON 源文本收集所有键节点（含中间层对象键）。
 * @returns null 表示文本无法解析为 JSON 对象
 */
export function collectKeyOccurrences(text: string): KeyOccurrence[] | null {
  // parseTree 是容错解析器：截断文本如 `{ "a": ` 仍会返回 object 节点，
  // 只把问题记入 errors。因此必须检查 errors 才能判定文本是否可信，
  // 否则会对着半截 JSON 出报告——违反「报告 = 屏幕内容」契约。
  //
  // allowTrailingComma 让尾逗号不计入 errors：用户编辑中途极常见，
  // 且不影响键结构的正确读取。
  const errors: ParseError[] = [];
  const root = parseTree(text, errors, { allowTrailingComma: true });

  if (errors.length > 0) return null;

  // 根必须是对象：Schema 不允许数组或原始值（对齐 validation.ts 的 schemaObjectSchema）
  if (!root || root.type !== 'object') return null;

  const occurrences: KeyOccurrence[] = [];
  walkObject(root, '', occurrences);
  return occurrences;
}

/**
 * 按键名（路径最后一段）分组，仅返回出现次数 > 1 的组。
 * 排序：count 降序，同 count 按 keyName 字典序，保证输出稳定。
 * @returns null 表示文本无法解析为 JSON 对象
 */
export function findDuplicateKeys(text: string): DuplicateGroup[] | null {
  const occurrences = collectKeyOccurrences(text);
  if (occurrences === null) return null;

  // Map 保留插入顺序，组内 occurrences 因此保持文档顺序
  const byKeyName = new Map<string, KeyOccurrence[]>();
  for (const occurrence of occurrences) {
    const bucket = byKeyName.get(occurrence.keyName);
    if (bucket) {
      bucket.push(occurrence);
    } else {
      byKeyName.set(occurrence.keyName, [occurrence]);
    }
  }

  const groups: DuplicateGroup[] = [];
  for (const [keyName, group] of byKeyName) {
    if (group.length > 1) {
      groups.push({ keyName, count: group.length, occurrences: group });
    }
  }

  // 稳定排序：先按出现次数降序（最严重的浮到顶部），同次数按键名字典序
  groups.sort((a, b) =>
    b.count - a.count || a.keyName.localeCompare(b.keyName)
  );

  return groups;
}
