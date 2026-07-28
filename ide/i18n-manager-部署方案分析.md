# i18n-manager 部署与发布方案分析

> 基于项目架构和代码分析生成的综合部署方案

---

## 1. 部署架构选项分析

### 选项 A: Vercel ❌ 不可行

**原因**：

- `server.ts` 使用 Express 自定义服务器 + Socket.IO，Vercel 仅支持 Serverless Functions，不支持持久 WebSocket 连接
- Socket.IO 需要长连接和内存中的房间/锁状态，Vercel 的 Serverless 架构无法维持
- `proper-lockfile` 需要文件系统锁，在 Vercel 的无状态只读文件系统中无法工作
- 数据存储在本地 JSON 文件（`data/projects/`），Vercel 不提供持久化写入文件系统

### 选项 B: Docker 部署（推荐）

**架构概要**：

```
                          Internet
                             |
                      Nginx / Caddy (反向代理 + SSL)
                             |
                     Docker 容器 (node:22-alpine)
                     ┌──────────────────────────┐
                     │   Node.js 进程            │
                     │   tsx server.ts           │
                     │   (Express + Socket.IO    │
                     │    + Next.js 渲染)         │
                     │                           │
                     │   /app/data/projects/     │
                     └──────────┬───────────────┘
                                |
                     Docker Volume (持久化 data/)
```

**优点**：环境一致、一键部署到任何云、数据卷持久化、崩溃自动重启
**缺点**：需要 Docker 基础知识、单容器扩展受限

### 选项 C: PM2 进程管理

**架构概要**：

```
                          Internet
                             |
                      Nginx (反向代理 + SSL)
                             |
                     Node.js 进程 (PM2 Cluster Mode)
                     ┌──────────────────────────┐
                     │   PM2                     │
                     │   ├── server.ts (主进程)   │
                     │   └── (cluster mode × N)  │
                     │                           │
                     │   ./data/projects/        │
                     └──────────────────────────┘
```

**优点**：轻量级、进程守护、自动重启、日志管理
**缺点**：环境依赖在宿主机管理、Cluster mode 下 Socket.IO 需额外配置

### 选项 D: Docker Compose + Nginx 反向代理（最佳推荐）

**架构概要**：

```
                          Internet
                             |
                      Nginx 容器 (端口 443/80)
                      (SSL termination + WebSocket proxy)
                             |
                      i18n-manager 容器 (端口 3000)
                      (tsx server.ts)
                             |
                      Volume: data_projects
```

**优点**：完整生产级架构、SSL/WebSocket 一站式配置、易于扩展
**缺点**：需要 Docker Compose 和 Nginx 配置知识

**推荐**：选项 D（Docker Compose + Nginx）为最佳生产方案，选项 B（单 Docker 容器）为快速部署方案。

---

## 2. 构建与打包步骤

### 2.1 生产构建流程

```bash
# 1. 安装依赖
npm ci --include=dev    # tsx 在 devDependencies，生产也需安装

# 2. 构建 Next.js 应用（产出 .next/ 目录）
npm run build

# 3. 验证构建产物
ls -la .next/        # 应包含 BUILD_ID, server/, static/ 等
```

### 2.2 自定义服务器构建

`server.ts` 使用 `tsx`（TypeScript 执行器）在运行时直接运行，**无需编译**。`tsx` 已列为 `devDependencies`，需要在生产环境保留（或使用 `npm install --include=dev`）。

**生产启动命令**：

```bash
export NODE_ENV=production
export PORT=3000
export DATA_DIR=./data
npx tsx server.ts
```

### 2.3 环境变量配置

```env
# .env.production 或 Docker 环境变量
NODE_ENV=production
PORT=3000
DATA_DIR=./data
NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE=1000
LOCK_TIMEOUT=30000
NEXT_PUBLIC_WS_URL=wss://your-domain.com
```

### 2.4 数据持久化

`data/projects/` 目录包含所有业务数据，必须持久化。

**Docker Volume**：

```yaml
volumes:
  - data_projects:/app/data/projects
```

---

## 3. 基础设施要求

### 3.1 最低服务器规格

