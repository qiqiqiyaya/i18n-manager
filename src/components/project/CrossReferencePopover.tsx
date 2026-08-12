'use client';

import { useState } from 'react';
import { Tag, Typography } from 'antd';
import { CopyOutlined, ArrowRightOutlined } from '@ant-design/icons';
import SearchHighlight from '@/components/common/SearchHighlight';
import type { LookupResult, SchemaHit, TranslationHit } from '@/lib/reference-lookup';

const { Text } = Typography;

/** 展开态浮层与折叠态标记的最大尺寸（用于视口钳制） */
const PANEL_WIDTH = 340;
const PANEL_HEIGHT = 320;
const GAP = 14;
const MARGIN = 8;
/** 超过该条数折叠，显示"还有 N 条…" */
const MAX_VISIBLE = 6;

interface CrossReferencePopoverProps {
  mode: 'expanded' | 'collapsed';
  /** 屏幕坐标锚点 */
  anchor: { x: number; y: number };
  token: string;
  lookup: LookupResult;
  /** 挂到当前渲染层（展开浮层或折叠标记）的根节点，供页面 mousemove 桥接测量 */
  layerRef?: React.Ref<HTMLDivElement>;
  onJumpSchema: (key: string) => void;
  onJumpTranslation: (lang: string, key: string) => void;
  onCopy: (text: string) => void;
  onHoverMarker: () => void;
  onEnterPopover: () => void;
  onLeave: () => void;
}

type DisplayItem =
  | { kind: 'schema'; hit: SchemaHit }
  | { kind: 'translation'; hit: TranslationHit };

/** 把命中折叠到可见数量内，返回可见项与隐藏数量 */
function foldItems(items: DisplayItem[]): { visible: DisplayItem[]; hiddenCount: number } {
  if (items.length <= MAX_VISIBLE) return { visible: items, hiddenCount: 0 };
  return { visible: items.slice(0, MAX_VISIBLE), hiddenCount: items.length - MAX_VISIBLE };
}

/** 按语言分组译文命中（保持首次出现顺序），供分组展示；输入须为已过滤的译文项 */
function groupByLang(
  hits: Array<{ kind: 'translation'; hit: TranslationHit }>
): Array<{ lang: string; items: Array<{ kind: 'translation'; hit: TranslationHit }> }> {
  const map = new Map<string, Array<{ kind: 'translation'; hit: TranslationHit }>>();
  for (const item of hits) {
    const lang = item.hit.lang;
    const list = map.get(lang);
    if (list) list.push(item);
    else map.set(lang, [item]);
  }
  return Array.from(map.entries()).map(([lang, items]) => ({ lang, items }));
}

/**
 * 「速查」浮层：Schema + 译文双向引用展示。
 * - 展开态：固定层，Schema/译文两段，>6 条折叠 + 内滚；每行复制按钮 + 双击值复制 + 跳转
 * - 折叠态：屏幕固定小标记，悬停恢复
 * 无命中时渲染 null（由调用方保证 MISS 时不挂载）。
 */
