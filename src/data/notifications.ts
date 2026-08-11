import { useSyncExternalStore } from 'react';
import { supabase } from '../lib/supabaseClient';

export type NotificationType = 'recipe_liked' | 'household_recipe_added';

export interface RecipeLikedPayload {
  recipe_id: string;
  liker_user_id: string;
  liker_name: string;
}

export interface HouseholdRecipeAddedPayload {
  recipe_id: string;
  author_user_id: string;
  author_name: string;
}

interface BaseNotification {
  id: string;
  readAt: string | null;
  createdAt: string;
}

export type AppNotification =
  | (BaseNotification & { type: 'recipe_liked'; payload: RecipeLikedPayload })
  | (BaseNotification & { type: 'household_recipe_added'; payload: HouseholdRecipeAddedPayload });

// activeTab.ts/shoppingSelection.ts와 같은 전역 store 패턴 — 홈 화면(우상단 점)과 프로필
// 바텀시트(배지)가 같은 안 읽은 개수를 동시에 봐야 해서 fetch-on-demand 대신 가벼운 반응형
// 캐시로 둔다. INSERT/DELETE는 클라이언트에서 직접 하지 않고 항상 SECURITY DEFINER RPC를
// 거친다(알림의 user_id는 "받는 사람"이라 행위자 auth.uid()와 다르므로 일반 RLS insert 정책으로는
// 표현이 까다롭고, RPC 쪽에서 실제로 그 행동이 유효한지 서버에서 검증한다 — 0023 마이그레이션 참고).
let cache: AppNotification[] = [];
let currentUserId: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function rowToNotification(row: Record<string, unknown>): AppNotification {
  // DB의 payload(jsonb)는 type 컬럼에 맞는 구조라고 신뢰하고 통째로 캐스팅한다 — RPC가 항상
  // type과 짝이 맞는 payload만 넣으므로(0023 마이그레이션) 여기서 개별 필드를 검증하지 않는다.
  return {
    id: row.id as string,
    type: row.type,
    payload: row.payload,
    readAt: row.read_at as string | null,
    createdAt: row.created_at as string,
  } as unknown as AppNotification;
}

async function refresh(): Promise<void> {
  if (!currentUserId) return;
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('알림 조회 실패:', error);
    return;
  }
  cache = (data ?? []).map(rowToNotification);
  notify();
}

export async function initializeNotifications(userId: string): Promise<void> {
  if (currentUserId === userId) return;
  currentUserId = userId;
  await refresh();
}

export function resetNotifications(): void {
  currentUserId = null;
  cache = [];
  notify();
}

export function useNotifications() {
  const notifications = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => cache,
  );
  const unreadCount = notifications.filter((n) => !n.readAt).length;

  async function markRead(id: string) {
    const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    await refresh();
  }

  return { notifications, unreadCount, markRead, refresh };
}

/** 공개 레시피에 좋아요를 누를 때 호출 — 레시피 소유자에게 알림을 생성한다(본인 레시피면 서버가
 * 조용히 무시). 알림 받는 쪽 캐시라 여기서 refresh() 하지 않는다(행위자와 수신자가 다름). */
export async function createRecipeLikedNotification(recipeId: string): Promise<void> {
  const { error } = await supabase.rpc('create_recipe_liked_notification', { p_recipe_id: recipeId });
  if (error) throw error;
}

/** 좋아요 취소 시 그 좋아요가 만든 알림을 지운다(없으면 조용히 무시) — 안 그러면 없는 좋아요에
 * 대한 알림이 남아있게 된다. */
export async function deleteRecipeLikedNotification(recipeId: string): Promise<void> {
  const { error } = await supabase.rpc('delete_recipe_liked_notification', { p_recipe_id: recipeId });
  if (error) throw error;
}

/** 새 레시피를 저장할 때(수정이 아니라 신규 생성일 때만) 호출 — 같은 household의 다른
 * 구성원에게 알림을 생성한다. */
export async function createHouseholdRecipeAddedNotifications(recipeId: string): Promise<void> {
  const { error } = await supabase.rpc('create_household_recipe_added_notifications', { p_recipe_id: recipeId });
  if (error) throw error;
}
