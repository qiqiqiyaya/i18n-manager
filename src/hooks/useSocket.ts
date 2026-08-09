'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { Subject, timer } from 'rxjs';
import { filter, switchMap, takeUntil, tap } from 'rxjs/operators';
import { io, Socket } from 'socket.io-client';
import { useCollaborationStore } from '@/stores/collaborationStore';
import { useEditorStore } from '@/stores/editorStore';
import type { SchemaUpdatedPayload, LocaleUpdatedPayload } from '@/types/collaboration';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3000';

interface UseSocketOptions {
  projectId: string | null;
}

export function useSocket({ projectId }: UseSocketOptions) {
  const socketRef = useRef<Socket | null>(null);
  const [socketId, setSocketId] = useState<string>('');

  // 服务端最近一次「已接受」的时间戳。收到 schema:rejected 时记录，
  // 用于校准本地时钟——否则时钟慢的机器每次编辑都会被判定为过期而永久无法提交。
  const lastAcceptedTimestampRef = useRef(0);

  /**
   * 生成单调递增的时间戳。
   * 时间戳仍以客户端 Date.now() 为准，但不会低于服务端已接受的值，
   * 从而让时钟落后的客户端在首次被拒后立即追平。
   */
  const nextTimestamp = () =>
    Math.max(Date.now(), lastAcceptedTimestampRef.current + 1);

  const setOnlineCount = useCollaborationStore((s) => s.setOnlineCount);
  const setOverwrittenMessage = useCollaborationStore((s) => s.setOverwrittenMessage);
  const setSchema = useEditorStore((s) => s.setSchema);
  const updateTranslation = useEditorStore((s) => s.updateTranslation);
  const applyLocaleSync = useEditorStore((s) => s.applyLocaleSync);
  const setTranslation = useEditorStore((s) => s.setTranslation);
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
      // 记录服务端已接受的时间戳，用于校准后续提交（见 nextTimestamp）
      if (typeof data.acceptedTimestamp === 'number') {
        lastAcceptedTimestampRef.current = Math.max(
          lastAcceptedTimestampRef.current,
          data.acceptedTimestamp
        );
      }
      if (data.acceptedData) {
        setSchema(data.acceptedData.schema);
        applyLocaleSync(data.acceptedData.addedKeys, data.acceptedData.removedKeys, data.acceptedData.renameMap);
      }
      setOverwrittenMessage('Schema 已被其他用户更新，已同步到最新版本');
      setTimeout(() => setOverwrittenMessage(null), 5000);
    });

    // 接收其他客户端的译文变更（用 setTranslation 而非 updateTranslation：
    // 远端来源不应把本地标记为「未保存」）
    socket.on('locale:updated', (data: LocaleUpdatedPayload) => {
      if (data.lang) {
        setTranslation(data.lang, data.translations);
      }
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
  }, [projectId, setOnlineCount, setOverwrittenMessage, setSchema, updateTranslation, setTranslation, applyLocaleSync]);

  const sendUpdate = (data: { type: 'schema' | 'locale'; lang?: string; data: any }) => {
    socketRef.current?.emit('update', { projectId, ...data });
  };

  // 时间戳与 clientId 在此统一注入：校准逻辑与 schema:rejected 处理器同处一处，
  // 调用方无需关心时钟问题。同一次编辑的 schema:updated 与 schema:save 各自取值，
  // 服务端 gate 用 < 比较，故两者取到相同或递增的值都不会自我阻塞。
  const sendSchemaUpdated = (
    data: Omit<SchemaUpdatedPayload, 'projectId' | 'timestamp' | 'clientId'>
  ) => {
    socketRef.current?.emit('schema:updated', {
      projectId,
      ...data,
      timestamp: nextTimestamp(),
      clientId: socketRef.current?.id || '',
    });
  };

  const sendSchemaSave = (data: { schema: Record<string, any>; addedKeys: string[]; removedKeys: string[] }) => {
    savingStart$.next(Date.now());
    setSaveStatus('saving');
    socketRef.current?.emit('schema:save', {
      projectId,
      ...data,
      timestamp: nextTimestamp(),
    });
  };

  const sendLocaleUpdated = (lang: string, translations: Record<string, any>) => {
    socketRef.current?.emit('locale:updated', {
      projectId,
      lang,
      translations,
      timestamp: nextTimestamp(),
      clientId: socketRef.current?.id || '',
    });
  };

  const sendLocaleSave = (lang: string, translations: Record<string, any>) => {
    savingStart$.next(Date.now());
    setSaveStatus('saving');
    socketRef.current?.emit('locale:save', {
      projectId,
      lang,
      translations,
      timestamp: nextTimestamp(),
      clientId: socketRef.current?.id || '',
    });
  };

  return { socket: socketRef.current, socketId, sendUpdate, sendSchemaUpdated, sendSchemaSave, sendLocaleUpdated, sendLocaleSave };
}