| 规格 | 最低配置 | 推荐配置 | 说明 |
|------|---------|---------|------|
| CPU | 1 vCPU | 2 vCPUs | Node.js 单线程，1 vCPU 够用 |
| 内存 | 1 GB | 2 GB | Next.js 构建需要 1GB+ |
| 磁盘 | 10 GB SSD | 20 GB SSD | 数据文件占空间不大 |
| 操作系统 | Linux (Ubuntu 22.04 / Debian 12) | 同左 | |

### 3.2 Node.js 版本

- **最低**：Node.js 18+
- **推荐**：Node.js 22 LTS
- **Docker 镜像**：`node:22-alpine`

### 3.3 端口配置

| 端口 | 协议 | 用途 | 说明 |
|------|------|------|------|
| 3000 | HTTP | 应用服务端口 | Express + Next.js + Socket.IO |
| 443 | HTTPS | 对外 HTTPS | Nginx 反向代理 |
| 80 | HTTP | HTTP 重定向到 443 | Nginx |

### 3.4 Nginx 反向代理配置

```nginx
server {
    listen 443 ssl http2;
    server_name i18n.yourcompany.com;

    ssl_certificate     /etc/letsencrypt/live/i18n.yourcompany.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/i18n.yourcompany.com/privkey.pem;

    # 静态资源缓存
    location /_next/static {
        proxy_pass http://127.0.0.1:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # WebSocket 代理（Socket.IO）— 关键配置
    location /socket.io/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 86400s;    # 24h 长连接
        proxy_send_timeout 86400s;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    client_max_body_size 50M;
}
```

**关键点**：
- `/socket.io/` 必须配置 WebSocket 升级头
- 超时设为 86400 秒（长连接）
- `X-Forwarded-For` 用于获取客户端真实 IP

---

## 4. CI/CD 流水线

### 4.1 GitHub Actions

```yaml
# .github/workflows/deploy.yml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run lint
      - run: npx tsc --noEmit

  build:
    needs: lint-and-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with: { name: next-build, path: .next/ }

  docker-build-and-push:
    needs: build
    runs-on: ubuntu-latest
    permissions: { contents: read, packages: write }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/download-artifact@v4
        with: { name: next-build, path: .next/ }
      - name: Build and push Docker image
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/your-org/i18n-manager:latest

  deploy:
    needs: docker-build-and-push
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1.0.3
        with:
          host: ${{ secrets.DEPLOY_HOST }}
          username: ${{ secrets.DEPLOY_USER }}
          key: ${{ secrets.DEPLOY_SSH_KEY }}
          script: |
            cd /opt/i18n-manager
            docker compose pull
            docker compose up -d --force-recreate
```

### 4.2 Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev && npm cache clean --force
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./
COPY --from=builder /app/tsconfig.json ./
COPY src/ ./src/
RUN mkdir -p /app/data/projects
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs && \
    chown -R nextjs:nodejs /app
USER nextjs

ENV NODE_ENV=production PORT=3000 DATA_DIR=/app/data
EXPOSE 3000
CMD ["npx", "tsx", "server.ts"]
```

### 4.3 Docker Compose

```yaml
version: "3.8"

services:
  app:
    build: .
    image: ghcr.io/your-org/i18n-manager:latest
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATA_DIR=/app/data
      - NEXT_PUBLIC_AUTO_SAVE_DEBOUNCE=1000
      - LOCK_TIMEOUT=30000
      - NEXT_PUBLIC_WS_URL=wss://i18n.yourcompany.com
    volumes:
      - data_projects:/app/data/projects
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3000/"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro
    depends_on:
      - app

volumes:
  data_projects:
