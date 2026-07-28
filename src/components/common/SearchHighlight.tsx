'use client';

import React from 'react';

interface SearchHighlightProps {
  text: string;
  keyword: string;
}

export default function SearchHighlight({ text, keyword }: SearchHighlightProps) {
  if (!keyword.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${escapeRegExp(keyword)})`, 'gi'));

  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === keyword.toLowerCase() ? (
          <mark key={i} style={{ backgroundColor: '#ffd54f', padding: '0 2px' }}>{part}</mark>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        )
      )}
    </>
  );
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
