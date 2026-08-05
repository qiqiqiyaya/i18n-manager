import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import SearchHighlight from './SearchHighlight';

describe('SearchHighlight', () => {
  it('renders text when no keyword', () => {
    const { container } = render(<SearchHighlight text="Hello World" keyword="" />);
    expect(container.textContent).toBe('Hello World');
    // no <mark> elements
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('highlights matching keyword', () => {
    render(<SearchHighlight text="Hello World" keyword="World" />);
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('World');
  });

  it('is case-insensitive', () => {
    render(<SearchHighlight text="Hello World" keyword="world" />);
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('World');
  });

  it('highlights multiple occurrences', () => {
    render(<SearchHighlight text="foo bar foo baz" keyword="foo" />);
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(2);
    expect(marks[0].textContent).toBe('foo');
    expect(marks[1].textContent).toBe('foo');
  });

  it('handles special regex characters in keyword', () => {
    render(<SearchHighlight text="price: $10.00" keyword="$10.00" />);
    const marks = document.querySelectorAll('mark');
    expect(marks).toHaveLength(1);
    expect(marks[0].textContent).toBe('$10.00');
  });

  it('returns full text when keyword has no match', () => {
    const { container } = render(<SearchHighlight text="Hello World" keyword="xyz" />);
    expect(container.textContent).toBe('Hello World');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });

  it('handles empty text', () => {
    const { container } = render(<SearchHighlight text="" keyword="test" />);
    expect(container.textContent).toBe('');
  });

  it('handles whitespace-only keyword', () => {
    const { container } = render(<SearchHighlight text="Hello World" keyword="   " />);
    expect(container.textContent).toBe('Hello World');
    expect(container.querySelectorAll('mark')).toHaveLength(0);
  });
});
