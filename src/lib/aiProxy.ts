import { supabase } from './supabaseClient';
import type { ChatResult, ChatTurn, ExistingContext } from './aiChat';
import type { ExtractedRecipe } from './claudeClient';
import type { ReceiptItem, YoutubeVideoMeta } from './geminiClient';
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

/** 로그인 세션의 access token을 Authorization 헤더로 반환한다 — POST가 아닌 GET 프록시
 * 호출(youtube-transcript, youtube-thumbnail)도 이 헤더를 그대로 fetch에 실어 보낸다. */
export async function getAuthHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    throw new ApiProxyError('unauthorized', '로그인이 필요합니다.');
  }
  return { Authorization: `Bearer ${session.access_token}` };
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

/** YouTube Data API 키도 선택 사항이라, 키가 없거나 조회가 실패해도 서버가 meta: null로 조용히
 * 응답한다(api/youtube-meta.ts 참고) — 호출부에서 별도로 없음/실패를 구분해 처리할 필요 없음. */
export async function fetchYoutubeVideoMeta(url: string): Promise<YoutubeVideoMeta | null> {
  const result = await callAiApi<{ meta: YoutubeVideoMeta | null }>('/api/youtube-meta', { url });
  return result.meta;
}

/** 영수증 이미지(base64, data: 접두사 없이)에서 식료품 품목을 인식한다. 결과는 항상 확인 화면
 * (ReceiptScanModal)을 거친 뒤 사용자가 명시적으로 반영해야만 재료에 저장된다. */
export async function extractReceiptItems(
  model: string,
  imageBase64: string,
  mimeType: string,
): Promise<ReceiptItem[]> {
  const result = await callAiApi<{ items: ReceiptItem[] }>('/api/ai-receipt', { model, imageBase64, mimeType });
  return result.items;
}
