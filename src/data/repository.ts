// 데이터 레이어 추상화. Supabase는 네트워크 호출이라 태생적으로 비동기이므로
// (localStorage 시절과 달리) 이 인터페이스도 비동기로 정의한다 — 상위 코드(store.ts)가
// 로딩 상태를 흡수해서 features 쪽 컴포넌트는 거의 그대로 재사용 가능하다.
export interface CrudRepository<T extends { id: string }> {
  getAll(): Promise<T[]>;
  get(id: string): Promise<T | undefined>;
  save(item: T): Promise<void>;
  delete(id: string): Promise<void>;
  replaceAll(items: T[]): Promise<void>;
}
