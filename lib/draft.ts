const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('yidianguang-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
const draftKey = (scope: string) => 'studio:' + scope;
export async function readDraft(scope = 'guest') {
  return readDraftKey(draftKey(scope));
}
export async function readLegacyDraft() {
  return readDraftKey('current');
}
async function readDraftKey(key: string) {
  const db = await open();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const r = tx.objectStore('drafts').get(key);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeDraft(value: unknown, scope = 'guest') {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    if (value === null) tx.objectStore('drafts').delete(draftKey(scope));
    else tx.objectStore('drafts').put(value, draftKey(scope));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}
