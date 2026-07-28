import { Server as SocketIOServer, Socket } from 'socket.io';
import type { LockMessage, UpdatePayload, SchemaUpdatedPayload, SchemaSavePayload, LocaleSavePayload } from '../types/collaboration';
import { updateSchemaIncremental } from './data-layer/schema';
import { updateLocale } from './data-layer/locales';

const LOCK_TIMEOUT = parseInt(process.env.LOCK_TIMEOUT || '30000', 10);

interface LockEntry {
  keyPath: string;
  language: string;
  ip: string;
  socketId: string;
  timer: ReturnType<typeof setTimeout>;
}

// 模块级 IO 实例，供 data-layer 等模块广播事件
// 使用 globalThis 跨 Next.js 打包边界共享，因 API 路由会被 Next.js 重新打包为独立模块作用域
let ioInstance: SocketIOServer | null = null;
const GLOBAL_KEY = '__ioInstance';

export function setIO(io: SocketIOServer): void {
  ioInstance = io;
  (globalThis as any)[GLOBAL_KEY] = io;
}

export function getIO(): SocketIOServer | null {
  return ioInstance ?? ((globalThis as any)[GLOBAL_KEY] ?? null);
}

// Schema 更新时间戳冲突检测（模块级，跨 connection 共享）
const globalSchemaTimestamps: Map<string, number> = new Map();
const globalAcceptedData: Map<string, any> = new Map();

/**
 * Socket.IO 事件处理器
 */
export function setupSocketHandlers(io: SocketIOServer): void {
  ioInstance = io;
  io.on('connection', (socket: Socket) => {
    const projectId = socket.handshake.query.projectId as string;
    if (!projectId) {
      socket.emit('error', { message: '缺少 projectId' });
      return;
    }

    // 从请求头获取客户端 IP
    const ip = getClientIp(socket);

    // 加入项目房间
    const roomName = `room:project-${projectId}`;
    socket.join(roomName);

    // 获取房间在线人数
    const room = io.sockets.adapter.rooms.get(roomName);
    const onlineCount = room ? room.size : 0;
    io.to(roomName).emit('online_count', { count: onlineCount });

    // 每个 socket 的锁集合
    const socketLocks = new Map<string, LockEntry>();

    // 键级锁定
    socket.on('lock', (data: Omit<LockMessage, 'ip' | 'timestamp'>) => {
      const lockKey = `${data.language}:${data.keyPath}`;

      // 先释放该 socket 旧的同名锁
      if (socketLocks.has(lockKey)) {
        clearTimeout(socketLocks.get(lockKey)!.timer);
        socketLocks.delete(lockKey);
      }

      const lockMessage: LockMessage = {
        type: 'lock',
        projectId,
        keyPath: data.keyPath,
        language: data.language,
        ip,
        timestamp: Date.now(),
      };

      // 设置超时自动释放
      const timer = setTimeout(() => {
        socket.emit('unlock', { keyPath: data.keyPath, language: data.language, reason: 'timeout' });
        socket.to(roomName).emit('unlock', { keyPath: data.keyPath, language: data.language, ip });
        socketLocks.delete(lockKey);
      }, LOCK_TIMEOUT);

      socketLocks.set(lockKey, {
        keyPath: data.keyPath,
        language: data.language,
        ip,
        socketId: socket.id,
        timer,
      });

      // 广播给房间其他人（排除自己）
      socket.to(roomName).emit('lock', lockMessage);
    });

    // 解锁
    socket.on('unlock', (data: { keyPath: string; language: string }) => {
      const lockKey = `${data.language}:${data.keyPath}`;
      const lock = socketLocks.get(lockKey);
      if (lock) {
        clearTimeout(lock.timer);
        socketLocks.delete(lockKey);
      }

      socket.to(roomName).emit('unlock', {
        keyPath: data.keyPath,
        language: data.language,
        ip,
      });
    });

    // 数据更新广播
    socket.on('update', (data: UpdatePayload) => {
      socket.to(roomName).emit('update', data);
    });

    // Schema 更新广播 + 时间戳冲突检测
    socket.on('schema:updated', (data: SchemaUpdatedPayload) => {
      const lastTimestamp = globalSchemaTimestamps.get(projectId) || 0;

      if (data.timestamp < lastTimestamp) {
        // 旧变更，拒绝并返回最新已接受的数据
        socket.emit('schema:rejected', {
          reason: 'stale_timestamp',
          acceptedTimestamp: lastTimestamp,
          acceptedData: globalAcceptedData.get(projectId),
        });
        return;
      }

      // 新变更，接受并广播
      globalSchemaTimestamps.set(projectId, data.timestamp);
      globalAcceptedData.set(projectId, data);
      socket.to(roomName).emit('schema:updated', data);
    });

    // Schema 持久化保存（通过 Socket.IO 替代 HTTP PATCH）
    socket.on('schema:save', async (data: SchemaSavePayload) => {
      try {
        // 从完整 schema 中提取新增键的描述作为 updates
        const updates: Record<string, any> = {};
        for (const key of data.addedKeys) {
          if (key in data.schema) {
            updates[key] = data.schema[key];
          }
        }
        await updateSchemaIncremental(data.projectId, updates, data.removedKeys);
        socket.emit('schema:saved', { success: true, projectId: data.projectId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Schema 保存失败';
        socket.emit('schema:saved', { success: false, error: msg });
        socket.emit('error', { message: msg });
      }
    });

    // Locale 持久化保存（通过 Socket.IO 替代 HTTP PATCH）
    socket.on('locale:save', async (data: LocaleSavePayload) => {
      try {
        await updateLocale(data.projectId, data.lang, data.translations);
        socket.emit('locale:saved', { success: true, projectId: data.projectId, lang: data.lang });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Locale 保存失败';
        socket.emit('locale:saved', { success: false, error: msg });
        socket.emit('error', { message: msg });
      }
    });

    // 断开连接清理
    socket.on('disconnect', () => {
      // 清理该 socket 的所有锁
      for (const [, lock] of socketLocks) {
        clearTimeout(lock.timer);
        socket.to(roomName).emit('unlock', {
          keyPath: lock.keyPath,
          language: lock.language,
          ip: lock.ip,
          reason: 'disconnect',
        });
      }
      socketLocks.clear();

      // 更新在线人数
      const updatedRoom = io.sockets.adapter.rooms.get(roomName);
      const updatedCount = updatedRoom ? updatedRoom.size : 0;
      io.to(roomName).emit('online_count', { count: updatedCount });
    });
  });
}

function getClientIp(socket: Socket): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (forwarded) {
    return Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || socket.id;
}
