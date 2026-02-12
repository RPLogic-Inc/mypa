import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  deleteArtifact,
  listArtifacts,
  saveArtifact,
  setArtifactUserId,
} from './artifactStorage';
import type { ArtifactRef } from '../types';

function makeArtifact(id: string, createdAt: string): ArtifactRef {
  return {
    id,
    type: 'draft',
    title: id,
    content: `content-${id}`,
    status: 'draft',
    createdAt,
  };
}

describe('artifactStorage', () => {
  beforeEach(() => {
    setArtifactUserId(`test-user-${Math.random().toString(36).slice(2)}`);
  });

  it('saves, lists (newest first), and deletes artifacts', async () => {
    const a1 = makeArtifact('a1', '2026-02-10T10:00:00.000Z');
    const a2 = makeArtifact('a2', '2026-02-11T10:00:00.000Z');

    await saveArtifact(a1);
    await saveArtifact(a2);

    const listed = await listArtifacts();
    expect(listed.map((a) => a.id)).toEqual(['a2', 'a1']);

    await deleteArtifact('a2');
    const afterDelete = await listArtifacts();
    expect(afterDelete.map((a) => a.id)).toEqual(['a1']);
  });

  it('isolates artifact data per user database', async () => {
    setArtifactUserId('user-one');
    await saveArtifact(makeArtifact('u1-item', '2026-02-11T09:00:00.000Z'));

    setArtifactUserId('user-two');
    const userTwoList = await listArtifacts();
    expect(userTwoList).toEqual([]);

    setArtifactUserId('user-one');
    const userOneList = await listArtifacts();
    expect(userOneList.map((a) => a.id)).toEqual(['u1-item']);
  });
});
