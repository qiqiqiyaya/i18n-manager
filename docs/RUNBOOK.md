# Runbook

i18n Manager 部署与运维手册。命令表与环境变量表由源码生成，请勿手动编辑标记区块。

## 架构概览

单进程 Node 服务（`server.ts`，经 `tsx` 运行）：Express 5 包装 Next.js 请求处理器，并在同一 HTTP server 上挂载 Socket.IO。数据持久化到本地 JSON 文件（`{DATA_DIR}/projects/`），无外部数据库。

- HTTP + WebSocket：同一端口（默认 3000）
- Socket.IO 路径 `/socket.io` 由 HTTP server 自处理，其余请求转交 Next.js
- 启动时自动 `fs.ensureDirSync({DATA_DIR}/projects)`
- `fix-async-storage.cjs` 通过 `--require` 在启动前注入 `globalThis.AsyncLocalStorage`（Next.js 16 canary 兼容性修复）

<!-- AUTO-GENERATED:env -->
## 环境变量

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE` | 否 | 自动保存防抖延迟（毫秒），默认 `1000` | `1000` |
| `LOCK_TIMEOUT` | 否 | 键级锁定超时（毫秒），默认 `30000` | `30000` |
| `NEXT_PUBLIC_WS_URL` | 否 | 前端 Socket.IO 连接地址 | `http://localhost:3000` |
| `DATA_DIR` | 否 | 数据持久化根目录，默认 `./data` | `./data` |
| `PORT` | 否 | HTTP/WebSocket 监听端口，默认 `3000` | `3000` |
<!-- END AUTO-GENERATED:env -->

## 部署流程

```bash
# 1. 拉取代码并安装依赖
git pull
npm ci

# 2. 配置环境变量（可选，所有变量均有默认值）
cp .env.example .env.local     # 首次；按环境调整 PORT / DATA_DIR / NEXT_PUBLIC_WS_URL

# 3. 生产构建
npm run build

# 4. 以生产模式启动完整服务（含 Socket.IO）
NODE_ENV=production npm run start:server
```

> `npm run start`（`next start`）仅启动 Next.js，不含 Express/Socket.IO 协作层。生产环境需要实时协作时必须使用 `start:server`。

建议用进程管理器（如 pm2 / systemd）守护 `tsx server.ts`，并将 `NODE_ENV=production` 注入环境。

### PM2 示例配置

```json
{
  "name": "i18n-manager",
  "script": "node",
  "args": "--require ./fix-async-storage.cjs --import tsx server.ts",
  "env": {
    "NODE_ENV": "production",
    "PORT": "3000",
    "DATA_DIR": "./data"
  }
}
```

## 健康检查

- **HTTP**：`GET /` 应返回项目列表页（200）。
- **WebSocket**：客户端 Socket.IO 能连接到 `NEXT_PUBLIC_WS_URL` 并加入房间 `room:project-{projectId}`。
- **数据目录**：`{DATA_DIR}/projects/` 存在且进程有读写权限。
- **启动日志**：进程输出 `> Server listening at http://localhost:{PORT}` 与 `> Data directory: {DATA_DIR}`。

## 常见问题

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| 启动即退出，报端口占用 | `PORT` 被占用 | 更换 `PORT` 或释放端口 |
| 启动报 `AsyncLocalStorage` 错误 | `fix-async-storage.cjs` 未加载 | 确认启动命令包含 `--require ./fix-async-storage.cjs` |
| 前端无法实时协作 | 只跑了 `npm run start` / `dev` | 改用 `npm run start:server` |
| WebSocket 连接失败 | `NEXT_PUBLIC_WS_URL` 与实际地址不符 | 修正后重新构建（该变量为 `NEXT_PUBLIC_`，需在构建时确定） |
| 保存报锁冲突 / 文件写入失败 | `proper-lockfile` 互斥锁未释放或目录无写权限 | 检查 `{DATA_DIR}` 权限；清理残留 `.tmp` 和 `.lock` 文件 |
| 键锁长时间不释放 | 客户端异常断连 | 锁在 `LOCK_TIMEOUT`（默认 30s）后自动释放 |
| 导入返回 409 | 检测到冲突需确认 | 前端确认后带 `confirmed=true` 重新提交 |
| Schema 保存被拒绝 | 时间戳冲突（另一用户先保存了更新） | 客户端收到 `schema:rejected` 后自动同步到最新版本 |
| 删除语言返回 409 | 该语言是项目最后一个语言 | 至少保留一个语言，无法删除 |
| Express 5 路由报错 | 使用了通配符路径 | Express 5 (path-to-regexp v8) 不支持通配符，使用无路径 `use()` 兜底 |

## 回滚流程

```bash
# 1. 停止当前进程（pm2 stop / systemctl stop / Ctrl-C）

# 2. 检出上一个稳定版本
git checkout <上一个稳定 tag 或 commit>

# 3. 重新安装依赖并构建
npm ci
npm run build

# 4. 重新启动
NODE_ENV=production npm run start:server
```

### 数据回滚

数据为本地 JSON 文件，回滚前建议备份 `{DATA_DIR}/projects/`：

```bash
cp -r data/projects data/projects.bak.$(date +%Y%m%d%H%M%S)
```

如需恢复某项目，替换对应 `data/projects/{projectId}/` 目录即可（服务可热读取，无需迁移）。

## 告警与升级路径

当前为小型团队内部工具，无内置告警。建议：

1. 进程管理器配置崩溃自动重启与重启告警。
2. 监控磁盘空间（数据写入 `{DATA_DIR}`）。
3. 严重问题优先按「回滚流程」恢复到上一稳定版本，再排查根因。
