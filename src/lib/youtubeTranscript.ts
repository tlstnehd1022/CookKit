import { getAuthHeader } from './aiProxy';

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
 */
export async function fetchYoutubeTranscript(url: string): Promise<YoutubeTranscriptResult> {
  const headers = await getAuthHeader();
  const res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(url)}`, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? '자막을 가져오지 못했습니다.');
  }
  return data as YoutubeTranscriptResult;
}
