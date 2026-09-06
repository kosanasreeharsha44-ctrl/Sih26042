// ============================================================================
// BhashaSetu - Offline-First Synchronization Engine
// Sync Queue, Conflict Resolution, Auto-retry, Online/Offline detection
// ============================================================================

import { getDB, dbGetAll, dbDelete, dbPut, logAudit, SyncQueueItem } from './db';

type StatusListener = (isOnline: boolean, pendingCount: number) => void;
const listeners: StatusListener[] = [];

let isOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
let isSyncing = false;

export function getSyncStatus(): { isOnline: boolean; isSyncing: boolean } {
  return { isOnline: isOnlineState, isSyncing };
}

export function addSyncListener(cb: StatusListener): () => void {
  listeners.push(cb);
  getPendingSyncCount().then(count => cb(isOnlineState, count));
  return () => {
    const idx = listeners.indexOf(cb);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function notifyListeners(pendingCount: number): void {
  for (const cb of listeners) {
    cb(isOnlineState, pendingCount);
  }
}

export async function getPendingSyncCount(): Promise<number> {
  const queue = await dbGetAll<SyncQueueItem>('sync_queue');
  return queue.length;
}

export async function enqueueSync(item: Omit<SyncQueueItem, 'id' | 'timestamp' | 'retryCount'>): Promise<void> {
  const fullItem: SyncQueueItem = {
    ...item,
    timestamp: Date.now(),
    retryCount: 0
  };
  await dbPut('sync_queue', fullItem);
  const count = await getPendingSyncCount();
  notifyListeners(count);

  // If online, try flushing immediately
  if (isOnlineState) {
    flushSyncQueue();
  }
}

export async function flushSyncQueue(): Promise<{ synced: number; failed: number }> {
  if (isSyncing || !isOnlineState) {
    const count = await getPendingSyncCount();
    return { synced: 0, failed: count };
  }

  isSyncing = true;
  let synced = 0;
  let failed = 0;

  try {
    const queue = await dbGetAll<SyncQueueItem>('sync_queue');
    if (queue.length === 0) {
      isSyncing = false;
      return { synced: 0, failed: 0 };
    }

    for (const item of queue) {
      try {
        const resp = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item)
        });

        if (resp.ok) {
          if (item.id !== undefined) {
            await dbDelete('sync_queue', item.id);
          }
          synced++;
        } else {
          item.retryCount = (item.retryCount || 0) + 1;
          await dbPut('sync_queue', item);
          failed++;
        }
      } catch {
        item.retryCount = (item.retryCount || 0) + 1;
        await dbPut('sync_queue', item);
        failed++;
      }
    }

    if (synced > 0) {
      await logAudit('SYNC_COMPLETED', `Flushed ${synced} items to school cloud sync.`);
    }
  } catch (err) {
    console.warn('Sync flush error:', err);
  } finally {
    isSyncing = false;
    const count = await getPendingSyncCount();
    notifyListeners(count);
  }

  return { synced, failed };
}

export function initSyncEngine(): void {
  window.addEventListener('online', () => {
    isOnlineState = true;
    logAudit('NETWORK_STATUS', 'Internet connection restored. Starting sync.');
    flushSyncQueue();
  });

  window.addEventListener('offline', () => {
    isOnlineState = false;
    logAudit('NETWORK_STATUS', 'Internet disconnected. Running in 100% Offline-First Mode.');
    getPendingSyncCount().then(count => notifyListeners(count));
  });

  // Check queue periodically
  setInterval(() => {
    if (isOnlineState) {
      flushSyncQueue();
    }
  }, 45000);
}
