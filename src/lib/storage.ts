import type { RehearsalMarkPayload, StoredProject } from '../types/score';

const DB_NAME = 'musicxml-rehearsal-stand';
const DB_VERSION = 1;
const STORE = 'projects';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开 IndexedDB'));
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = operation(transaction.objectStore(STORE));
    request.onsuccess = () => {
      transaction.oncomplete = () => {
        db.close();
        resolve(request.result);
      };
    };
    request.onerror = () => {
      transaction.abort();
      db.close();
      reject(request.error ?? new Error('IndexedDB 操作失败'));
    };
  });
}

export async function saveProject(project: StoredProject): Promise<void> {
  await withStore('readwrite', (store) => store.put({ ...project, updatedAt: Date.now() }));
}

export async function loadProjects(): Promise<StoredProject[]> {
  const result = await withStore<StoredProject[]>('readonly', (store) => store.getAll());
  return result.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteProject(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
}

export function createProject(title: string, xml: string): StoredProject {
  return {
    id: crypto.randomUUID(),
    title,
    xml,
    marks: [],
    updatedAt: Date.now()
  };
}

export function createMark(input: Omit<RehearsalMarkPayload, 'id' | 'createdAt'>): RehearsalMarkPayload {
  return { ...input, id: crypto.randomUUID(), createdAt: Date.now() };
}
