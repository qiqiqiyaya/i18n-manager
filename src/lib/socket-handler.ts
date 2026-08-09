import { Server as SocketIOServer, Socket } from 'socket.io';
import type { UpdatePayload, SchemaUpdatedPayload, SchemaSavePayload, LocaleSavePayload, LocaleUpdatedPayload } from '../types/collaboration';
import { updateSchema } from './data-layer/schema';
import { updateLocale } from './data-layer/locales';

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

    // 加入项目房间
    const roomName = `room:project-${projectId}`;
    socket.join(roomName);

    // 获取房间在线人数
    const room = io.sockets.adapter.rooms.get(roomName);
    const onlineCount = room ? room.size : 0;
    io.to(roomName).emit('online_count', { count: onlineCount });

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
      // 与 schema:updated 共用同一套时间戳检测：
      // 若只在广播侧拒绝而此处仍无条件写盘，会出现磁盘内容与所有客户端显示不一致。
      // 用 < 而非 <=，保证同一次编辑先发的 schema:updated 不会卡掉随后的 schema:save。
      const lastTimestamp = globalSchemaTimestamps.get(projectId) || 0;
      if (typeof data.timestamp === 'number' && data.timestamp < lastTimestamp) {
        socket.emit('schema:rejected', {
          reason: 'stale_timestamp',
          acceptedTimestamp: lastTimestamp,
          acceptedData: globalAcceptedData.get(projectId),
        });
        // 必须同时回执，否则客户端 saveStatus 永久卡在 'saving'
        socket.emit('schema:saved', {
          success: false,
          projectId: data.projectId,
          error: 'Schema 已被其他用户更新，本次保存已跳过',
        });
        return;
      }

      try {
        // 直接写入嵌套 schema 对象
        await updateSchema(data.projectId, data.schema);
        socket.emit('schema:saved', { success: true, projectId: data.projectId });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Schema 保存失败';
        socket.emit('schema:saved', { success: false, error: msg });
        socket.emit('error', { message: msg });
      }
    });

    // Locale 变更广播（与 schema:updated 对称）。
    // 译文走 last-write-wins：不做时间戳拒绝，因为 locale:save 对磁盘是无条件覆盖写，
    // 若只在广播侧拒绝会导致磁盘内容与客户端显示不一致。
    socket.on('locale:updated', (data: LocaleUpdatedPayload) => {
      socket.to(roomName).emit('locale:updated', data);
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
      // 更新在线人数
      const updatedRoom = io.sockets.adapter.rooms.get(roomName);
      const updatedCount = updatedRoom ? updatedRoom.size : 0;
      io.to(roomName).emit('online_count', { count: updatedCount });
    });
  });
}
