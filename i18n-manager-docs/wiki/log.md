---
title: Wiki 变更日志
category: overview
tags:
  - i18n-manager
  - 日志
created: 2026-08-19
updated: 2026-08-19
aliases:
  - 日志
  - 变更日志
---

# 日志

> 追加式时间线。格式：`## [YYYY-MM-DD] 类型 | 标题`（可用 `grep "^## \[" log.md` 解析）。

## [2026-08-19] ingest | 16 份源文档批量入库（首次）

- 新建 27 个 wiki 页面 + index.md + log.md，覆盖全部 16 份 raw 文档（~2836 行）。
- 实体：项目 / Schema主表 / 语言文件
- 概念：扁平化算法 / 并发与冲突处理 / 自动保存 / 设计约束与编码规范
- 架构：系统架构 / 技术栈 / 目录结构 / RESTful-API / Socket.IO-协议 / 数据层
- 功能：编辑器 / 导入导出 / 项目内译文搜索 / 速查面板 / Schema重复键检测 / 大数据优化
- 运维：运行与部署 / 打包分发 / 贡献指南
- 故障：FindWidget悬停闪烁 / FindWidget滚动同步
- 来源：代码地图 / 源文档索引
- 标记文档矛盾（详见各页面 ⚠️ 块，权威=父仓库 CLAUDE.md + i18nManager.md §6）：
  - 键级锁定已移除（2026-08-09）；CODEMAPS/CONTRIBUTING/RUNBOOK 仍描述锁与 LOCK_TIMEOUT
  - Node 20+（CODEMAPS/CONTRIBUTING）vs Node 22 LTS（i18nManager.md/PACKAGE.md）
  - Schema 扁平（CODEMAPS）vs 嵌套（i18nManager.md/CLAUDE.md）
  - flattenObject 抛错（CODEMAPS）vs 保留数组（已修复 commit 7e4e619）
  - CONTRIBUTING「未配置测试运行器」vs Vitest 4（7 文件/172 测试）已配置
  - quick-inspect.md / schema-duplicate-key-detection.md 标「待实现」vs git 历史已实现（f508a53 / 26e011e）
- 状态：已通过 lint 校验（wikilink 完整性 / 源文档覆盖 / index 覆盖 / log 可解析）。
