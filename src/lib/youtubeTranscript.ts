export interface YoutubeTranscriptResult {
  transcript: string;
  language: string;
}

/**
 * 유튜브 자막은 CORS 때문에 브라우저에서 직접 가져올 수 없어, 이 요청만 서버(Vercel Serverless
 * Function, /api/youtube-transcript)를 거친다. 앱의 다른 모든 기능은 여전히 클라이언트-only.
 */
export async function fetchYoutubeTranscript(url: string): Promise<YoutubeTranscriptResult> {
  const res = await fetch(`/api/youtube-transcript?url=${encodeURIComponent(url)}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? '자막을 가져오지 못했습니다.');
  }
  return data as YoutubeTranscriptResult;
}
