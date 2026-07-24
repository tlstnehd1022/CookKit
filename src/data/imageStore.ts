import { useEffect, useState } from 'react';

// 조리 단계 이미지는 base64 데이터 URL 기준 수백KB~1MB대라 localStorage(5~10MB 한도)로는
// 몇 장만 저장해도 한계에 부딪힌다. 그래서 이 이미지들만 별도로 IndexedDB에 저장하고,
// Recipe/RecipeStep에는 이 데이터를 가리키는 imageId(문자열)만 들고 있는다.
const DB_NAME = 'cookkit-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveImage(id: string, dataUrl: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(dataUrl, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function getImage(id: string): Promise<string | null> {
  const db = await openDb();
  const result = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve((request.result as string | undefined) ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return result;
}

export async function deleteImage(id: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

/** imageId가 가리키는 이미지를 IndexedDB에서 비동기로 불러온다(없거나 로딩 전이면 null). */
export function useStoredImage(imageId?: string): string | null {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!imageId) {
      setDataUrl(null);
      return;
    }
    let cancelled = false;
    setDataUrl(null);
    getImage(imageId).then((result) => {
      if (!cancelled) setDataUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [imageId]);

  return dataUrl;
}
