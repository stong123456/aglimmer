const open = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open('yidianguang-drafts', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('drafts');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
export async function readDraft() {
  const db = await open();
  return new Promise<any>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readonly');
    const r = tx.objectStore('drafts').get('current');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    tx.oncomplete = () => db.close();
  });
}
export async function writeDraft(value: unknown) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction('drafts', 'readwrite');
    if (value === null) tx.objectStore('drafts').delete('current');
    else tx.objectStore('drafts').put(value, 'current');
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
