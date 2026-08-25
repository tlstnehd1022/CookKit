// Supadata(supadata.ai) API 공용 헬퍼 — 유튜브 자막이 없을 때의 폴백(youtube-transcript.ts)과
// 인스타그램 변환(instagram-transcript.ts, 자체 자막 API가 없어 항상 이 경로만 씀)이 같은
// 트랜스크립트 폴링 로직을 공유한다. /v1/transcript, /v1/metadata 둘 다 유튜브/틱톡/인스타그램/
// X/페이스북에 동일하게 동작하는 플랫폼 공용 엔드포인트다(URL만 보고 자동으로 플랫폼을 인식).
const SUPADATA_BASE_URL = 'https://api.supadata.ai/v1';
const SUPADATA_POLL_INTERVAL_MS = 3000;
const SUPADATA_MAX_WAIT_MS = 100_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface SupadataTranscript {
  transcript: string;
  language: string;
}

/** 자막(네이티브 우선, 없으면 Supadata가 자체적으로 오디오를 음성인식해서 대신 준다 —
 * mode=auto)을 가져온다. 못 가져오면(호출 실패/빈 결과) null — 이 함수 자체는 "그 게시물에
 * 접근 가능한지"는 신경 쓰지 않고 트랜스크립트 유무만 본다(접근 가능 여부는 호출부가
 * fetchSupadataMetadata로 먼저 확인). */
export async function fetchSupadataTranscript(url: string, apiKey: string): Promise<SupadataTranscript | null> {
  const requestUrl = `${SUPADATA_BASE_URL}/transcript?url=${encodeURIComponent(url)}&lang=ko&text=true&mode=auto`;
  const res = await fetch(requestUrl, { headers: { 'x-api-key': apiKey } });

  if (res.status === 200) {
    const data = await res.json();
    if (!data.content) return null;
    return { transcript: data.content as string, language: data.lang ?? 'auto' };
  }

  if (res.status === 202) {
    const { jobId } = await res.json();
    const startedAt = Date.now();
    while (Date.now() - startedAt < SUPADATA_MAX_WAIT_MS) {
      await sleep(SUPADATA_POLL_INTERVAL_MS);
      const pollRes = await fetch(`${SUPADATA_BASE_URL}/transcript/${jobId}`, {
        headers: { 'x-api-key': apiKey },
      });
      if (!pollRes.ok) continue;
      const pollData = await pollRes.json();
      if (pollData.status === 'completed' && pollData.content) {
        return { transcript: pollData.content as string, language: pollData.lang ?? 'auto' };
      }
      if (pollData.status === 'failed') return null;
    }
    return null; // 폴링 시간 초과
  }

  return null;
}

/** 접근 불가(비공개 계정/삭제된 게시물 등, metadata 엔드포인트가 403/404로 응답)를 명시적으로
 * 구분하기 위한 에러 — 그 외 실패(일시적 오류 등)는 null로 취급해 치명적이지 않게 넘어간다. */
export class SupadataNotAccessibleError extends Error {}

export interface SupadataMetadata {
  /** 게시물 설명/캡션 텍스트 — 유튜브는 보통 비어있고, 인스타그램은 여기에 레시피 텍스트를
   * 직접 적어두는 경우가 흔해 자막을 보완하는 자료로 쓴다. */
  caption: string;
  thumbnailUrl: string | null;
}

export async function fetchSupadataMetadata(url: string, apiKey: string): Promise<SupadataMetadata | null> {
  const res = await fetch(`${SUPADATA_BASE_URL}/metadata?url=${encodeURIComponent(url)}`, {
    headers: { 'x-api-key': apiKey },
  });
  if (res.status === 403 || res.status === 404) {
    throw new SupadataNotAccessibleError();
  }
  if (!res.ok) return null;
  const data = await res.json();
  return {
    caption: typeof data.description === 'string' ? data.description : '',
    thumbnailUrl: typeof data.media?.thumbnailUrl === 'string' ? data.media.thumbnailUrl : null,
  };
}
