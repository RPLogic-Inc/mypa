import { useState, useEffect, useCallback } from 'react';
import * as storage from '../lib/artifactStorage';
import type { ArtifactRef } from '../types';

export function useArtifacts() {
  const [artifacts, setArtifacts] = useState<ArtifactRef[]>([]);

  useEffect(() => {
    storage.listArtifacts().then(setArtifacts);
  }, []);

  const addArtifact = useCallback(async (artifact: ArtifactRef) => {
    await storage.saveArtifact(artifact);
    setArtifacts(prev => [artifact, ...prev.filter(a => a.id !== artifact.id)]);
  }, []);

  const updateArtifact = useCallback(async (artifact: ArtifactRef) => {
    await storage.saveArtifact(artifact);
    setArtifacts(prev => prev.map(a => a.id === artifact.id ? artifact : a));
  }, []);

  const removeArtifact = useCallback(async (id: string) => {
    await storage.deleteArtifact(id);
    setArtifacts(prev => prev.filter(a => a.id !== id));
  }, []);

  return { artifacts, addArtifact, updateArtifact, removeArtifact };
}
