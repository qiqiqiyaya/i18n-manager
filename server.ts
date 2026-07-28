import { createServer, Server as HttpServer } from 'http';
import { parse, UrlWithParsedQuery } from 'url';
import next from 'next';  
import express, { Express, Request, Response, NextFunction } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import fs from 'fs-extra';
import path from 'path';
import { setupSocketHandlers, setIO } from './src/lib/socket-handler';

const dev: boolean = process.env.NODE_ENV !== 'production';
const hostname: string = 'localhost';
const port: number = parseInt(process.env.PORT || '3000', 10);

// 确保数据目录存在
const DATA_DIR: string = process.env.DATA_DIR || './data';
fs.ensureDirSync(path.join(DATA_DIR, 'projects'));

const app = next({ dev, hostname });
const handle = app.getRequestHandler();

app.prepare().then((): void => {
  const expressApp: Express = express();
  const httpServer: HttpServer = createServer(expressApp);

  // Socket.IO 实例
  const io: SocketIOServer = new SocketIOServer(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  // 设置 Socket.IO 事件处理器
  setupSocketHandlers(io);
  setIO(io); // 暴露 IO 实例供 data-layer 等模块广播使用

  // Express 5 (path-to-regexp v8) 不支持通配符路径，使用无路径 use() 作为兜底处理
  expressApp.use((req: Request, res: Response, nextFn: NextFunction): void => {
    // Socket.IO 请求由 HTTP server 自处理，不进入 Next.js
    if (req.url && req.url.startsWith('/socket.io')) return nextFn();
    const parsedUrl: UrlWithParsedQuery = parse(req.url ?? '/', true);
    handle(req, res, parsedUrl);
  });

  httpServer.listen(port, (): void => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${dev ? 'development' : 'production'}`
    );
    console.log(`> Data directory: ${DATA_DIR}`);
  });
});
