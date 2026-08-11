import { supabase } from '../lib/supabaseClient';
import { fetchHouseholdMemberIds } from './household';
import { rowToRecipe } from './supabaseAdapter';
import { chunk, IN_QUERY_CHUNK_SIZE } from '../lib/chunk';
import type { Recipe } from './types';

// scripts/seed-recipes-from-public-data.ts가 공공데이터(식약처) 기반 레시피를 넣을 때 쓰는
// 시스템 계정(0011 마이그레이션에서 SQL로 생성, 정상 가입 플로우를 거치지 않아 프로필 정보가
// 없다) — 둘러보기 화면에서 이 계정의 레시피는 "진짜 사용자" 레시피와 섞지 않고 별도
// "CookKit 추천 레시피" 섹션으로 분리해서 보여준다.
export const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

// "둘러보기" 화면 전용 — 다른 household의 전체공개(visibility='public') 레시피를 조회한다.
// 우리 가구원의 public 레시피는 이미 "우리집 레시피" 목록에 나오므로 여기서는 제외한다.
// household 공유 store(store.ts)와 달리 계속 구독하는 캐시가 아니라 화면 진입 시 1회 조회하는
// 방식으로 충분하다(다른 사람 레시피는 실시간으로 계속 바뀔 일이 적고, 매번 새로 불러와도 됨).
export interface PublicRecipeEntry {
  recipe: Recipe;
  tagNames: string[];
  /** 작성자 user_id — 시스템 계정(SYSTEM_USER_ID) 여부 판단 등에 사용 */
  authorUserId: string;
  authorName: string;
  authorAvatarUrl?: string;
  /** 작성자의 가구 이름("OO님의 레시피 (영희네)" 표기용) — 못 찾으면(가구 미소속 등) 생략 */
  authorHouseholdName?: string;
  /** 이미 이 레시피를 복사해서 내 레시피로 갖고 있는지(source_recipe_id로 추적) */
  alreadyCopied: boolean;
}

export interface PublicRecipesResult {
  entries: PublicRecipeEntry[];
  /** 재료 이름 검색/표시용 — recipes.content(jsonb)는 조인이 안 돼서 별도로 모아 조회함 */
  ingredientNameById: Map<string, string>;
}

/** "OO님의 레시피" 또는(가구 이름이 있으면) "OO님의 레시피 (영희네)" 형태로 조립 */
export function formatPublicRecipeOwnerLabel(entry: PublicRecipeEntry): string {
  const base = `${entry.authorName}님의 레시피`;
  return entry.authorHouseholdName ? `${base} (${entry.authorHouseholdName})` : base;
}

