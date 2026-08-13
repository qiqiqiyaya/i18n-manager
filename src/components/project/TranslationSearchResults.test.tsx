import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import TranslationSearchResults from './TranslationSearchResults';
import type { SearchResult } from '@/hooks/useSearch';

const results: SearchResult[] = [
  { lang: 'zh-CN', key: 'app.title', value: '登录' },
  { lang: 'en-US', key: 'app.title', value: 'Login' },
];

describe('TranslationSearchResults', () => {
  it('renders lang tag, key path, and value for each result', () => {
    render(<TranslationSearchResults results={results} keyword="" onSelect={vi.fn()} />);

    expect(screen.getByText('zh-CN')).toBeInTheDocument();
    expect(screen.getByText('en-US')).toBeInTheDocument();
    expect(screen.getAllByText('app.title')).toHaveLength(2);
    expect(screen.getByText('登录')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('highlights keyword matches in values', () => {
    const { container } = render(
      <TranslationSearchResults results={results} keyword="Log" onSelect={vi.fn()} />
    );

    const marks = container.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('Log');
    // 完整值仍渲染（未匹配部分不被吞掉）
    expect(container.textContent).toContain('Login');
  });

  it('shows empty state when no results match', () => {
    render(<TranslationSearchResults results={[]} keyword="xyz" onSelect={vi.fn()} />);

    expect(screen.getByText('无匹配结果')).toBeInTheDocument();
  });

  it('calls onSelect with the clicked result', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<TranslationSearchResults results={[results[0]]} keyword="" onSelect={onSelect} />);

    await user.click(screen.getByRole('button', { name: /zh-CN/ }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(results[0]);
  });
});
