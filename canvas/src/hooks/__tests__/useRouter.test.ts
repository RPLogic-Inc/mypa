import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useRouter } from '../useRouter';

describe('useRouter', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/');
  });

  it('defaults to chat view on root path', () => {
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('chat');
  });

  it('parses /chat path', () => {
    window.history.replaceState({}, '', '/chat');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('chat');
  });

  it('parses /inbox path', () => {
    window.history.replaceState({}, '', '/inbox');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('inbox');
  });

  it('parses /artifacts path', () => {
    window.history.replaceState({}, '', '/artifacts');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('artifacts');
  });

  it('parses /library path', () => {
    window.history.replaceState({}, '', '/library');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('library');
  });

  it('parses /settings path', () => {
    window.history.replaceState({}, '', '/settings');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('settings');
  });

  it('maps /stream to inbox (backwards compat)', () => {
    window.history.replaceState({}, '', '/stream');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('inbox');
  });

  it('maps /comms to inbox (backwards compat)', () => {
    window.history.replaceState({}, '', '/comms');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('inbox');
  });

  it('defaults unknown paths to chat', () => {
    window.history.replaceState({}, '', '/unknown');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('chat');
  });

  it('updates URL when setActiveView is called', () => {
    const { result } = renderHook(() => useRouter());

    act(() => {
      result.current.setActiveView('library');
    });

    expect(result.current.activeView).toBe('library');
    expect(window.location.pathname).toBe('/library');
  });

  it('handles OpenClaw canvas base path', () => {
    window.history.replaceState({}, '', '/__openclaw__/canvas/inbox');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('inbox');
  });

  it('handles OpenClaw canvas root path', () => {
    window.history.replaceState({}, '', '/__openclaw__/canvas/');
    const { result } = renderHook(() => useRouter());
    expect(result.current.activeView).toBe('chat');
  });

  it('responds to popstate events', () => {
    const { result } = renderHook(() => useRouter());

    act(() => {
      result.current.setActiveView('library');
    });
    act(() => {
      result.current.setActiveView('settings');
    });

    expect(result.current.activeView).toBe('settings');

    // Simulate popstate with state
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { view: 'library' } }));
    });

    expect(result.current.activeView).toBe('library');
  });

  it('handles popstate with no state by parsing URL', () => {
    window.history.replaceState({}, '', '/artifacts');
    const { result } = renderHook(() => useRouter());

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }));
    });

    expect(result.current.activeView).toBe('artifacts');
  });
});
