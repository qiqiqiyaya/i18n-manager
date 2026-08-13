import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CrossReferencePopover from './CrossReferencePopover';
import type { LookupResult } from '@/lib/reference-lookup';

const LOOKUP: LookupResult = {
  schemaHits: [
    { key: 'app.login', description: '登录按钮', matchType: 'segment' },
  ],
  translationHits: [
    { lang: 'zh-CN', key: 'app.login', value: '登录', matchType: 'key-segment' },
    { lang: 'en-US', key: 'app.login', value: 'Login', matchType: 'key-segment' },
  ],
};

const BASE = {
  mode: 'expanded' as const,
  anchor: { x: 100, y: 200 },
  token: 'login',
  lookup: LOOKUP,
  onJumpSchema: vi.fn(),
  onJumpTranslation: vi.fn(),
  onCopy: vi.fn(),
  onHoverMarker: vi.fn(),
  onEnterPopover: vi.fn(),
  onLeave: vi.fn(),
};

describe('CrossReferencePopover', () => {
  it('renders schema and translation sections', () => {
    render(<CrossReferencePopover {...BASE} />);
    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByText('译文')).toBeInTheDocument();
  });

  it('renders schema hits with key and description', () => {
    render(<CrossReferencePopover {...BASE} />);
    expect(screen.getAllByText('app.login').length).toBeGreaterThan(0);
    expect(screen.getByText('登录按钮')).toBeInTheDocument();
  });

  it('renders translation hits grouped by language', () => {
    render(<CrossReferencePopover {...BASE} />);
    expect(screen.getByText('zh-CN')).toBeInTheDocument();
    expect(screen.getByText('en-US')).toBeInTheDocument();
    expect(screen.getByText('登录')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
  });

  it('jumps to schema on schema jump button', async () => {
    const user = userEvent.setup();
    render(<CrossReferencePopover {...BASE} />);
    await user.click(screen.getByRole('button', { name: '跳转 app.login' }));
    expect(BASE.onJumpSchema).toHaveBeenCalledWith('app.login');
  });

  it('jumps to translation on translation jump button', async () => {
    const user = userEvent.setup();
    render(<CrossReferencePopover {...BASE} />);
    await user.click(screen.getByRole('button', { name: '跳转 en-US app.login' }));
    expect(BASE.onJumpTranslation).toHaveBeenCalledWith('en-US', 'app.login');
  });

  it('copies via copy button and shows transient feedback', () => {
    vi.useFakeTimers();
    try {
      render(<CrossReferencePopover {...BASE} />);
      fireEvent.click(screen.getByRole('button', { name: '复制 zh-CN app.login' }));
      expect(BASE.onCopy).toHaveBeenCalledWith('登录');
      expect(screen.getByText('已复制')).toBeInTheDocument();
      // 反馈 1200ms 后自动消失
      act(() => { vi.advanceTimersByTime(1200); });
      expect(screen.queryByText('已复制')).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('copies schema description via schema copy button', async () => {
    const user = userEvent.setup();
    render(<CrossReferencePopover {...BASE} />);
    await user.click(screen.getByRole('button', { name: '复制 app.login' }));
    expect(BASE.onCopy).toHaveBeenCalledWith('登录按钮');
  });

  it('copies via double-click on value', async () => {
    const user = userEvent.setup();
    render(<CrossReferencePopover {...BASE} />);
    await user.dblClick(screen.getByText('Login'));
    expect(BASE.onCopy).toHaveBeenCalledWith('Login');
  });

  it('renders all hits without folding when more than 6 (Q2-A: scroll instead of fold)', () => {
    const many = {
      ...LOOKUP,
      translationHits: Array.from({ length: 8 }, (_, i) => ({
        lang: 'zh-CN', key: `k${i}`, value: `v${i}`, matchType: 'value-contains' as const,
      })),
    };
    render(<CrossReferencePopover {...BASE} lookup={many} />);
    // 全部命中直接渲染，无「还有 N 条…」折叠提示
    expect(screen.getByText('k7')).toBeInTheDocument();
    expect(screen.getByText('v7')).toBeInTheDocument();
    expect(screen.queryByText(/还有/)).not.toBeInTheDocument();
  });

  it('renders collapsed marker instead of popover content', () => {
    render(<CrossReferencePopover {...BASE} mode="collapsed" />);
    expect(screen.getByRole('button', { name: '恢复速查浮层' })).toBeInTheDocument();
    expect(screen.queryByText('Schema')).not.toBeInTheDocument();
  });

  it('marker hover triggers onHoverMarker and leave triggers onLeave', async () => {
    const user = userEvent.setup();
    render(<CrossReferencePopover {...BASE} mode="collapsed" />);
    const marker = screen.getByRole('button', { name: '恢复速查浮层' });
    await user.hover(marker);
    expect(BASE.onHoverMarker).toHaveBeenCalled();
    await user.unhover(marker);
    expect(BASE.onLeave).toHaveBeenCalled();
  });

  it('popover mouse enter/leave triggers hover callbacks', async () => {
    const user = userEvent.setup();
    const { container } = render(<CrossReferencePopover {...BASE} />);
    const popover = container.querySelector('[data-role="reference-popover"]') as HTMLElement;
    await user.hover(popover);
    expect(BASE.onEnterPopover).toHaveBeenCalled();
    await user.unhover(popover);
    expect(BASE.onLeave).toHaveBeenCalled();
  });

  it('renders nothing when no hits at all', () => {
    const { container } = render(
      <CrossReferencePopover {...BASE} lookup={{ schemaHits: [], translationHits: [] }} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('clamps to viewport when anchor is near bottom/right edges', () => {
    const { container } = render(
      <CrossReferencePopover {...BASE} anchor={{ x: 5000, y: 5000 }} />
    );
    const popover = container.querySelector('[data-role="reference-popover"]') as HTMLElement;
    // left 按最大宽度 PANEL_MAX_WIDTH 钳制到 innerWidth - PANEL_MAX_WIDTH - MARGIN；top 空间不足翻到锚点上方
    expect(parseInt(popover.style.left, 10)).toBe(window.innerWidth - 520 - 8);
    expect(parseInt(popover.style.top, 10)).toBe(5000 - 320 - 14);
  });

  it('sizes panel to content with viewport max-width clamp (Q1-A)', () => {
    const { container } = render(<CrossReferencePopover {...BASE} />);
    const popover = container.querySelector('[data-role="reference-popover"]') as HTMLElement;
    // width: max-content + min-width 300，max-width 取 min(520, 视口-2*MARGIN)；视口 1024 时即 520
    expect(popover.style.width).toBe('max-content');
    expect(popover.style.minWidth).toBe('300px');
    expect(popover.style.maxWidth).toBe('520px');
  });

  it('scrolls when content overflows instead of folding (Q2-A)', () => {
    const { container } = render(<CrossReferencePopover {...BASE} />);
    const popover = container.querySelector('[data-role="reference-popover"]') as HTMLElement;
    expect(popover.style.maxHeight).toBe('320px');
    expect(popover.style.overflowY).toBe('auto');
  });
});
