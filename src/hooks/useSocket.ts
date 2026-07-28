'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Subject, timer } from 'rxjs';
import { filter, switchMap, takeUntil, tap } from 'rxjs/operators';
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
  const setSaveStatus = useEditorStore((s) => s.setSaveStatus);

  // ---- 保存状态流（RxJS）----
  // savingStart$: saving 开始时发出时间戳
  // saveResult$: 收到服务端回执时发出结果
  // 用 timer 确保 saving 至少显示 800ms，避免一闪而过
  const SAVING_MIN_DISPLAY = 800;
  const SAVED_AUTO_CLEAR = 2000;

  const { savingStart$, saveResult$ } = useMemo(() => {
    const savingStart$ = new Subject<number>();
    const saveResult$ = new Subject<{ success: boolean; error?: string }>();

    // 收到回执后，如果距 saving 开始不足 800ms，延迟到满 800ms 再处理
    saveResult$
      .pipe(
        switchMap((result) => {
          const elapsed = Date.now() - lastSavingStart;
          const delay = Math.max(0, SAVING_MIN_DISPLAY - elapsed);
          return timer(delay).pipe(
            tap(() => {
              if (result.success) {
                setSaveStatus('saved');
                // saved 状态 2s 后自动回到 idle
                timer(SAVED_AUTO_CLEAR)
                  .pipe(filter(() => useEditorStore.getState().saveStatus === 'saved'))
                  .subscribe(() => setSaveStatus('idle'));
              } else {
                setSaveStatus('error', result.error || '保存失败');
              }
            })
          );
        })
      )
      .subscribe();

    return { savingStart$, saveResult$ };
  }, [setSaveStatus]);

  // 记录最近一次 saving 开始时间
  let lastSavingStart = 0;
  savingStart$.subscribe((ts) => { lastSavingStart = ts; });

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

    // Schema 保存回执
    socket.on('schema:saved', (data: { success: boolean; error?: string }) => {
      saveResult$.next(data);
    });

    // Locale 保存回执
    socket.on('locale:saved', (data: { success: boolean; error?: string }) => {
      saveResult$.next(data);
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
    savingStart$.next(Date.now());
    setSaveStatus('saving');
    socketRef.current?.emit('schema:save', { projectId, ...data });
  };

  const sendLocaleSave = (lang: string, translations: Record<string, any>) => {
    savingStart$.next(Date.now());
    setSaveStatus('saving');
    socketRef.current?.emit('locale:save', { projectId, lang, translations });
  };

  return { socket: socketRef.current, socketId, sendLock, sendUnlock, sendUpdate, sendSchemaUpdated, sendSchemaSave, sendLocaleSave };
}