export async function fetchPublicRecipes(
  currentUserId: string,
  currentHouseholdId: string,
  myRecipes: Recipe[],
): Promise<PublicRecipesResult> {
  const householdMemberIds = await fetchHouseholdMemberIds(currentHouseholdId);
  const excludedUserIds = new Set([currentUserId, ...householdMemberIds]);

  // profiles!user_id — recipes -> profiles로 가는 외래키 경로가 (recipe_likes를 거치는 경로 등)
  // 여러 개로 해석될 수 있어서 PostgREST가 "more than one relationship found"로 거부함.
  // recipes.user_id 컬럼을 통한 FK라고 명시적으로 지정해서 모호함을 없앤다.
  // email은 선택하지 않음 — 닉네임(display_name)이 없을 때 이메일을 화면에 노출하면 다른 가구
  // 유저에게 개인정보가 새는 셈이라, 대신 아래에서 중립적인 문구로 대체한다.
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_tags(tag_id, tags(name)), profiles!user_id(display_name, avatar_url)')
    .eq('visibility', 'public');
  if (error) throw error;
  // 우리 가구원(나 포함)의 public 레시피는 이미 "우리집 레시피" 목록에서 보이므로 제외
  const rows = (data ?? []).filter((row) => !excludedUserIds.has(row.user_id as string));

  // 작성자의 가구 이름 해석 — household_members_select_via_public_recipe /
  // households_select_via_public_recipe(0012)가 공개 레시피 작성자에 한해 조회를 허용해준다.
  // 유저당 household가 최대 1개라(가입 시 제한) user_id -> household_id는 1:1로 취급해도 된다.
  const authorUserIds = Array.from(new Set(rows.map((row) => row.user_id as string)));
  let householdNameByUserId = new Map<string, string>();
  if (authorUserIds.length > 0) {
    const memberRows = (
      await Promise.all(
        chunk(authorUserIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
          const { data, error } = await supabase.from('household_members').select('user_id, household_id').in('user_id', ids);
          if (error) throw error;
          return data ?? [];
        }),
      )
    ).flat();
    const householdIdByUserId = new Map(
      memberRows.map((r) => [r.user_id as string, r.household_id as string]),
    );
    const householdIds = Array.from(new Set(householdIdByUserId.values()));
    if (householdIds.length > 0) {
      const householdRows = (
        await Promise.all(
          chunk(householdIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
            const { data, error } = await supabase.from('households').select('id, name').in('id', ids);
            if (error) throw error;
            return data ?? [];
          }),
        )
      ).flat();
      const nameByHouseholdId = new Map(householdRows.map((r) => [r.id as string, r.name as string]));
      householdNameByUserId = new Map(
        Array.from(householdIdByUserId.entries())
          .map(([userId, householdId]) => [userId, nameByHouseholdId.get(householdId)])
          .filter((entry): entry is [string, string] => Boolean(entry[1])),
      );
    }
  }

  // 재료 이름 해석 — 이 배치가 참조하는 ingredientId를 전부 모아서 한 번에 조회한다.
  const allIngredientIds = new Set<string>();
  for (const row of rows) {
    const content = row.content as { ingredients?: { ingredientId: string }[] } | null;
    for (const item of content?.ingredients ?? []) {
      if (item.ingredientId) allIngredientIds.add(item.ingredientId);
    }
  }
  let ingredientNameById = new Map<string, string>();
  if (allIngredientIds.size > 0) {
    const ingRows = (
      await Promise.all(
        chunk(Array.from(allIngredientIds), IN_QUERY_CHUNK_SIZE).map(async (ids) => {
          const { data, error } = await supabase.from('ingredients').select('id, name').in('id', ids);
          if (error) throw error;
          return data ?? [];
        }),
      )
    ).flat();
    ingredientNameById = new Map(ingRows.map((r) => [r.id as string, r.name as string]));
  }

  const copiedSourceIds = new Set(
    myRecipes.map((r) => r.sourceRecipeId).filter((id): id is string => Boolean(id)),
  );

  const entries: PublicRecipeEntry[] = rows.map((row) => {
    const recipe = rowToRecipe(row);
    const recipeTags = (row.recipe_tags as { tag_id: string; tags: { name: string } | null }[] | null) ?? [];
    const tagNames = recipeTags.map((rt) => rt.tags?.name).filter((n): n is string => Boolean(n));
    const authorUserId = row.user_id as string;
    const isSystemAuthor = authorUserId === SYSTEM_USER_ID;
    // 시스템 계정은 정상 가입 플로우를 거치지 않아 프로필 닉네임이 없다 — "이름 없는 사용자"
    // 대신 항상 "CookKit"으로 통일 표시하고, 소속 household 이름("CookKit 시스템")도 진짜
    // household와 헷갈릴 수 있어 생략한다.
    const authorName = isSystemAuthor ? 'CookKit' : recipe.authorName || '이름 없는 사용자';
    const authorHouseholdName = isSystemAuthor ? undefined : householdNameByUserId.get(authorUserId);
    return {
      recipe,
      tagNames,
      authorUserId,
      authorName,
      authorAvatarUrl: recipe.authorAvatarUrl,
      authorHouseholdName,
      alreadyCopied: copiedSourceIds.has(recipe.id),
    };
  });

  return { entries, ingredientNameById };
}
