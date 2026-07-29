import { supabase } from '../lib/supabaseClient';

// 공개 레시피 좋아요(하트). household 공유 store가 아니라 필요한 화면(둘러보기, 공개 레시피
// 상세, 내 레시피 상세)에서 그때그때 조회한다 — 좋아요 수는 실시간 동기화까지는 필요 없는
// 가벼운 부가 정보라 계속 구독하는 캐시로 만들 필요가 없다고 판단.
export interface LikeInfo {
  likeCount: number;
  likedByMe: boolean;
}

/** recipe_likes를 recipeId in (...) 한 번에 조회해서 클라이언트에서 집계한다(개인 앱 규모라
 * group by RPC 없이도 충분히 가벼움). */
export async function fetchLikeInfo(recipeIds: string[], currentUserId: string): Promise<Map<string, LikeInfo>> {
  const result = new Map<string, LikeInfo>(recipeIds.map((id) => [id, { likeCount: 0, likedByMe: false }]));
  if (recipeIds.length === 0) return result;

  const { data, error } = await supabase.from('recipe_likes').select('recipe_id, user_id').in('recipe_id', recipeIds);
  if (error) throw error;

  for (const row of data ?? []) {
    const recipeId = row.recipe_id as string;
    const entry = result.get(recipeId);
    if (!entry) continue;
    entry.likeCount += 1;
    if (row.user_id === currentUserId) entry.likedByMe = true;
  }
  return result;
}

export async function toggleLike(recipeId: string, userId: string, currentlyLiked: boolean): Promise<void> {
  if (currentlyLiked) {
    const { error } = await supabase
      .from('recipe_likes')
      .delete()
      .eq('recipe_id', recipeId)
      .eq('user_id', userId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('recipe_likes').insert({ recipe_id: recipeId, user_id: userId });
    if (error) throw error;
  }
}
