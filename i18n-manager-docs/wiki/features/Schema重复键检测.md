---
title: Schema 重复键检测
category: feature
tags:
  - i18n-manager
  - Schema
  - 重复键
  - jsonc-parser
source:
  - "[[raw/schema-duplicate-key-detection.md]]"
created: 2026-08-19
updated: 2026-08-19
aliases:
  - 重复键检测
  - Duplicate Keys
  - 查重复
---

# Schema 重复键检测

> 工具栏按钮扫描 Schema 编辑器原文，找出**键名相同但路径不同**的键节点（叶子键与中间层对象键都算），右侧 Drawer 分组展示，点击跳转到对应行。

## 需求

- 判定规则：以键的**最后一个分段**为分组依据。`user.profile.name` 与 `admin.name` 的键名同为 `name` → 重复。
- 实测规模参考（78 键节点 / 54 键名）：报 13 组 / 37 节点，占全树 47%。

## 技术核心：为什么走 AST 而非 JSON.parse

`JSON.parse` 对字面重复键 `{"a":1,"a":2}` **静默保留最后一个**。全项目数据通路（SchemaEditor、LocaleEditor、Zod、flattenObject）都在 `JSON.parse` 之后拿数据，重复键在可观察前就已消失——这是一条**现存数据丢失路径**：重复键被当作"删键"经 `syncSchemaChangesToLocales` 同步到所有语言文件，译文一并删除。

走 **`jsonc-parser` AST**（`parseTree`）能保留字面重复键的全部出现，是唯一能覆盖该缺陷的路线。`jsonc-parser@3.3.1` 微软官方库、零运行时依赖、与 Monaco 同源。

## 实现

- **纯函数** `src/lib/duplicate-keys.ts`：`collectKeyOccurrences(text)`（收集键节点：path/keyName/offset/kind；空对象 `{}` 视为 leaf；数组按 leaf 不递归）+ `findDuplicateKeys(text)`（按 keyName 分组，仅返回出现 >1 的组；count 降序 + keyName 字典序，保证稳定输出）。
- **SchemaEditor**：工具栏三个操作按钮改纯图标 + 色块分区（排序 `SortAscendingOutlined` / 格式化 `AlignLeftOutlined` / 查重复 `BranchesOutlined`）；JSON 非法时按钮 `disabled` + Tooltip 说明；检测结果 `null` → `message.error`，无重复 → `message.success('未发现重复键')`（不开 Drawer）。
- **跳转**：`offset → model.getPositionAt()` → `revealLineInCenter` + `setPosition` + `createDecorationsCollection` 临时高亮 1.5s（`.dup-key-flash`）。用 `createDecorationsCollection` 而非已弃用的 `deltaDecorations`。
- **DuplicateKeysDrawer**：antd `Drawer`（`mask={{ closable: true }}`，⚠️ `maskClosable` 在 antd 6.3.0 起弃用）+ `Table` `expandable`（默认收起 + 一键展开/收起全部）+ 顶部搜索框 + 类型 Tag（leaf 默认色 / branch 蓝色，branch 重复意味着结构可合并）。
- **检测时机约定**：Drawer 打开期间不自动刷新，顶部提示条「结果基于点击时的内容，编辑后请重新检测」——避免自动重算导致列表跳动。
- **不打 Monaco marker**：与现有 JSON 语法错误 marker 抢占视觉通道；重复键名是观察结论而非错误。

## 明确不做（YAGNI）

| 不做 | 原因 |
|------|------|
| 自动修复/重命名/合并 | 改键名会触发 `detectRenames` 启发式，自动改名易误判并把译文搬到错误键 |
| 实时检测 | 需求为按钮触发的一次性审计 |
| 译文编辑器侧同类按钮 | 译文键结构由 Schema 派生，结果与 Schema 侧完全相同 |
| Monaco marker / gutter 图标 | 抢占视觉通道；未开 `glyphMargin` |
| 忽略清单/白名单 | 尚无实际噪音水平数据 |
| 顺手修复字面重复键数据丢失 | 只让它可见，不改变静默丢弃行为（独立议题） |

> [!warning] ⚠️ 文档矛盾
> `[[raw/schema-duplicate-key-detection.md|schema-duplicate-key-detection.md]]` 状态为「设计已确认，**待实现**」（2026-08-10）。
> **权威状态**：git 历史 `26e011e Schema 重复 Key 检测` 显示**已实现**。Wiki 按已实现记录。

## 遗留风险

1. 字面重复键的数据丢失路径依然存在（本功能使其首次可见）。
2. Drawer 打开期间编辑导致 `offset` 失效（提示条缓解，未自动重算）。
3. `SchemaEditor.tsx` 行数逼近 800 上限，后续应提取 `SchemaToolbar.tsx`。

## 关联

- [[entities/Schema主表|Schema 主表]] — 检测对象
- [[编辑器|编辑器]] — 挂载与跳转
- [[concepts/扁平化算法|扁平化算法]] — 叶子/路径语义
