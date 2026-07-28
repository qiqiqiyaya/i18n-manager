/**
 * 锁定消息
 */
export interface LockMessage {
  type: 'lock' | 'unlock';
  projectId: string;
  keyPath: string;
  language: string;
  ip: string;
  timestamp: number;
}

/**
 * Schema 更新载荷（含时间戳冲突检测）
 */
export interface SchemaUpdatedPayload {
  projectId: string;
  schema: Record<string, any>;
  addedKeys: string[];
  removedKeys: string[];
  renameMap?: Record<string, string>;
  timestamp: number;
  clientId: string;
}

/**
 * Schema 更新被拒绝载荷
 */
export interface SchemaRejectedPayload {
  reason: 'stale_timestamp';
  acceptedTimestamp: number;
  acceptedData: SchemaUpdatedPayload;
}

/**
 * Schema 持久化保存载荷（通过 Socket.IO 替代 HTTP PATCH）
 */
export interface SchemaSavePayload {
  projectId: string;
  schema: Record<string, any>;
  addedKeys: string[];
  removedKeys: string[];
}

/**
 * Locale 持久化保存载荷
 */
export interface LocaleSavePayload {
  projectId: string;
  lang: string;
  translations: Record<string, any>;
}

/**
 * WebSocket 事件类型
 */
export type SocketEvent =
  | 'lock'
  | 'unlock'
  | 'update'
  | 'overwritten'
  | 'online_count'
  | 'join'
  | 'error'
  | 'schema:updated'
  | 'schema:rejected';

/**
 * 服务端 Socket 事件载荷
 */
export interface UpdatePayload {
  projectId: string;
  type: 'schema' | 'locale';
  lang?: string;
  data: any;
}

export interface OverwrittenPayload {
  keyPath: string;
  language: string;
  newValue: any;
}

export interface OnlineCountPayload {
  count: number;
}
