'use client';

import { useEditorStore } from '@/stores/editorStore';
import { CheckCircleFilled, CloseCircleFilled, ExclamationCircleFilled, SyncOutlined } from '@ant-design/icons';

/**
 * Locale 编辑器状态指示器 — 与 SchemaEditor 工具栏高度对齐
 * 渲染在 LanguageTabs 下方，与左侧 SchemaEditor 的工具栏同一行
 */
export default function LocaleStatusBar() {
  const saveStatus = useEditorStore((s) => s.saveStatus);
  const saveError = useEditorStore((s) => s.saveError);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        height: 32,
        padding: '0 8px',
        boxSizing: 'border-box',
        borderBottom: '1px solid #303030',
        background: '#252526',
        flexShrink: 0,
        gap: 6,
      }}
    >
      {saveStatus === 'saving' ? (
        <span style={{ fontSize: 11, color: '#1890ff', display: 'flex', alignItems: 'center', gap: 4 }}>
          <SyncOutlined spin style={{ color: '#1890ff' }} />
          保存中...
        </span>
      ) : saveStatus === 'error' ? (
        <span style={{ fontSize: 11, color: '#f44747', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CloseCircleFilled style={{ color: '#f44747' }} />
          保存失败{saveError ? `: ${saveError}` : ''}
        </span>
      ) : saveStatus === 'dirty' ? (
        <span style={{ fontSize: 11, color: '#d4b106', display: 'flex', alignItems: 'center', gap: 4 }}>
          <ExclamationCircleFilled style={{ color: '#d4b106' }} />
          未保存
        </span>
      ) : (
        <span style={{ fontSize: 11, color: '#4ec9b0', display: 'flex', alignItems: 'center', gap: 4 }}>
          <CheckCircleFilled style={{ color: '#4ec9b0' }} />
          已保存
        </span>
      )}
    </div>
  );
}