export default function CrossReferencePopover({
  mode,
  anchor,
  token,
  lookup,
  layerRef,
  onJumpSchema,
  onJumpTranslation,
  onCopy,
  onHoverMarker,
  onEnterPopover,
  onLeave,
}: CrossReferencePopoverProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const items: DisplayItem[] = [
    ...lookup.schemaHits.map((hit) => ({ kind: 'schema' as const, hit })),
    ...lookup.translationHits.map((hit) => ({ kind: 'translation' as const, hit })),
  ];

  if (items.length === 0) return null;

  const { visible, hiddenCount } = foldItems(items);
  const visibleSchema = visible.filter((i) => i.kind === 'schema');
  const visibleTranslation = visible.filter((i) => i.kind === 'translation');
  const langGroups = groupByLang(visibleTranslation);

  const handleCopy = (text: string, keyLabel: string) => {
    onCopy(text);
    setCopiedKey(keyLabel);
    setTimeout(() => setCopiedKey((k) => (k === keyLabel ? null : k)), 1200);
  };

  // 视口钳制：优先锚点下方，空间不足则翻到上方
  const left = Math.min(Math.max(MARGIN, anchor.x), Math.max(MARGIN, window.innerWidth - PANEL_WIDTH - MARGIN));
  const top =
    anchor.y + GAP + PANEL_HEIGHT < window.innerHeight
      ? anchor.y + GAP
      : Math.max(MARGIN, anchor.y - PANEL_HEIGHT - GAP);

  // ---------- 折叠态：小标记 ----------
  if (mode === 'collapsed') {
    return (
      <div
        ref={layerRef}
        role="button"
        aria-label="恢复速查浮层"
        title="悬停恢复速查"
        onMouseEnter={onHoverMarker}
        onMouseLeave={onLeave}
        style={{
          position: 'fixed',
          left: Math.max(MARGIN, anchor.x),
          top: Math.max(MARGIN, anchor.y),
          zIndex: 1000,
          padding: '2px 8px',
          borderRadius: 10,
          background: 'rgba(22,119,255,0.15)',
          border: '1px solid #91caff',
          color: '#1677ff',
          fontSize: 12,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          maxWidth: 200,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        速查 · {token}
      </div>
    );
  }

  // ---------- 展开态：完整浮层 ----------
  return (
    <div
      ref={layerRef}
      data-role="reference-popover"
      onMouseEnter={onEnterPopover}
      onMouseLeave={onLeave}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 1000,
        width: PANEL_WIDTH,
        maxHeight: PANEL_HEIGHT,
        overflowY: 'auto',
        background: '#fff',
        border: '1px solid #e0e0e0',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
        padding: '8px 0',
        fontSize: 13,
      }}
    >
      <div style={{ padding: '0 12px 6px', borderBottom: '1px solid #f0f0f0', marginBottom: 6 }}>
        <Text strong style={{ fontSize: 13, marginRight: 8 }}>速查</Text>
        <Text code style={{ fontSize: 12 }}>{token}</Text>
      </div>

      {visibleSchema.length > 0 && (
        <div style={{ padding: '0 4px' }}>
          <div style={{ padding: '2px 8px', color: '#888', fontSize: 12 }}>Schema</div>
          {visibleSchema.map((item) => {
            const hit = (item as { hit: SchemaHit }).hit;
            const label = `复制 ${hit.key}`;
            return (
              <div key={`schema.${hit.key}`} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px' }}>
                <code style={{ flexShrink: 0, color: '#333', fontSize: 12 }}><SearchHighlight text={hit.key} keyword={token} /></code>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666', fontSize: 12 }}>
                  <SearchHighlight text={hit.description} keyword={token} />
                </span>
                <button type="button" aria-label={label} title={label}
                  onClick={() => handleCopy(hit.description, label)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1677ff', fontSize: 13 }}>
                  {copiedKey === label ? <Text type="success" style={{ fontSize: 11 }}>已复制</Text> : <CopyOutlined />}
                </button>
                <button type="button" aria-label={`跳转 ${hit.key}`} title="跳转到主表 Schema"
                  onClick={() => onJumpSchema(hit.key)}
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1677ff', fontSize: 13 }}>
                  <ArrowRightOutlined />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {langGroups.length > 0 && (
        <div style={{ padding: '0 4px' }}>
          <div style={{ padding: '2px 8px', color: '#888', fontSize: 12 }}>译文</div>
          {langGroups.map(({ lang, items: groupItems }) => (
            <div key={lang}>
              {groupItems.map((item) => {
                const hit = (item as { hit: TranslationHit }).hit;
                const label = `复制 ${lang} ${hit.key}`;
                return (
                  <div key={`${lang}.${hit.key}`} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px' }}>
                    <Tag style={{ flexShrink: 0, marginRight: 0, fontSize: 11 }}>{lang}</Tag>
                    <code style={{ flexShrink: 0, color: '#999', fontSize: 11 }}>{hit.key}</code>
                    <span title="双击复制" onDoubleClick={() => handleCopy(hit.value, label)}
                      style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333', cursor: 'default' }}>
                      <SearchHighlight text={hit.value} keyword={token} />
                    </span>
                    <button type="button" aria-label={label} title={label}
                      onClick={() => handleCopy(hit.value, label)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1677ff', fontSize: 13 }}>
                      {copiedKey === label ? <Text type="success" style={{ fontSize: 11 }}>已复制</Text> : <CopyOutlined />}
                    </button>
                    <button type="button" aria-label={`跳转 ${lang} ${hit.key}`} title={`跳转到 ${lang}`}
                      onClick={() => onJumpTranslation(lang, hit.key)}
                      style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#1677ff', fontSize: 13 }}>
                      <ArrowRightOutlined />
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {hiddenCount > 0 && (
        <div style={{ padding: '4px 12px', color: '#999', fontSize: 12, textAlign: 'center', borderTop: '1px solid #f5f5f5', marginTop: 4 }}>
          还有 {hiddenCount} 条…
        </div>
      )}
    </div>
  );
}
