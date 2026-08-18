---
title: 平台总览
category: overview
tags:
  - i18n-manager
  - 总览
  - 首页
source:
  - "[[raw/i18nManager.md]]"
  - "[[raw/CODEMAPS/INDEX.md]]"
created: 2026-08-19
updated: 2026-08-19
aliases:
  - 多语言管理平台
  - i18n Manager
  - 首页
---

# 平台总览

> 多语言管理平台（i18n Manager）—— 一个轻量级、协作式的多语言翻译管理工具。无用户系统、数据全局共享、本地 JSON 持久化，适合小型团队内部使用。

## 定位与核心能力

- **项目管理**：创建/编辑/删除/搜索项目（[[entities/项目|项目]]）。
- **多语言翻译管理**：每个项目一个主表 Schema（定义翻译键与说明）+ 多个语言文件（[[entities/Schema主表|Schema 主表]]、[[entities/语言文件|语言文件]]）。
- **可视化编辑器**：左右双栏 Monaco 编辑器，高效编辑键值对及多语言译文（[[features/编辑器|编辑器]]）。
- **自动保存**：防抖 + 哈希去重 + 增量传输，Socket.IO 直写磁盘（[[concepts/自动保存|自动保存]]）。
- **实时协作**：在线人数 + Schema 时间戳冲突检测（[[concepts/并发与冲突处理|并发与冲突处理]]）。
- **导入/导出**：JSON 导入（冲突预览 + 合并策略）、ZIP 导出（[[features/导入导出|导入导出]]）。
- **项目内译文搜索**：按译文内容跨已打开语言检索（[[features/项目内译文搜索|项目内译文搜索]]）。

## 当前状态

- **核心功能已实现并可运行**。技术栈一句话：Next.js 16（App Router, canary）+ Express 5 + Socket.IO 单进程。
- 完整启动：`npm run start:server`（`node --require ./fix-async-storage.cjs --import tsx server.ts`）。

## 权威状态入口

本 wiki 呈现的是**当前状态**。原始需求文档 `[[raw/i18nManager.md|i18nManager.md]]` 第 6 节为唯一技术权威；键级锁定已移除，矛盾统一以父仓库 `CLAUDE.md` 为准。详见 [[concepts/并发与冲突处理|并发与冲突处理]] 与 [[sources/源文档索引|源文档索引]]。

## 导航

- **实体**：[[entities/项目|项目]] · [[entities/Schema主表|Schema 主表]] · [[entities/语言文件|语言文件]]
- **概念**：[[concepts/扁平化算法|扁平化算法]] · [[concepts/并发与冲突处理|并发与冲突处理]] · [[concepts/自动保存|自动保存]] · [[concepts/约束与规范|约束与规范]]
- **架构**：[[architecture/系统架构|系统架构]] · [[architecture/技术栈|技术栈]] · [[architecture/目录结构|目录结构]] · [[architecture/RESTful-API|RESTful API]] · [[architecture/Socket.IO-协议|Socket.IO 协议]] · [[architecture/数据层|数据层]]
- **功能**：[[features/编辑器|编辑器]] · [[features/导入导出|导入导出]] · [[features/项目内译文搜索|译文搜索]] · [[features/速查面板|速查面板]] · [[features/Schema重复键检测|重复键检测]] · [[features/大数据优化|大数据优化]]
- **运维**：[[operations/运行与部署|运行与部署]] · [[operations/打包分发|打包分发]] · [[operations/贡献指南|贡献指南]]
- **故障**：[[bugs/FindWidget悬停闪烁|FindWidget 悬停闪烁]] · [[bugs/FindWidget滚动同步|FindWidget 滚动同步]]
- **来源**：[[sources/代码地图|代码地图]] · [[sources/源文档索引|源文档索引]]
- **目录**：[[index|索引]] · [[log|日志]]
