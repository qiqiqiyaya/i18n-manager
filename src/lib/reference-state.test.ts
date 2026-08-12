import { describe, expect, it } from 'vitest';
import { initialState, referenceReducer, type ReferenceToken } from './reference-state';

const TOKEN_A: ReferenceToken = { token: 'app.title', anchor: { x: 100, y: 200 }, source: 'locale' };
const TOKEN_B: ReferenceToken = { token: 'login', anchor: { x: 50, y: 60 }, source: 'schema' };

describe('referenceReducer', () => {
  it('starts hidden with no token', () => {
    expect(initialState).toEqual({ mode: 'hidden', token: null });
  });

  it('SET_TOKEN shows expanded popover', () => {
    const state = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    expect(state).toEqual({ mode: 'expanded', token: TOKEN_A });
  });

  it('SET_TOKEN with a different token refreshes content', () => {
    const expanded = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    const state = referenceReducer(expanded, { type: 'SET_TOKEN', token: TOKEN_B });
    expect(state.mode).toBe('expanded');
    expect(state.token).toEqual(TOKEN_B);
  });

  it('MISS hides and clears token', () => {
    const expanded = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    const state = referenceReducer(expanded, { type: 'MISS' });
    expect(state).toEqual({ mode: 'hidden', token: null });
  });

  it('SCROLL collapses expanded to marker, keeping token', () => {
    const expanded = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    const state = referenceReducer(expanded, { type: 'SCROLL' });
    expect(state).toEqual({ mode: 'collapsed', token: TOKEN_A });
  });

  it('SCROLL while hidden stays hidden', () => {
    const state = referenceReducer(initialState, { type: 'SCROLL' });
    expect(state.mode).toBe('hidden');
  });

  it('SCROLL while already collapsed stays collapsed', () => {
    const collapsed = referenceReducer(
      referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A }),
      { type: 'SCROLL' }
    );
    const state = referenceReducer(collapsed, { type: 'SCROLL' });
    expect(state).toEqual({ mode: 'collapsed', token: TOKEN_A });
  });

  it('HOVER_MARKER re-expands from collapsed', () => {
    const collapsed = referenceReducer(
      referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A }),
      { type: 'SCROLL' }
    );
    const state = referenceReducer(collapsed, { type: 'HOVER_MARKER' });
    expect(state).toEqual({ mode: 'expanded', token: TOKEN_A });
  });

  it('HOVER_MARKER while hidden stays hidden', () => {
    const state = referenceReducer(initialState, { type: 'HOVER_MARKER' });
    expect(state.mode).toBe('hidden');
  });

  it('ENTER_POPOVER keeps current expanded state (cancels pending close)', () => {
    const expanded = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    const state = referenceReducer(expanded, { type: 'ENTER_POPOVER' });
    expect(state).toEqual(expanded);
  });

  it('LEAVE hides and clears token', () => {
    const expanded = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    const state = referenceReducer(expanded, { type: 'LEAVE' });
    expect(state).toEqual({ mode: 'hidden', token: null });
  });

  it('CLOSE hides and clears token', () => {
    const expanded = referenceReducer(initialState, { type: 'SET_TOKEN', token: TOKEN_A });
    const state = referenceReducer(expanded, { type: 'CLOSE' });
    expect(state).toEqual({ mode: 'hidden', token: null });
  });
});
