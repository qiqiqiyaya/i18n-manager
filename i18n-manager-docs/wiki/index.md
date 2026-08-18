---
title: 多语言管理平台 Wiki 索引
category: overview
tags:
  - i18n-manager
  - 索引
created: 2026-08-19
updated: 2026-08-19
aliases:
  - Wiki 索引
  - 目录
---

# 多语言管理平台 Wiki 索引

> 内容目录，随每次 ingest 更新。最后更新：2026-08-19
> 源文档 16 份 | Wiki 页面 27 个

## 平台总览

- [[overview|平台总览]] — 平台定位、能力清单、当前状态与权威状态入口

## 实体 Entities

- [[entities/项目|项目]] — 项目 CRUD、meta.json 字段与数据目录
- [[entities/Schema主表|Schema 主表]] — 翻译键定义（嵌套 JSON）；⚠️ 文档矛盾：扁平 vs 嵌套
- [[entities/语言文件|语言文件]] — 各语言译文文件、Tab 管理与最后语言保护

## 概念 Concepts

- [[concepts/扁平化算法|扁平化与还原算法]] — 点分路径、数组/空对象保留、工具函数
- [[concepts/并发与冲突处理|并发与冲突处理]] — 时间戳冲突检测 + 原子写入；⚠️ 键级锁定已移除
- [[concepts/自动保存|自动保存]] — RxJS 防抖、哈希去重、Socket.IO 持久化、saveStatus
- [[concepts/约束与规范|设计约束与编码规范]] — Monaco only、RxJS、无身份、接收端最小编辑

## 架构 Architecture

- [[architecture/系统架构|系统架构概览]] — 单进程拓扑、6 个关键架构决策、入口点
- [[architecture/技术栈|技术栈与依赖]] — 前端/后端依赖、未使用依赖、环境变量；⚠️ Node 版本矛盾
- [[architecture/目录结构|目录结构]] — 页面、组件、hooks、stores、lib、types
- [[architecture/RESTful-API|RESTful API 契约]] — ApiResponse 信封、端点表、增量接口
- [[architecture/Socket.IO-协议|Socket.IO 事件协议]] — 事件表、时间戳冲突流程、保存回执
- [[architecture/数据层|数据层]] — io/projects/schema/locales/import-export

## 功能 Features

- [[features/编辑器|编辑器]] — Monaco 双栏、封装方法集、编辑器内搜索
- [[features/导入导出|导入与导出]] — 导入预览/策略、ZIP 导出
- [[features/项目内译文搜索|项目内译文搜索]] — 译文值检索、跳转定位、弹出层状态机
- [[features/速查面板|速查面板]] — 跨引用浮层、选中触发、状态机、每项目开关
- [[features/Schema重复键检测|Schema 重复键检测]] — jsonc-parser AST、Drawer 分组、跳转
- [[features/大数据优化|大数据优化]] — jsoneditor→Monaco 迁移、未来方向

## 运维 Operations

- [[operations/运行与部署|运行与部署]] — 部署流程、健康检查、troubleshooting、回滚
- [[operations/打包分发|打包分发]] — Portable Node、Windows Service、安装程序
- [[operations/贡献指南|贡献指南]] — 环境、脚本、测试、提交规范；⚠️ 无测试运行器已过时

## 故障 Bugs

- [[bugs/FindWidget悬停闪烁|Find Widget 悬停闪烁]] — 0.56.0 上游 bug、containing block 修复
- [[bugs/FindWidget滚动同步|Find Widget 滚动同步]] — scrollHeight 变化误同步、prevScrollHeight 修复

## 来源 Sources

- [[sources/代码地图|代码地图（CODEMAPS 综述）]] — 5 份 codemap 要点；⚠️ 全量早于键锁移除
- [[sources/源文档索引|源文档索引]] — 16 份 raw 文档清单与状态

## 已知文档矛盾（汇总）

- **C1** 键级锁定已移除（2026-08-09）— CODEMAPS/CONTRIBUTING/RUNBOOK 已过时
- **C2** Node 20+（CODEMAPS/CONTRIBUTING）vs Node 22 LTS（i18nManager.md/PACKAGE.md）
- **C3** Schema 扁平（CODEMAPS）vs 嵌套（i18nManager.md/CLAUDE.md）
- **C4** flattenObject 抛错（CODEMAPS）vs 保留数组（已修复 commit `7e4e619`）
- **C5** CONTRIBUTING「无测试运行器」vs Vitest 4 已配置
- **C6** Monaco 光标恢复（CODEMAPS）vs 已移除（决策 11）
- **C7** 速查面板「待实现」（quick-inspect.md）vs git `f508a53` 已实现
- **C8** 重复键检测「待实现」（schema-duplicate-key-detection.md）vs git `26e011e` 已实现

> 每个矛盾的详细说明见对应页面 `> [!warning] ⚠️ 文档矛盾` 块；权威基准 = 父仓库 `CLAUDE.md` + `[[raw/i18nManager.md|i18nManager.md]]` §6。
