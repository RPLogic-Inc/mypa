import type { AIChatSession, AIChatMessage } from '../types';

const DB_PREFIX = 'mypa-chat';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

/** Current user ID — must be set via setCurrentUserId() before any storage calls. */
let currentUserId: string | null = null;

/** Set the user ID to namespace the IndexedDB database. Call on login. */
export function setCurrentUserId(userId: string | null): void {
  currentUserId = userId;
}

function getDbName(): string {
  if (!currentUserId) return DB_PREFIX; // fallback for legacy sessions
  return `${DB_PREFIX}-${currentUserId}`;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(getDbName(), DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function listSessions(): Promise<AIChatSession[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.index('updatedAt').getAll();
    request.onsuccess = () => resolve((request.result as AIChatSession[]).reverse());
    request.onerror = () => reject(request.error);
  });
}

export async function getSession(id: string): Promise<AIChatSession | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as AIChatSession | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveSession(session: AIChatSession): Promise<void> {
  // Strip ephemeral base64DataUrl from attachments before persisting
  const clean: AIChatSession = {
    ...session,
    messages: session.messages.map(m => {
      if (!m.attachments?.length) return m;
      return {
        ...m,
        attachments: m.attachments.map(({ base64DataUrl: _, ...rest }) => rest),
      };
    }),
  };
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(clean);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function createSession(): AIChatSession {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: 'New Chat',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

export function generateTitle(messages: AIChatMessage[]): string {
  const firstUserMsg = messages.find(m => m.role === 'user');
  if (!firstUserMsg) return 'New Chat';
  const text = firstUserMsg.content.slice(0, 50);
  return text.length < firstUserMsg.content.length ? text + '...' : text;
}
