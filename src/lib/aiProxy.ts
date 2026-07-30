import { supabase } from './supabaseClient';
import type { ChatResult, ChatTurn, ExistingContext } from './aiChat';
import type { ExtractedRecipe } from './claudeClient';
import type { YoutubeVideoMeta } from './geminiClient';
import type { RecipeSnapshot } from './recipeDiff';

/**
 * AI 호출(대화/유튜브 변환/이미지 생성)이 이제 브라우저에서 Anthropic/Gemini를 직접 부르지 않고
 * 이 모듈을 거쳐 서버리스 함수(api/ai-*.ts)로 요청한다 — 실제 API 키는 서버가 Supabase Vault에서
 * 복호화해서 쓰고, 브라우저는 로그인 세션(access token)만 실어 보낸다(Phase 4, API 키 암호화 전환).
 */

export class ApiProxyError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

async function callAiApi<T>(path: string, body: unknown): Promise<T> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new ApiProxyError('unauthorized', '로그인이 필요합니다.');
  }

  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiProxyError(
      data?.error ?? 'unknown',
      data?.message ?? `요청이 실패했습니다 (${res.status}).`,
    );
  }
  return data as T;
}

export async function chatAboutRecipe(
  provider: 'anthropic' | 'gemini',
  model: string,
  history: ChatTurn[],
  useWebSearch: boolean,
  existing: ExistingContext,
  currentRecipe: RecipeSnapshot,
): Promise<ChatResult> {
  return callAiApi<ChatResult>('/api/ai-chat', { provider, model, history, useWebSearch, existing, currentRecipe });
}

export async function extractRecipeFromTranscript(
  model: string,
  transcriptText: string,
  existing: ExistingContext,
): Promise<ExtractedRecipe> {
  return callAiApi<ExtractedRecipe>('/api/ai-extract-transcript', { model, transcriptText, existing });
}

export async function extractRecipeFromYoutubeMeta(
  model: string,
  meta: YoutubeVideoMeta | null,
  manualTranscript: string,
  existing: ExistingContext,
): Promise<ExtractedRecipe> {
  return callAiApi<ExtractedRecipe>('/api/ai-extract-youtube-meta', { model, meta, manualTranscript, existing });
}

export async function generateImage(model: string, prompt: string): Promise<string> {
  const result = await callAiApi<{ dataUrl: string }>('/api/ai-image', { model, prompt });
  return result.dataUrl;
}
