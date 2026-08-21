import { supabase } from '../lib/supabaseClient';

export type AiChatFeedbackType = 'bad' | 'good';

/** 대화형 AI 응답에 대한 피드백(RecipeChatPanel의 👎) 저장 — 직전 사용자 메시지와 그 AI 응답을
 * 통째로 같이 남겨 사용자가 매번 다시 설명하지 않아도 되게 한다. */
export async function submitAiChatFeedback(params: {
  householdId: string;
  userId: string;
  recipeId?: string;
  userMessage: string;
  aiResponse: string;
  feedbackType: AiChatFeedbackType;
  reason?: string;
}): Promise<void> {
  const { error } = await supabase.from('ai_chat_feedback').insert({
    household_id: params.householdId,
    user_id: params.userId,
    recipe_id: params.recipeId ?? null,
    user_message: params.userMessage,
    ai_response: params.aiResponse,
    feedback_type: params.feedbackType,
    reason: params.reason?.trim() || null,
  });
  if (error) throw error;
}

export interface AiChatFeedbackEntry {
  id: string;
  createdAt: string;
  userMessage: string;
  aiResponse: string;
  reason: string | null;
}

const FEEDBACK_LIST_LIMIT = 50;

/** 프로필 바텀시트 "AI 피드백 기록" 화면 전용 — 검색/필터 없이 household의 최신 50건만. */
export async function fetchAiChatFeedback(householdId: string): Promise<AiChatFeedbackEntry[]> {
  const { data, error } = await supabase
    .from('ai_chat_feedback')
    .select('id, created_at, user_message, ai_response, reason')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(FEEDBACK_LIST_LIMIT);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    createdAt: row.created_at as string,
    userMessage: row.user_message as string,
    aiResponse: row.ai_response as string,
    reason: row.reason as string | null,
  }));
}
