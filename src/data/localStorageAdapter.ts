// 기기 로컬 설정(API 키, 테마 등)에만 쓰는 단순 동기 key-value 저장소.
// household 공유 데이터(재료/레시피/태그/카테고리)는 supabaseAdapter.ts로 이전했다 —
// 그쪽은 네트워크 호출이라 비동기(repository.ts의 CrudRepository)이고, 이건 기기 로컬이라
// 여전히 동기로 남겨둔다(설정 화면이 매 입력마다 await할 필요는 없음).
export interface LocalKeyValueRepository<T> {
  get(): T;
  set(value: T): void;
}

export function createLocalStorageKeyValue<T>(
  storageKey: string,
  defaultValue: T,
): LocalKeyValueRepository<T> {
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