```

---

## 5. 生产运维考虑

### 5.1 数据备份策略

```bash
#!/bin/bash
# /usr/local/bin/backup-i18n.sh
BACKUP_DIR="/var/backups/i18n-manager"
DATE=$(date +%Y%m%d_%H%M%S)
SOURCE_DIR="/var/lib/i18n-manager/data"
RETENTION_DAYS=30
mkdir -p "$BACKUP_DIR"
tar -czf "$BACKUP_DIR/i18n-data-$DATE.tar.gz" -C "$(dirname $SOURCE_DIR)" "$(basename $SOURCE_DIR)"
find "$BACKUP_DIR" -name "i18n-data-*.tar.gz" -mtime +$RETENTION_DAYS -delete
```

**Crontab**：每天凌晨 2 点备份

```cron
0 2 * * * /usr/local/bin/backup-i18n.sh >> /var/log/i18n-backup.log 2>&1
```

**Docker Volume 快照**：

```bash
docker run --rm -v data_projects:/data -v /var/backups:/backup alpine \
  tar -czf /backup/i18n-data-$(date +%Y%m%d).tar.gz -C /data .
```

### 5.2 监控指标

| 指标 | 监控方式 | 告警阈值 |
|------|---------|---------|
| 进程存活 | Docker healthcheck | 容器重启 > 3 次/5分钟 |
| HTTP 响应时间 | Nginx 日志 | P95 > 2s |
| HTTP 错误率 | Nginx 日志 | 5xx 占比 > 1% |
| 内存使用 | Docker stats | > 1.5 GB |
| 磁盘使用 | df | > 80% |

**推荐监控栈**：cAdvisor + Prometheus + Grafana + Loki

### 5.3 水平扩展

对于 **50-100 人同时编辑的小团队，单实例完全足够**。更大规模时需：

1. `@socket.io/redis-adapter` 共享 WebSocket 状态
2. Redis 用于锁协调
3. 负载均衡器 sticky sessions
4. 共享文件系统（NFS/EFS）

### 5.4 安全考虑（无用户系统）

由于项目**没有用户认证系统**，安全防护尤为重要：

1. **VPN 或内网部署** — 最有效的方案
2. **Nginx IP 白名单**：
   ```nginx
   location / {
       allow 10.0.0.0/8;
       allow 192.168.0.0/16;
       deny all;
       proxy_pass http://127.0.0.1:3000;
   }
   ```
3. **HTTP Basic Auth**：
   ```nginx
   location / {
       auth_basic "i18n Manager";
       auth_basic_user_file /etc/nginx/.htpasswd;
   }
   ```
4. **CORS 限制** — 生产环境修改 `origin: '*'` 为具体域名
5. **请求限流**：
   ```nginx
   limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
   location /api/ { limit_req zone=api burst=20 nodelay; }
   ```
6. **HTTPS 强制** + HSTS 头

---

## 6. 部署决策矩阵

| 因素 | Docker Compose + Nginx | 单 Docker + 宿主机 Nginx | PM2 裸机 |
|------|----------------------|------------------------|----------|
| **推荐级别** | ⭐ 最佳推荐 | ⭐ 推荐 | 可用 |
| 部署复杂度 | 中等 | 低 | 中 |
| 环境一致性 | 高 | 高 | 低 |
| SSL 配置 | 内置 Nginx | 宿主机 Nginx | 宿主机 Nginx |
| WebSocket 支持 | 内置 | 宿主机 Nginx | 宿主机 Nginx |
| 备份恢复 | Volume 快照 | Volume 快照 | 文件复制 |
| 水平扩展 | 需额外配置 | 需额外配置 | 需额外配置 |
| 适用场景 | 正式生产 | 快速部署 | 已有 Node 运维 |

---

## 关键文件路径

| 文件 | 路径 | 说明 |
|------|------|------|
| 自定义服务器入口 | `server.ts` | Express + Socket.IO + Next.js 启动 |
| Next.js 配置 | `next.config.ts` | 启用 React Compiler |
| 环境变量 | `.env.local` | 开发环境配置 |
| Socket.IO 处理器 | `src/lib/socket-handler.ts` | WebSocket 房间/锁/广播 |
| 文件 I/O 原语 | `src/lib/data-layer/io.ts` | 原子写入 + 文件锁 |
| 数据目录 | `data/projects/` | 运行时自动创建 |
| 项目文档 | `i18nManager.md` | 完整需求与技术设计 |

---

> **最终建议**：正式生产环境使用 **Docker Compose + Nginx** 方案；快速验证或个人使用可选 **单 Docker 容器 + 宿主机 Nginx**；PM2 裸机方案适合已有 Node.js 运维基础设施的团队。
