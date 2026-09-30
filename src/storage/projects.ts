import type { ProjectExport, StoredProject } from '../score/types'

const databaseName = 'rehearsal-stand'
const storeName = 'projects'
const version = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, version)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: 'id' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function requestPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function listProjects(): Promise<StoredProject[]> {
  const database = await openDatabase()
  try {
    const result = await requestPromise(database.transaction(storeName, 'readonly').objectStore(storeName).getAll())
    return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  } finally {
    database.close()
  }
}

export async function saveProject(project: StoredProject): Promise<void> {
  const database = await openDatabase()
  try {
    await requestPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).put(project))
  } finally {
    database.close()
  }
}

export async function deleteProject(id: string): Promise<void> {
  const database = await openDatabase()
  try {
    await requestPromise(database.transaction(storeName, 'readwrite').objectStore(storeName).delete(id))
  } finally {
    database.close()
  }
}

export function createProject(name: string, originalXml: string): StoredProject {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    originalXml,
    marks: [],
    updatedAt: now,
    createdAt: now,
  }
}

export function exportProject(project: StoredProject): ProjectExport {
  return {
    format: 'local-rehearsal-project/v1',
    project: JSON.parse(JSON.stringify(project)) as StoredProject,
  }
}

export function downloadText(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export async function importProjectFile(file: File): Promise<StoredProject> {
  const text = await file.text()
  const parsed = JSON.parse(text) as ProjectExport
  if (parsed.format !== 'local-rehearsal-project/v1' || !parsed.project?.originalXml) {
    throw new Error('不是有效的 local-rehearsal-project/v1 工程文件。')
  }
  return {
    ...parsed.project,
    id: crypto.randomUUID(),
    updatedAt: new Date().toISOString(),
  }
}
