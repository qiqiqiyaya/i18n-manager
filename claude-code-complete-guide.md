# Claude Code 完整使用指南

> **最后更新**：2026-08-06

---

## 🎯 在 Agent 面板中切换与操作

Agent 面板是 Claude Code 的集成开发界面，提供可视化的代理管理和切换功能。

### 打开 Agent 面板

| 平台 | 快捷键 |
|------|--------|
| macOS | `Cmd + Shift + A` |
| Windows / Linux | `Ctrl + Shift + A` |

或通过 VS Code 命令面板（`Cmd/Ctrl + Shift + P`）搜索 `Claude: Open Agent Panel`。

### 面板布局

Agent 面板分为三个主要区域：

```
┌─────────────────────────────────────────────────┐
│  ① 代理列表          │  ② 对话/输出区域           │
│                      │                           │
│  ┌────────────────┐  │  ┌─────────────────────┐  │
│  │ planner        │  │  │                     │  │
│  │ architect      │  │  │  当前代理的对话      │  │
│  │ code-reviewer  │  │  │                     │  │
│  │ tdd-guide      │  │  │                     │  │
│  │ build-error... │  │  │                     │  │
│  │ react-reviewer │  │  │                     │  │
│  │ ...            │  │  │                     │  │
│  └────────────────┘  │  └─────────────────────┘  │
│                      │                           │
│  ③ 输入栏 (底部)      │                           │
└─────────────────────────────────────────────────┘
```

### 切换代理

**方法一：点击切换**
- 在左侧代理列表中点击任意代理名称，立即切换到该代理
- 当前代理的对话历史会被保留

**方法二：命令切换**
- 在输入栏中输入 `/` 后跟代理名称，例如：
  - `/planner` — 切换到规划代理
  - `/code-reviewer` — 切换到代码审查代理
  - `/tdd-guide` — 切换到 TDD 代理

**方法三：快捷键切换**
- `Cmd/Ctrl + K` → 输入代理名称 → `Enter` 快速切换

### 代理类型速查

| 代理 | 用途 | 适用场景 |
|------|------|----------|
| `planner` | 实现规划 | 复杂功能、重构前 |
| `architect` | 系统设计 | 架构决策 |
| `tdd-guide` | 测试驱动开发 | 新功能、Bug 修复 |
| `code-reviewer` | 代码审查 | 编写/修改代码后 |
| `security-reviewer` | 安全分析 | 提交前、敏感代码 |
| `build-error-resolver` | 构建错误修复 | 构建失败时 |
| `e2e-runner` | E2E 测试 | 关键用户流程 |
| `refactor-cleaner` | 死代码清理 | 代码维护 |
| `doc-updater` | 文档更新 | 更新文档 |
| `react-reviewer` | React 代码审查 | React 项目 |
| `typescript-reviewer` | TypeScript 审查 | TypeScript/JS 项目 |
| `python-reviewer` | Python 审查 | Python 项目 |
| `rust-reviewer` | Rust 审查 | Rust 项目 |
| `rust-build-resolver` | Rust 构建错误 | Rust 构建失败 |
| `django-reviewer` | Django 审查 | Django 应用 |
| `database-reviewer` | 数据库设计 | Schema 设计、查询优化 |
| `kotlin-reviewer` | Kotlin 审查 | Kotlin/Android 项目 |
| `flutter-reviewer` | Flutter 审查 | Flutter/Dart 项目 |
| `harness-optimizer` | 配置调优 | 可靠性、成本优化 |
| `loop-operator` | 循环执行 | 自主循环、监控卡顿 |
| `network-troubleshooter` | 网络诊断 | 网络连通性、路由、DNS |

### 代理状态指示

- **🟢 就绪**：代理可立即使用
- **🟡 运行中**：代理正在执行任务
- **🔴 错误**：代理执行出错
- **⚪ 空闲**：代理已加载但未开始任务

---

## ⌨️ 在普通会话中管理 Agent

在普通会话（非 Agent 面板）中，通过命令行和快捷键管理代理。

### 启动代理

**方式一：使用 `/` 命令**

在输入框中直接输入 `/` 后跟代理名称：

```
/planner 实现用户认证功能
/architect 设计数据库 Schema
/code-reviewer 审查当前代码
/tdd-guide 为 SearchInput 组件编写测试
```

**方式二：使用 `@` 引用**

在对话中 `@` 引用代理：

```
@planner 帮我规划这个功能
@security-reviewer 检查这段代码的安全性
```

### 并行启动多个代理

在普通会话中可以同时启动多个代理，它们会在后台并行运行：

```
# 依次输入以下命令，它们会并行执行：
/security-reviewer 检查 auth 模块
/performance-optimizer 分析缓存系统
/code-reviewer 检查类型定义
```

### 后台代理管理

**查看运行中的代理**：

```
/tasks              # 查看所有运行中的任务
/context            # 查看当前上下文和代理状态
```

**停止代理**：

```
/tasks stop <task-id>   # 停止指定任务
/stop                   # 停止当前任务
```

### 代理之间通信

代理之间可以通过 `SendMessage` 工具互相通信。在普通会话中，主代理可以协调多个子代理：

```
1. /architect 设计 API 架构
2. 架构设计完成后，主代理可以自动将结果传递给
3. /code-reviewer 审查架构设计
```

### 常用命令速查

| 命令 | 作用 | 示例 |
|------|------|------|
| `/plan` | 创建实施计划 | `/plan 添加用户认证功能` |
| `/plan-prd` | 生成 PRD 文档 | `/plan-prd` |
| `/code-review` | 代码审查 | `/code-review` |
| `/security-review` | 安全审查 | `/security-review` |
| `/react-test` | React TDD | `/react-test 测试 SearchInput` |
| `/build-fix` | 修复构建错误 | `/build-fix` |
| `/update-docs` | 更新文档 | `/update-docs` |
| `/update-codemaps` | 更新代码映射 | `/update-codemaps` |
| `/save-session` | 保存会话状态 | `/save-session` |
| `/resume-session` | 恢复会话状态 | `/resume-session` |
| `/model` | 切换模型 | `/model sonnet` |
| `/context` | 查看上下文使用 | `/context` |
| `/tasks` | 管理任务 | `/tasks` |

### 代理组合工作流

**开发新功能**：
```
/plan-prd → /plan → /tdd-guide → /react-test → /code-review → /pr
```

**修复 Bug**：
```
/plan → /tdd-guide → /code-review → /pr
```

**代码重构**：
```
/plan → /architect → /code-review → /react-test
```

**文档更新**：
```
/update-docs → /update-codemaps
```

### 权限管理

首次使用某些代理时可能会请求权限。可以在 `~/.claude/settings.json` 中配置允许的工具：

```json
{
  "permissions": {
    "allow": [
      "Bash: npm run build",
      "Bash: git *",
      "Read: **",
      "Write: src/**",
      "Edit: src/**"
    ]
  }
}
```

或使用命令：

```
/fewer-permission-prompts   # 扫描常用命令并添加到允许列表
```

### 注意事项

- 每个代理有独立的上下文窗口，并行运行多个代理会消耗更多 token
- 后台代理的输出不会自动显示在主对话中，需要使用 `/tasks` 查看
- 代理之间的通信需要通过主代理协调
- 复杂任务建议使用 `ultracode` 模式启用多代理编排
