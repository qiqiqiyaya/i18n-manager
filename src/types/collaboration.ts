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
 * timestamp 用于与 schema:updated 共用同一套冲突检测，
 * 避免「广播被拒但仍写盘」导致磁盘与所有客户端显示不一致
 */
export interface SchemaSavePayload {
  projectId: string;
  schema: Record<string, any>;
  addedKeys: string[];
  removedKeys: string[];
  timestamp: number;
}

/**
 * Locale 持久化保存载荷
 * timestamp/clientId 为将来的冲突检测预留；当前译文走 last-write-wins，不做拒绝
 */
export interface LocaleSavePayload {
  projectId: string;
  lang: string;
  translations: Record<string, any>;
  timestamp?: number;
  clientId?: string;
}

/**
 * Locale 变更广播载荷
 * 与 SchemaUpdatedPayload 对称：xxx:updated 负责广播，xxx:save 负责持久化。
 * 当前译文走 last-write-wins，timestamp/clientId 为将来的冲突检测预留
 */
export interface LocaleUpdatedPayload {
  projectId: string;
  lang: string;
  translations: Record<string, any>;
  timestamp: number;
  clientId: string;
}

/**
 * WebSocket 事件类型
 */
export type SocketEvent =
  | 'update'
  | 'overwritten'
  | 'online_count'
  | 'join'
  | 'error'
  | 'schema:updated'
  | 'schema:rejected'
  | 'schema:save'
  | 'schema:saved'
  | 'locale:updated'
  | 'locale:save'
  | 'locale:saved'
  | 'locale:synced';

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
