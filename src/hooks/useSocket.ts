'use client';

import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useEditorStore } from '@/stores/editorStore';
import type { SchemaUpdatedPayload } from '@/types/collaboration';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

interface UseSocketOptions {
  projectId: string | null;
}

export function useSocket({ projectId }: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [socketId, setSocketId] = useState<string>('');

  const addLock = useCollaborationStore((s) => s.addLock);
  const removeLock = useCollaborationStore((s) => s.removeLock);
  const setOnlineCount = useCollaborationStore((s) => s.setOnlineCount);
  const setOverwrittenMessage = useCollaborationStore((s) => s.setOverwrittenMessage);
  const setSchema = useEditorStore((s) => s.setSchema);
  const updateTranslation = useEditorStore((s) => s.updateTranslation);
  const applyLocaleSync = useEditorStore((s) => s.applyLocaleSync);

  useEffect(() => {
    if (!projectId) return;

    const socket = io(WS_URL, {
      query: { projectId },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      setSocketId(socket.id || '');
    });

    socket.on('online_count', (data: { count: number }) => {
      setOnlineCount(data.count);
    });

    socket.on('lock', (data: { keyPath: string; language: string; ip: string; timestamp: number }) => {
      addLock({ keyPath: data.keyPath, language: data.language, ip: data.ip, timestamp: data.timestamp });
    });

    socket.on('unlock', (data: { keyPath: string; language: string }) => {
      removeLock(data.language, data.keyPath);
    });

    socket.on('update', (data: { type: 'schema' | 'locale'; lang?: string; data: any }) => {
      if (data.type === 'schema') {
        setSchema(data.data);
      } else if (data.type === 'locale' && data.lang) {
        updateTranslation(data.lang, data.data);
      }
    });

    socket.on('overwritten', () => {
      setOverwrittenMessage('该键已被他人更新');
      setTimeout(() => setOverwrittenMessage(null), 3000);
    });

    socket.on('locale:synced', (data: { addedKeys: string[]; removedKeys: string[] }) => {
      applyLocaleSync(data.addedKeys, data.removedKeys);
    });

    // 接收 Schema 实时更新（来自其他客户端或服务端广播）
    socket.on('schema:updated', (data: SchemaUpdatedPayload) => {
      setSchema(data.schema);
      applyLocaleSync(data.addedKeys, data.removedKeys, data.renameMap);
    });

    // 收到拒绝（时间戳冲突）
    socket.on('schema:rejected', (data: { reason: string; acceptedTimestamp: number; acceptedData: SchemaUpdatedPayload }) => {
      if (data.acceptedData) {
        setSchema(data.acceptedData.schema);
        applyLocaleSync(data.acceptedData.addedKeys, data.acceptedData.removedKeys, data.acceptedData.renameMap);
      }
      setOverwrittenMessage('Schema 已被其他用户更新，已同步到最新版本');
      setTimeout(() => setOverwrittenMessage(null), 5000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [projectId, addLock, removeLock, setOnlineCount, setOverwrittenMessage, setSchema, updateTranslation, applyLocaleSync]);

  const sendLock = (keyPath: string, language: string) => {
    socketRef.current?.emit('lock', { projectId, keyPath, language });
  };

  const sendUnlock = (keyPath: string, language: string) => {
    socketRef.current?.emit('unlock', { projectId, keyPath, language });
  };

  const sendUpdate = (data: { type: 'schema' | 'locale'; lang?: string; data: any }) => {
    socketRef.current?.emit('update', { projectId, ...data });
  };

  const sendSchemaUpdated = (data: Omit<SchemaUpdatedPayload, 'projectId'>) => {
    socketRef.current?.emit('schema:updated', { projectId, ...data });
  };

  const sendSchemaSave = (data: { schema: Record<string, any>; addedKeys: string[]; removedKeys: string[] }) => {
    socketRef.current?.emit('schema:save', { projectId, ...data });
  };

  const sendLocaleSave = (lang: string, translations: Record<string, any>) => {
    socketRef.current?.emit('locale:save', { projectId, lang, translations });
  };

  return { socket: socketRef.current, socketId, sendLock, sendUnlock, sendUpdate, sendSchemaUpdated, sendSchemaSave, sendLocaleSave };
}
