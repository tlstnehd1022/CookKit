// 데이터 레이어 추상화: 지금은 localStorage 어댑터만 존재하지만,
// 나중에 Supabase 등 실제 DB로 전환할 때 이 인터페이스를 구현하는
// 어댑터만 새로 만들면 상위 코드(store, features)는 그대로 재사용 가능.
export interface CrudRepository<T extends { id: string }> {
  getAll(): T[];
  get(id: string): T | undefined;
  save(item: T): void;
  delete(id: string): void;
  replaceAll(items: T[]): void;
}

export interface KeyValueRepository<T> {
  get(): T;
  set(value: T): void;
}
