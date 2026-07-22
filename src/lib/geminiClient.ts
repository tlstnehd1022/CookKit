export const GEMINI_DEFAULT_MODEL = 'gemini-2.5-flash';

export interface ExtractedRecipe {
  name: string;
  servingsBase: number;
  ingredients: { name: string; amount: number; unit: string }[];
  steps: { title: string; content: string; timerSeconds?: number | null }[];
  warning?: string | null;
}

// Gemini의 responseSchema는 JSON Schema와 비슷하지만 타입이 대문자이고 nullable 필드를 별도로 표기한다.
const GEMINI_RECIPE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING', description: '레시피 이름' },
    servingsBase: { type: 'INTEGER', description: '기준 인분 수' },
    ingredients: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING', description: '재료 이름' },
          amount: { type: 'NUMBER', description: '수량 (숫자만)' },
          unit: { type: 'STRING', description: '단위 (예: g, ml, 개, 큰술)' },
        },
        required: ['name', 'amount', 'unit'],
      },
    },
    steps: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: '조리 단계 제목' },
          content: { type: 'STRING', description: '조리 단계 상세 설명' },
          timerSeconds: {
            type: 'INTEGER',
            description: '이 단계에 타이머가 필요하면 초 단위 시간, 아니면 생략',
            nullable: true,
          },
        },
        required: ['title', 'content'],
      },
    },
    warning: {
      type: 'STRING',
      description: '추출 결과가 불확실하거나 정보가 부족했을 경우 사용자에게 보여줄 경고 메시지. 문제없으면 생략.',
      nullable: true,
    },
  },
  required: ['name', 'servingsBase', 'ingredients', 'steps'],
} as const;

async function generateStructuredRecipe(apiKey: string, model: string, prompt: string): Promise<ExtractedRecipe> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RECIPE_SCHEMA,
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API 요청 실패 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
  }
  return JSON.parse(text) as ExtractedRecipe;
}

export async function extractRecipeFromText(
  apiKey: string,
  model: string,
  description: string,
): Promise<ExtractedRecipe> {
  return generateStructuredRecipe(
    apiKey,
    model,
    `다음 설명을 레시피 형태(재료+수량+단위, 조리순서)로 구조화해줘. 재료 이름은 한국어로, 일반적으로 쓰이는 명칭으로 정리해줘.\n\n${description}`,
  );
}

export interface YoutubeVideoMeta {
  title: string;
  description: string;
}

function extractYoutubeVideoId(url: string): string | null {
  const patterns = [/[?&]v=([^&#]+)/, /youtu\.be\/([^?&#]+)/, /\/shorts\/([^?&#]+)/];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * YouTube Data API v3(무료 쿼터)로 영상 제목/설명란만 가져온다. 공식 API는 임의 영상의 자막까지는
 * 내려주지 않으므로(소유 채널만 가능), 자막이 꼭 필요하면 사용자가 직접 복사해 붙여넣는 방식으로 보완한다.
 */
export async function fetchYoutubeVideoMeta(youtubeApiKey: string, url: string): Promise<YoutubeVideoMeta> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) {
    throw new Error('유튜브 링크에서 영상 ID를 찾을 수 없습니다.');
  }
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}&key=${encodeURIComponent(youtubeApiKey)}`,
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`YouTube Data API 요청 실패 (${res.status}): ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const snippet = data.items?.[0]?.snippet;
  if (!snippet) {
    throw new Error('해당 영상 정보를 찾을 수 없습니다. 링크나 YouTube API 키를 확인해주세요.');
  }
  return { title: snippet.title ?? '', description: snippet.description ?? '' };
}

export async function extractRecipeFromYoutubeMeta(
  apiKey: string,
  model: string,
  meta: YoutubeVideoMeta | null,
  manualTranscript: string,
): Promise<ExtractedRecipe> {
  const parts = [
    meta?.title ? `영상 제목: ${meta.title}` : null,
    meta?.description ? `영상 설명란:\n${meta.description}` : null,
    manualTranscript.trim() ? `자막/추가 텍스트:\n${manualTranscript.trim()}` : null,
  ].filter(Boolean);

  if (parts.length === 0) {
    throw new Error('영상 제목/설명란을 가져오지 못했고 붙여넣은 텍스트도 없습니다.');
  }

  return generateStructuredRecipe(
    apiKey,
    model,
    `다음은 유튜브 요리 영상에서 얻은 정보야. 이 내용을 바탕으로 레시피(재료+수량+단위, 조리순서)를 구조화해줘. 정보가 부족하거나 추측한 부분이 많다면 warning 필드에 한국어로 설명해줘.\n\n${parts.join('\n\n')}`,
  );
}
