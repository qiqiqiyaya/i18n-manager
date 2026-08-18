---
title: Schema 主表
category: entity
tags:
  - i18n-manager
  - Schema
  - 翻译键
source:
  - "[[raw/i18nManager.md]]"
  - "[[raw/CODEMAPS/data.md]]"
  - "[[raw/schema-duplicate-key-detection.md]]"
created: 2026-08-19
updated: 2026-08-19
aliases:
  - Schema
  - 主表
---

# Schema 主表

> 项目内全部翻译键（Key）及其说明（Description）的定义，以**嵌套 JSON 对象**存储（`schema.json`），是各语言译文的模板。

## 概述

Schema 定义"有哪些键需要翻译、每个键的含义是什么"。结构为 `Record<string, any>`：**叶子节点 = 说明字符串**，**非叶子节点 = 嵌套对象**。例如 `{ "emp": { "name": "员工姓名" } }`。每个语言文件的嵌套结构必须与 Schema 一致，叶子填实际译文（见 [[语言文件|语言文件]]）。

> [!warning] ⚠️ 文档矛盾
> `[[raw/CODEMAPS/data.md|data.md]]` 与 `[[raw/CODEMAPS/backend.md|backend.md]]` 将 Schema 记为**扁平** `Record<string, string>`（如 `"common.ok": "确定"`），且 `schemaObjectSchema` 校验为"无嵌套"。
> **权威状态**：`[[raw/i18nManager.md|i18nManager.md]]` §2.2.2 与父仓库 `CLAUDE.md` —— Schema 为**嵌套** `Record<string, any>`，支持嵌套结构。CODEMAPS 描述的是早期扁平化实现。

## 要点

- **键名唯一性校验**：添加/重命名键时自动检测是否已存在；重复则高亮提示并引导跳转至已存在键位置。
- **重命名检测**：`SchemaEditor` 用启发式算法（同前缀不同末段）判定键重命名，经 `renameMap` **迁移译文值**而非先删后增，避免译文丢失。
- **键变更传播链路**：计算 `addedKeys`/`removedKeys`/`renameMap` → 客户端 `applyLocaleSync`（openLocales）+ 服务端 `syncSchemaChangesToLocales`（磁盘全语言文件）→ 广播 `locale:synced`/`schema:updated`。
- **新语言空译文**：由 `emptyTranslationsFromSchema`/`createNestedFromPaths` 按 Schema 结构生成（叶子空串，空嵌套对象保持 `{}`）。
- **重复键检测**：Schema 中同名键（不同路径）可通过 [[features/Schema重复键检测|重复键检测]] 发现；注意 `JSON.parse` 会静默丢弃字面重复键，需走 `jsonc-parser` AST。

## 关联

- [[项目|项目]] — 所属项目（`data/projects/{id}/schema.json`）
- [[语言文件|语言文件]] — 译文模板的来源
- [[concepts/扁平化算法|扁平化算法]] — 键路径的点分表示
- [[concepts/自动保存|自动保存]] — 变更的防抖/去重/持久化
- [[features/编辑器|编辑器]] — 左栏 Schema 编辑
- [[features/Schema重复键检测|Schema 重复键检测]]
- [[architecture/数据层|数据层]] — `schema.ts` 模块
