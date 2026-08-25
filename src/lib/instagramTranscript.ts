/** 인스타그램 릴스/게시물 링크(reel/reels/p/tv 전부)에서 게시물 id만 뽑아낸다. */
export function extractInstagramPostId(url: string): string | null {
  const match = url.match(/instagram\.com\/(?:reel|reels|p|tv)\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : null;
}

export interface InstagramTranscriptResult {
  /** 영상 음성을 옮긴 텍스트(Supadata STT) — 자막 트랙이 없는 게시물이 대부분이라 항상 이
   * 경로만 쓴다(유튜브처럼 네이티브 자막을 먼저 시도하는 단계가 없음). */
  transcript: string;
  /** 게시물 설명(캡션) 텍스트 — 인스타그램은 여기에 레시피를 직접 적어두는 경우가 흔해
   * transcript를 보완하는 자료로 함께 쓴다. */
  caption: string;
  language: string;
  /** 완성 사진 후보로 제안할 게시물 썸네일 — 시간이 지나면 만료될 수 있는 서명된 URL이라
   * 실제로 "완성 사진으로 저장"할 때는 이 URL을 그대로 쓰지 않고 그 시점에 다시 조회한다
   * (api/instagram-thumbnail.ts). */
  thumbnailUrl: string | null;
}

/**
 * 인스타그램 게시물 정보(oEmbed 등 공식 API가 계정 심사를 요구해 접근이 까다로워) 대신 이미
 * 쓰고 있는 Supadata API로 가져온다 — youtubeTranscript.ts의 fetchYoutubeTranscript와 같은
 * 이유로 이 요청만 서버(/api/instagram-transcript)를 거친다.
 *
 * getAuthHeader는 여기서 정적 import하지 않고 동적으로 불러온다 — youtubeTranscript.ts와
 * 같은 이유(aiProxy.ts는 브라우저 전용 모듈이라 정적 import 시 서버 번들 평가에서 즉시 에러).
 */
export async function fetchInstagramTranscript(url: string): Promise<InstagramTranscriptResult> {
  const { getAuthHeader } = await import('./aiProxy.js');
  const headers = await getAuthHeader();
  const res = await fetch(`/api/instagram-transcript?url=${encodeURIComponent(url)}`, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.message ?? '인스타그램 게시물 정보를 가져오지 못했습니다.');
  }
  return data as InstagramTranscriptResult;
}
