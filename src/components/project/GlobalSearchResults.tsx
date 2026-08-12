'use client';

import { Tag, Empty } from 'antd';
import SearchHighlight from '@/components/common/SearchHighlight';
import type { SearchResult } from '@/hooks/useSearch';

interface GlobalSearchResultsProps {
  results: SearchResult[];
  keyword: string;
  onSelect: (result: SearchResult) => void;
}

/** 全局跨语言搜索的下拉结果列表：语言 Tag + 键路径 + 高亮值，点击回调 */
export default function GlobalSearchResults({
  results,
  keyword,
  onSelect,
}: GlobalSearchResultsProps) {
  if (results.length === 0) {
    return (
      <div style={{ minWidth: 320, padding: '12px 0' }}>
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="无匹配结果" />
      </div>
    );
  }

  return (
    <div style={{ minWidth: 320, maxHeight: 320, overflowY: 'auto' }}>
      {results.map((result, index) => (
        <button
          key={`${result.lang}.${result.key}.${index}`}
          type="button"
          onClick={() => onSelect(result)}
          className="hover:bg-[#f5f5f5]"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 12px',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            textAlign: 'left',
            fontSize: 13,
          }}
        >
          <Tag style={{ flexShrink: 0, marginRight: 0, fontSize: 11 }}>{result.lang}</Tag>
          <code style={{ flexShrink: 0, color: '#888', fontSize: 12 }}>{result.key}</code>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#333' }}>
            <SearchHighlight text={result.value} keyword={keyword} />
          </span>
        </button>
      ))}
    </div>
  );
}
