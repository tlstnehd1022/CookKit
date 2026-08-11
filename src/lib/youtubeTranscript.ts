/** 유튜브 링크(watch/youtu.be/shorts 형태 전부)에서 영상 ID만 뽑아낸다. */
export function extractYoutubeVideoId(url: string): string | null {
  const patterns = [/[?&]v=([^&#]+)/, /youtu\.be\/([^?&#]+)/, /\/shorts\/([^?&#]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export interface YoutubeTranscriptResult {
  transcript: string;
  language: string;
  /** 'captions': 유튜브 자막 트랙에서 직접 추출, 'supadata': 자막이 없어 Supadata(AI 음성인식) 폴백 사용 */
  source: 'captions' | 'supadata';
}

/**
 * 유튜브 자막은 CORS 때문에 브라우저에서 직접 가져올 수 없어, 이 요청만 서버(Vercel Serverless
 * Function, /api/youtube-transcript)를 거친다. 앱의 다른 모든 기능은 여전히 클라이언트-only.
 *
 * getAuthHeader는 여기서 정적 import하지 않고 동적으로 불러온다 — 이 파일의 extractYoutubeVideoId는
 * geminiClient.ts를 거쳐 api/ai-*.ts 서버리스 함수에서도 쓰이는데, aiProxy.ts는 브라우저의
 * Supabase 세션(supabaseClient.ts의 import.meta.env.VITE_*)에 의존하는 클라이언트 전용 모듈이라
 * 정적으로 import하면 모듈 로드 시점에 그 코드가 같이 평가되어(fetchYoutubeTranscript를 실제로
 * 호출하지 않아도) 서버 환경(Vite의 import.meta.env 치환이 없는 esbuild 번들)에서 즉시 에러가
 * 난다. 동적 import는 fetchYoutubeTranscript가 실제로 호출될 때만(항상 브라우저에서만 호출됨)
 * 평가되므로 이 문제를 피한다.
 */
export async function fetchYoutubeTranscript(url: string): Promise<YoutubeTranscriptResult> {
  const { getAuthHeader } = await import('./aiProxy.js');
  const headers = await getAuthHeader();
  const res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(url)}`, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? '자막을 가져오지 못했습니다.');
  }
  return data as YoutubeTranscriptResult;
}
