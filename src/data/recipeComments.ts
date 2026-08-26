import { supabase } from '../lib/supabaseClient';
import { chunk, IN_QUERY_CHUNK_SIZE } from '../lib/chunk';

export const RECIPE_COMMENT_MAX_LENGTH = 500;

export interface RecipeComment {
  id: string;
  recipeId: string;
  userId: string;
  content: string;
  createdAt: string;
  updatedAt: string | null;
  authorName: string;
  authorAvatarUrl?: string;
  /** 댓글 작성자가 나와 다른 household일 때만 채워짐(같은 household면 생략 — 당연히 "우리"라서). */
  authorHouseholdName?: string;
}

/** 오래된 순(대화처럼 위→아래로 읽히게) — publicRecipes.ts의 작성자 가구 이름 해석과 같은 패턴으로
 * 댓글 작성자가 나와 다른 household일 때만 그 household 이름을 붙인다. */
export async function fetchRecipeComments(
  recipeId: string,
  viewerHouseholdId: string | null,
): Promise<RecipeComment[]> {
  const { data, error } = await supabase
    .from('recipe_comments')
    .select('id, recipe_id, user_id, content, created_at, updated_at, profiles!user_id(display_name, avatar_url)')
    .eq('recipe_id', recipeId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const rows = data ?? [];

  const authorUserIds = Array.from(new Set(rows.map((row) => row.user_id as string)));
  let householdNameByUserId = new Map<string, string>();
  if (authorUserIds.length > 0) {
    const memberRows = (
      await Promise.all(
        chunk(authorUserIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
          const { data, error } = await supabase
            .from('household_members')
            .select('user_id, household_id')
            .in('user_id', ids);
          if (error) throw error;
          return data ?? [];
        }),
      )
    ).flat();
    const householdIdByUserId = new Map(memberRows.map((r) => [r.user_id as string, r.household_id as string]));
    const otherHouseholdIds = Array.from(
      new Set(Array.from(householdIdByUserId.values()).filter((id) => id !== viewerHouseholdId)),
    );
    if (otherHouseholdIds.length > 0) {
      const householdRows = (
        await Promise.all(
          chunk(otherHouseholdIds, IN_QUERY_CHUNK_SIZE).map(async (ids) => {
            const { data, error } = await supabase.from('households').select('id, name').in('id', ids);
            if (error) throw error;
            return data ?? [];
          }),
        )
      ).flat();
      const nameByHouseholdId = new Map(householdRows.map((r) => [r.id as string, r.name as string]));
      householdNameByUserId = new Map(
        Array.from(householdIdByUserId.entries())
          .filter(([, householdId]) => householdId !== viewerHouseholdId)
          .map(([userId, householdId]) => [userId, nameByHouseholdId.get(householdId)])
          .filter((entry): entry is [string, string] => Boolean(entry[1])),
      );
    }
  }

  return rows.map((row) => {
    const profile = row.profiles as unknown as { display_name: string | null; avatar_url: string | null } | null;
    return {
      id: row.id as string,
      recipeId: row.recipe_id as string,
      userId: row.user_id as string,
      content: row.content as string,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string | null,
      authorName: profile?.display_name || '이름 없는 사용자',
      authorAvatarUrl: profile?.avatar_url ?? undefined,
      authorHouseholdName: householdNameByUserId.get(row.user_id as string),
    };
  });
}

export async function addRecipeComment(
  recipeId: string,
  userId: string,
  content: string,
): Promise<{ id: string; createdAt: string }> {
  const { data, error } = await supabase
    .from('recipe_comments')
    .insert({ recipe_id: recipeId, user_id: userId, content })
    .select('id, created_at')
    .single();
  if (error) throw error;
  return { id: data.id as string, createdAt: data.created_at as string };
}

export async function updateRecipeComment(commentId: string, content: string): Promise<{ updatedAt: string }> {
  const updatedAt = new Date().toISOString();
  const { error } = await supabase
    .from('recipe_comments')
    .update({ content, updated_at: updatedAt })
    .eq('id', commentId);
  if (error) throw error;
  return { updatedAt };
}

export async function deleteRecipeComment(commentId: string): Promise<void> {
  const { error } = await supabase.from('recipe_comments').delete().eq('id', commentId);
  if (error) throw error;
}
