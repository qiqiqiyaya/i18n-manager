'use client';

import { useCallback, useEffect, useState } from 'react';
import { Splitter } from 'antd';

/**
 * 左右双栏（主表 Schema / 多语言编辑器）可拖拽分栏 + 分栏比例持久化。
 *
 * - 持久化：localStorage，全局一份（跨项目共享的浏览器本地布局偏好，非项目数据）。
 * - 默认比例：主表 Schema 40% / 多语言 60%（双击分割条也恢复到此）。
 * - 宽度钳制：两栏各 min 25% / max 75%，保证编辑器可用宽度。
 * - 受控模式：`Splitter.Panel size` 由本组件 state 驱动；antd useSizes 在任一 Panel
 *   有 `size` 时以 propSizes 为准，故拖拽中需在 `onResize` 同步更新（见 antd 源码注释）。
 * - 性能：`left`/`right` 由父组件传入、引用稳定；拖拽重渲染时 React 对引用相同的
 *   children 子树直接复用，编辑器子树（SchemaEditor/LocaleEditor → Monaco）不重建。
 */
const STORAGE_KEY = 'i18n-manager:editor-split';
/** 默认分栏：主表 Schema 40% / 多语言 60% */
const DEFAULT_RATIO = 0.4;
/** 宽度钳制下限（两栏各保 25% 可用宽度） */
const MIN_RATIO = 0.25;
/** 宽度钳制上限 */
const MAX_RATIO = 0.75;

const clamp = (v: number) => Math.min(Math.max(v, MIN_RATIO), MAX_RATIO);

interface EditorSplitPaneProps {
  /** 左栏（主表 Schema）内容，由父组件传入保持引用稳定 */
  left: React.ReactNode;
  /** 右栏（多语言编辑器）内容 */
  right: React.ReactNode;
}

export default function EditorSplitPane({ left, right }: EditorSplitPaneProps) {
  // SSR 安全：默认 40/60；挂载后再从 localStorage 恢复已保存比例，避免 hydration 不匹配
  const [ratio, setRatio] = useState(DEFAULT_RATIO);

  useEffect(() => {
    // 挂载后从 localStorage 恢复已保存比例。必须在 mount 后读取：若在 useState 惰性
    // 初始化里读，服务端渲染（flex-basis:40%）与客户端首次渲染（已保存值）不一致 →
    // React hydration mismatch。一次性读取、空依赖、仅一次额外渲染，无级联，故禁用规则。
    let v: number | null = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) v = clamp(parsed);
      }
    } catch {
      // localStorage 不可用（隐私模式 / 被禁用）时静默使用默认值
    }
    if (v !== null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- mount 一次性恢复持久化比例，非级联更新
      setRatio(v);
    }
  }, []);

  // 拖拽中：受控 size 需随 onResize 更新
  const handleResize = useCallback((sizes: number[]) => {
    const [a, b] = sizes;
    if (a + b <= 0) return;
    setRatio(clamp(a / (a + b)));
  }, []);

  // 拖拽结束：持久化到 localStorage（仅在结束时写，避免 mousemove 频繁写入）
  const handleResizeEnd = useCallback((sizes: number[]) => {
    const [a, b] = sizes;
    if (a + b <= 0) return;
    const r = clamp(a / (a + b));
    setRatio(r);
    try {
      localStorage.setItem(STORAGE_KEY, String(r));
    } catch {
      // 静默
    }
  }, []);

  // 双击分割条：重置为默认 40/60
  const handleReset = useCallback(() => {
    setRatio(DEFAULT_RATIO);
    try {
      localStorage.setItem(STORAGE_KEY, String(DEFAULT_RATIO));
    } catch {
      // 静默
    }
  }, []);

  return (
    <Splitter
      onResize={handleResize}
      onResizeEnd={handleResizeEnd}
      onDraggerDoubleClick={handleReset}
    >
      <Splitter.Panel min="25%" max="75%" size={`${Math.round(ratio * 100)}%`}>
        {left}
      </Splitter.Panel>
      <Splitter.Panel min="25%" max="75%" size={`${Math.round((1 - ratio) * 100)}%`}>
        {right}
      </Splitter.Panel>
    </Splitter>
  );
}
