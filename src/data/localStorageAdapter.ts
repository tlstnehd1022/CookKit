import type { CrudRepository, KeyValueRepository } from './repository';

// 로컬 저장소 어댑터. DB(Supabase 등) 전환 시 이 파일만 교체하면 된다 —
// CrudRepository/KeyValueRepository 인터페이스를 유지하는 새 어댑터를 만들고
// store.ts에서 생성하는 인스턴스만 바꾸면 features 코드는 수정할 필요 없음.
export function createLocalStorageRepository<T extends { id: string }>(
  storageKey: string,
): CrudRepository<T> {
  function readAll(): T[] {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeAll(items: T[]): void {
    localStorage.setItem(storageKey, JSON.stringify(items));
  }

  return {
    getAll: readAll,
    get(id) {
      return readAll().find((item) => item.id === id);
    },
    save(item) {
      const items = readAll();
      const index = items.findIndex((existing) => existing.id === item.id);
      if (index >= 0) {
        items[index] = item;
      } else {
        items.push(item);
      }
      writeAll(items);
    },
    delete(id) {
      writeAll(readAll().filter((item) => item.id !== id));
    },
    replaceAll(items) {
      writeAll(items);
    },
  };
}

export function createLocalStorageKeyValue<T>(
  storageKey: string,
  defaultValue: T,
): KeyValueRepository<T> {
  return {
    get() {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return defaultValue;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return defaultValue;
      }
    },
    set(value) {
      localStorage.setItem(storageKey, JSON.stringify(value));
    },
  };
}
