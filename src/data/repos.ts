import { createLocalStorageKeyValue, createLocalStorageRepository } from './localStorageAdapter';
import { CURRENT_USER_ID } from './session';
import type { Category, Ingredient, PantryStatus, Recipe, Tag } from './types';

// 원시 repository 인스턴스. DB 전환 시 이 파일에서 만드는 인스턴스만
// 다른 어댑터 구현으로 바꾸면 store.ts/backup.ts는 수정할 필요 없다.
//
// storage key는 사용자별로 네임스페이스를 걸어둔다. 지금은 사용자가 하나(CURRENT_USER_ID)뿐이라
// 로그인 시점에 동적으로 바뀌지는 않지만, 나중에 실제 다중 사용자 로그인이 붙을 때
// 이 파일의 prefix만 세션의 실제 userId로 바꾸면 되도록 미리 구조를 잡아둔 것.
const scope = `cookkit:${CURRENT_USER_ID}`;

export const ingredientsRepo = createLocalStorageRepository<Ingredient>(`${scope}:ingredients`);
export const recipesRepo = createLocalStorageRepository<Recipe>(`${scope}:recipes`);
export const tagsRepo = createLocalStorageRepository<Tag>(`${scope}:tags`);
export const categoriesRepo = createLocalStorageRepository<Category>(`${scope}:categories`);
export const pantryRepo = createLocalStorageKeyValue<PantryStatus>(`${scope}:pantryStatus`, {});
export const shoppingSelectionRepo = createLocalStorageKeyValue<string[]>(`${scope}:shoppingSelection`, []);
