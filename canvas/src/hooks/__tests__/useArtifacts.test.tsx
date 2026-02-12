import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useArtifacts } from '../useArtifacts';
import type { ArtifactRef } from '../../types';

// Mock the storage module
vi.mock('../../lib/artifactStorage', () => ({
  listArtifacts: vi.fn().mockResolvedValue([]),
  saveArtifact: vi.fn().mockResolvedValue(undefined),
  deleteArtifact: vi.fn().mockResolvedValue(undefined),
}));

import * as storage from '../../lib/artifactStorage';

function makeArtifact(overrides: Partial<ArtifactRef> = {}): ArtifactRef {
  return {
    id: `art-${Math.random().toString(36).slice(2)}`,
    type: 'research',
    title: 'Test Artifact',
    content: 'Test content',
    status: 'draft',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('useArtifacts', () => {
  beforeEach(() => {
    vi.mocked(storage.listArtifacts).mockResolvedValue([]);
    vi.mocked(storage.saveArtifact).mockResolvedValue(undefined);
    vi.mocked(storage.deleteArtifact).mockResolvedValue(undefined);
  });

  it('loads artifacts from storage on mount', async () => {
    const existing = [makeArtifact({ id: 'existing' })];
    vi.mocked(storage.listArtifacts).mockResolvedValue(existing);

    const { result } = renderHook(() => useArtifacts());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.artifacts).toHaveLength(1);
    });
    expect(result.current.artifacts[0].id).toBe('existing');
  });

  it('addArtifact prepends to list and calls storage', async () => {
    const { result } = renderHook(() => useArtifacts());
    await waitFor(() => expect(storage.listArtifacts).toHaveBeenCalled());

    const newArt = makeArtifact({ id: 'new-1', title: 'New' });
    await act(async () => {
      await result.current.addArtifact(newArt);
    });

    expect(storage.saveArtifact).toHaveBeenCalledWith(newArt);
    expect(result.current.artifacts[0].id).toBe('new-1');
  });

  it('addArtifact deduplicates by ID', async () => {
    const existing = [makeArtifact({ id: 'dup', title: 'Old' })];
    vi.mocked(storage.listArtifacts).mockResolvedValue(existing);

    const { result } = renderHook(() => useArtifacts());
    await waitFor(() => expect(result.current.artifacts).toHaveLength(1));

    const updated = makeArtifact({ id: 'dup', title: 'New Version' });
    await act(async () => {
      await result.current.addArtifact(updated);
    });

    expect(result.current.artifacts).toHaveLength(1);
    expect(result.current.artifacts[0].title).toBe('New Version');
  });

  it('updateArtifact replaces the existing entry', async () => {
    const existing = [makeArtifact({ id: 'upd', title: 'Original' })];
    vi.mocked(storage.listArtifacts).mockResolvedValue(existing);

    const { result } = renderHook(() => useArtifacts());
    await waitFor(() => expect(result.current.artifacts).toHaveLength(1));

    const updated = { ...existing[0], title: 'Updated Title' };
    await act(async () => {
      await result.current.updateArtifact(updated);
    });

    expect(storage.saveArtifact).toHaveBeenCalledWith(updated);
    expect(result.current.artifacts[0].title).toBe('Updated Title');
  });

  it('removeArtifact filters by ID', async () => {
    const existing = [
      makeArtifact({ id: 'keep' }),
      makeArtifact({ id: 'remove' }),
    ];
    vi.mocked(storage.listArtifacts).mockResolvedValue(existing);

    const { result } = renderHook(() => useArtifacts());
    await waitFor(() => expect(result.current.artifacts).toHaveLength(2));

    await act(async () => {
      await result.current.removeArtifact('remove');
    });

    expect(storage.deleteArtifact).toHaveBeenCalledWith('remove');
    expect(result.current.artifacts).toHaveLength(1);
    expect(result.current.artifacts[0].id).toBe('keep');
  });
});
