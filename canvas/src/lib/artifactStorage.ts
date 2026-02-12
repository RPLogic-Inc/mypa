import type { ArtifactRef } from '../types';

const DB_PREFIX = 'mypa-artifacts';
const STORE_NAME = 'artifacts';
const DB_VERSION = 1;

let currentUserId: string | null = null;

export function setArtifactUserId(userId: string | null): void {
  currentUserId = userId;
}

function getDbName(): string {
  if (!currentUserId) return DB_PREFIX;
  return `${DB_PREFIX}-${currentUserId}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(getDbName(), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt');
        store.createIndex('type', 'type');
        store.createIndex('status', 'status');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listArtifacts(): Promise<ArtifactRef[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).index('createdAt').getAll();
    request.onsuccess = () => resolve((request.result as ArtifactRef[]).reverse());
    request.onerror = () => reject(request.error);
  });
}

export async function saveArtifact(artifact: ArtifactRef): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(artifact);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteArtifact(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
