// 2.5/2.0 세대 모델은 2026-07-09부터 신규 API 키에 404("no longer available to new users")를
// 반환하기 시작함 — 새로 발급한 키는 3.x 세대 모델만 사용 가능. 최신 GA 모델로 기본값 설정.
import {
  RECIPE_CHAT_SYSTEM_PROMPT,
  buildCurrentRecipeNote,
  buildExistingContextNote,
  type ChatResult,
  type ChatTurn,
  type ExistingContext,
} from './aiChat.js';
import type { RecipeSnapshot } from './recipeDiff.js';
import { extractYoutubeVideoId } from './youtubeTranscript.js';

export const GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';
// 조리 단계 이미지 생성 전용 모델("Nano Banana" 계열) — 텍스트 모델과 별개로 관리.
// Claude는 이미지 생성을 지원하지 않아 이 기능은 Gemini 전용이다. 기본값은 최신 GA 모델이지만
// 설정 화면에서 사용자가 다른 모델 ID로 바꿀 수 있음(settings.geminiImageModel) — 예:
// gemini-3.1-flash-image는 무료 티어에 없는 유료 전용 모델이라, 무료로 테스트하고 싶으면
// gemini-2.5-flash-image("Nano Banana" 1세대, 무료 티어 하루 약 500장)로 바꿔볼 수 있음.
// 다만 신규 발급 API 키는 2.x 세대 모델 자체가 막혀있을 수 있음(위 텍스트 모델 주석 참고) —
// 계정/키 발급 시점에 따라 다름.
export const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

export interface ExtractedRecipe {
  name: string;
  servingsBase: number;
  ingredients: { name: string; amount: number; unit: string; categoryName?: string | null }[];
  steps: { title: string; content: string; timerSeconds?: number | null; tip?: string | null }[];
  tagNames?: string[] | null;
  warning?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  difficultyReason?: string | null;
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
          name: { type: 'STRING', description: '재료 이름 (이미 등록된 재료와 같으면 그 이름 그대로)' },
          amount: { type: 'NUMBER', description: '수량 (숫자만)' },
          unit: { type: 'STRING', description: '단위 (예: g, ml, 개, 큰술)' },
          categoryName: {
            type: 'STRING',
            description: '이 재료의 카테고리 이름. 기존 카테고리 목록 중 하나를 최대한 사용, 없으면 새로 제안.',
            nullable: true,
          },
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
          tip: {
            type: 'STRING',
            description: '이 단계에 도움이 될 만한 짧은 팁(선택). 예: "면수는 버리지 말고 한 국자 남겨 두세요"',
            nullable: true,
          },
        },
        required: ['title', 'content'],
      },
    },
    tagNames: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description: '이 레시피에 어울리는 스타일/카테고리 태그 이름들. 기존 태그 목록을 최대한 재사용.',
      nullable: true,
    },
    warning: {
      type: 'STRING',
      description: '추출 결과가 불확실하거나 정보가 부족했을 경우 사용자에게 보여줄 경고 메시지. 문제없으면 생략.',
      nullable: true,
    },
    difficulty: {
      type: 'STRING',
      description:
        '난이도 판단. easy=30분 이내·재료 5가지 이하·특수 도구 불필요, medium=1시간 이내·기본 도구로 가능, ' +
        'hard=1시간 이상 걸리거나 특수 기술/도구가 필요. 값은 "easy", "medium", "hard" 중 하나.',
      nullable: true,
    },
    difficultyReason: {
      type: 'STRING',
      description: '난이도를 이렇게 판단한 근거를 한국어 한 문장으로.',
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
  try {
    return JSON.parse(text) as ExtractedRecipe;
  } catch {
    throw new Error('AI가 유효한 레시피 형식으로 응답하지 않았어요. 다시 시도해주세요.');
  }
}

export interface EstimatedNutrition {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  sodium: number;
}

const GEMINI_NUTRITION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    calories: { type: 'NUMBER', description: '1인분 기준 열량(kcal)' },
    carbs: { type: 'NUMBER', description: '1인분 기준 탄수화물(g)' },
    protein: { type: 'NUMBER', description: '1인분 기준 단백질(g)' },
    fat: { type: 'NUMBER', description: '1인분 기준 지방(g)' },
    sodium: { type: 'NUMBER', description: '1인분 기준 나트륨(mg)' },
  },
  required: ['calories', 'carbs', 'protein', 'fat', 'sodium'],
} as const;

/** 재료/조리순서를 근거로 1인분 기준 영양 정보를 대략 추정한다(온디맨드 전용 — 자동 호출 금지,
 * 사용자가 "영양 정보 계산하기"를 눌렀을 때만). 정확한 값이 아니라 추정치이므로 화면에는 항상
 * "AI 추정" 표기와 함께 보여줘야 한다(호출부 책임). */
export async function estimateRecipeNutrition(
  apiKey: string,
  model: string,
  recipe: { name: string; servingsBase: number; ingredients: { name: string; amount: number; unit: string }[] },
): Promise<EstimatedNutrition> {
  const ingredientLines = recipe.ingredients.map((i) => `- ${i.name} ${i.amount}${i.unit}`).join('\n');
  const prompt =
    `다음 레시피(총 ${recipe.servingsBase}인분 분량)의 재료를 보고 1인분 기준 영양 정보를 대략 추정해줘.\n\n` +
    `레시피: ${recipe.name}\n재료(${recipe.servingsBase}인분 전체 분량):\n${ingredientLines}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_NUTRITION_SCHEMA,
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
  if (!text) throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
  try {
    return JSON.parse(text) as EstimatedNutrition;
  } catch {
    throw new Error('AI가 유효한 영양 정보 형식으로 응답하지 않았어요. 다시 시도해주세요.');
  }
}

const GEMINI_TAG_SUGGESTION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    tagNames: {
      type: 'ARRAY',
      items: { type: 'STRING' },
      description:
        '이 레시피에 어울리는 태그 이름 2~4개(스타일/카테고리/국가 등 자유롭게). 기존 태그 목록에 맞는 게 ' +
        '있으면 그 이름 그대로 재사용하고, 없으면 새로 제안.',
    },
  },
  required: ['tagNames'],
} as const;

/** 이름/재료/조리순서를 보고 어울리는 태그를 제안한다(C-2, 온디맨드 전용 — 자동 적용 금지,
 * 호출부가 사용자에게 확인받은 태그만 실제로 붙여야 한다). */
export async function suggestRecipeTags(
  apiKey: string,
  model: string,
  recipe: { name: string; ingredients: { name: string }[]; steps: { title: string; content: string }[] },
  existingTagNames: string[],
): Promise<string[]> {
  const ingredientLines = recipe.ingredients.map((i) => `- ${i.name}`).join('\n');
  const stepLines = recipe.steps.map((s, i) => `${i + 1}. ${s.title}: ${s.content}`).join('\n');
  const existingNote =
    existingTagNames.length > 0 ? `기존 태그 목록(가능하면 재사용): ${existingTagNames.join(', ')}` : '기존 태그가 아직 없음.';
  const prompt =
    `다음 레시피의 이름/재료/조리법을 보고 어울리는 태그를 2~4개 제안해줘.\n\n${existingNote}\n\n` +
    `레시피: ${recipe.name}\n재료:\n${ingredientLines}\n\n조리 순서:\n${stepLines}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_TAG_SUGGESTION_SCHEMA,
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
  if (!text) throw new Error('Gemini 응답에서 텍스트를 찾을 수 없습니다.');
  try {
    const parsed = JSON.parse(text) as { tagNames: string[] };
    return parsed.tagNames;
  } catch {
    throw new Error('AI가 유효한 태그 제안 형식으로 응답하지 않았어요.');
  }
}

export interface YoutubeVideoMeta {
  title: string;
  description: string;
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
  existing: ExistingContext,
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
    `다음은 유튜브 요리 영상에서 얻은 정보야. 이 내용을 바탕으로 레시피(재료+수량+단위, 조리순서)를 구조화해줘. 정보가 부족하거나 추측한 부분이 많다면 warning 필드에 한국어로 설명해줘.\n\n${parts.join('\n\n')}\n\n${buildExistingContextNote(existing)}`,
  );
}

const PROPOSE_RECIPE_FUNCTION = {
  name: 'propose_recipe',
  description:
    '지금까지 파악한 레시피 전체를 구조화된 형태로 사용자 화면에 제안한다. 재료를 사서 쓰는지 직접 ' +
    '만드는지처럼 애매한 부분이 있으면 이 함수를 호출하기 전에 먼저 사용자에게 질문할 것.',
  parameters: GEMINI_RECIPE_SCHEMA,
};

/**
 * 레시피를 대화로 만들고 다듬는다(처음 설명하는 경우와 기존 초안을 수정하는 경우 모두 동일한 흐름).
 * 애매한 부분은 AI가 먼저 되물을 수 있고(자유 텍스트 응답), 충분한 정보가 모이면 propose_recipe 함수를
 * 호출해 구조화된 레시피로 갱신한다.
 */
export async function chatAboutRecipe(
  apiKey: string,
  model: string,
  history: ChatTurn[],
  useWebSearch: boolean,
  existing: ExistingContext,
  currentRecipe: RecipeSnapshot,
): Promise<ChatResult> {
  const tools: Record<string, unknown>[] = [{ functionDeclarations: [PROPOSE_RECIPE_FUNCTION] }];
  if (useWebSearch) {
    tools.push({ googleSearch: {} });
  }

  const currentRecipeNote = buildCurrentRecipeNote(currentRecipe);
  const systemPrompt = [RECIPE_CHAT_SYSTEM_PROMPT, buildExistingContextNote(existing), currentRecipeNote]
    .filter(Boolean)
    .join('\n\n');

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: history.map((turn) => ({
          role: turn.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: turn.text }],
        })),
        tools,
        // Gemini 3부터 내장 툴(googleSearch)과 커스텀 함수(propose_recipe)를 같이 쓰려면 명시적으로 켜야 함.
        ...(useWebSearch ? { toolConfig: { includeServerSideToolInvocations: true } } : {}),
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Gemini API 요청 실패 (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const parts: Array<{ text?: string; functionCall?: { name: string; args: unknown } }> =
    data.candidates?.[0]?.content?.parts ?? [];

  const textParts = parts.filter((p) => typeof p.text === 'string').map((p) => p.text as string);
  const proposeCalls = parts.filter((p) => p.functionCall?.name === 'propose_recipe');

  const updatedRecipe =
    proposeCalls.length > 0
      ? (proposeCalls[proposeCalls.length - 1].functionCall!.args as ExtractedRecipe)
      : null;

  return {
    reply:
      textParts.join('\n') ||
      (updatedRecipe ? '레시피 변경안을 준비했어요. 아래에서 확인하고 반영해주세요.' : '(응답을 받지 못했습니다)'),
    updatedRecipe,
  };
}

// 조리 단계 이미지와 완성 사진이 서로 다른 화풍으로 튀지 않도록 공유하는 스타일 가이드.
export const IMAGE_STYLE_GUIDE =
  '스타일: 따뜻한 톤의 자연광, 심플한 나무 도마 또는 밝은 대리석 조리대 배경, 스테인리스 또는 무광 ' +
  '블랙 냄비/팬, 과하지 않은 자연스러운 홈쿠킹 느낌으로 사진처럼 사실적으로 표현해줘.';

/** 레시피 이름 + 조리 단계 내용을 바탕으로 이미지 생성용 프롬프트를 만든다. */
export function buildStepImagePrompt(recipeName: string, step: { title: string; content: string }): string {
  return (
    `요리 레시피 "${recipeName}"의 조리 단계를 보여주는 사실적인 사진 스타일 이미지를 만들어줘. ` +
    `단계: "${step.title}" — ${step.content}. ` +
    `텍스트나 글자는 이미지에 넣지 말고, 실제 주방에서 그 단계를 진행하는 모습만 자연스럽게 표현해줘. ` +
    IMAGE_STYLE_GUIDE
  );
}

/** 레시피 이름 + 주요 재료/태그를 바탕으로 완성된 요리 사진 생성용 프롬프트를 만든다. */
export function buildFinalDishImagePrompt(
  recipeName: string,
  mainIngredientNames: string[],
  tagNames: string[],
): string {
  const ingredientsText = mainIngredientNames.length > 0 ? `주요 재료: ${mainIngredientNames.join(', ')}. ` : '';
  const tagsText = tagNames.length > 0 ? `스타일/느낌: ${tagNames.join(', ')}. ` : '';
  return (
    `요리 레시피 "${recipeName}"의 완성된 요리를 보여주는 사실적인 음식 사진을 만들어줘. ` +
    ingredientsText +
    tagsText +
    `그릇에 예쁘게 플레이팅된 완성 요리 모습만 보여주고, 텍스트나 글자는 넣지 마. ` +
    IMAGE_STYLE_GUIDE
  );
}

const IMAGE_GENERATION_TIMEOUT_MS = 60_000;
// 429(요청 제한)/503(모델 과부하)은 잠시 후 재시도하면 성공하는 경우가 많은 일시적 오류라 자동 재시도한다.
// 408은 실제 HTTP 응답이 아니라 우리 쪽 60초 타임아웃(AbortError)에 붙이는 sentinel 상태코드 —
// "🖼 전체 이미지 생성"처럼 여러 장을 한 번에 동시 요청(Promise.all)하면 개별 요청이 평소보다
// 느려져 60초를 넘기는 경우가 흔해서(모델 자체 문제가 아니라 동시 부하로 인한 지연), 이것도
// 일시적 오류로 보고 재시도 대상에 포함한다.
const RETRYABLE_STATUS_CODES = new Set([408, 429, 503]);
const IMAGE_GENERATION_MAX_RETRIES = 2; // 최초 시도 포함 총 3회

class GeminiImageError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestImageOnce(apiKey: string, model: string, prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), IMAGE_GENERATION_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['IMAGE'] },
        }),
        signal: controller.signal,
      },
    );
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new GeminiImageError(
        '이미지 생성이 60초 안에 끝나지 않아 중단했습니다. 잠시 후 다시 시도해주세요.',
        408,
      );
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GeminiImageError(`이미지 생성 요청 실패 (${res.status}): ${body.slice(0, 200)}`, res.status);
  }

  const data = await res.json();
  const parts: Array<{ inlineData?: { data?: string; mimeType?: string } }> =
    data.candidates?.[0]?.content?.parts ?? [];
  const imagePart = parts.find((p) => p.inlineData?.data);

  if (!imagePart?.inlineData?.data) {
    throw new Error('이미지 생성 결과를 받지 못했습니다.');
  }

  const mimeType = imagePart.inlineData.mimeType || 'image/png';
  return `data:${mimeType};base64,${imagePart.inlineData.data}`;
}

/**
 * 프롬프트로 이미지를 생성해 base64 데이터 URL로 반환한다(Gemini 전용 — Claude는 이미지 생성 미지원).
 * 실제 저장은 호출부에서 Supabase Storage(src/data/imageStore.ts)에 담당한다. 429/503처럼 일시적인
 * 오류는 지수 백오프(2초, 4초)로 자동 재시도하고, 그 외 오류는 즉시 던진다. 조리 단계 이미지와 완성
 * 사진 둘 다 같은 재시도 로직을 공유한다(`generateStepImage`/`generateFinalDishImage` 둘 다 이 함수).
 */
export async function generateImageWithRetry(apiKey: string, model: string, prompt: string): Promise<string> {
  for (let attempt = 0; attempt <= IMAGE_GENERATION_MAX_RETRIES; attempt++) {
    try {
      return await requestImageOnce(apiKey, model, prompt);
    } catch (err) {
      const isRetryable = err instanceof GeminiImageError && RETRYABLE_STATUS_CODES.has(err.status);
      if (!isRetryable || attempt === IMAGE_GENERATION_MAX_RETRIES) {
        throw err;
      }
      await sleep(2000 * 2 ** attempt);
    }
  }
  // 도달하지 않음(루프가 항상 return 또는 throw로 끝남)
  throw new Error('이미지 생성에 실패했습니다.');
}

export const generateStepImage = generateImageWithRetry;
export const generateFinalDishImage = generateImageWithRetry;

// 영수증 사진 → 식료품 품목 인식(Gemini 비전). rawText(원문 그대로)와 guessedName(정규화된
// 재료명)을 둘 다 반환해서, 확인 화면에서 사용자가 원본과 대조하며 검토할 수 있게 한다.
export interface ReceiptItem {
  rawText: string;
  guessedName: string;
  quantity?: number | null;
  unit?: string | null;
  /** 이 재료가 속할 것으로 추정되는 카테고리 이름(채소/육류·해산물 등) — 확인 화면의 카테고리
   * 드롭다운 기본값으로만 쓰이고, 기존 카테고리와 이름이 겹치면 그대로 재사용된다. */
  categoryName?: string | null;
  /** 품목명 해석이 불확실하거나 식료품인지 애매하면 true — 확인 화면에서 별도 섹션으로 모아 보여줌 */
  uncertain?: boolean | null;
}

const GEMINI_RECEIPT_ITEMS_SCHEMA = {
  type: 'ARRAY',
  items: {
    type: 'OBJECT',
    properties: {
      rawText: { type: 'STRING', description: '영수증에 인쇄된 품목명 원문 그대로(축약/오타 포함)' },
      guessedName: {
        type: 'STRING',
        description:
          '일반적으로 통용되는 식료품 재료 이름으로 정규화한 이름. 예: "무G부침" → "무", 축약/오타가 있으면 ' +
          '최대한 실제 의미로 해석해줘.',
      },
      quantity: { type: 'NUMBER', description: '수량(추정 가능하면 숫자로), 모르면 생략', nullable: true },
      unit: { type: 'STRING', description: '단위(개, g, 팩, 봉지 등 흔히 쓰는 단위), 모르면 생략', nullable: true },
      categoryName: {
        type: 'STRING',
        description:
          '이 재료의 카테고리(예: 채소, 과일, 육류·해산물·두부, 계란·유제품, 곡류·면류, 소스·양념, ' +
          '가공·냉동식품, 기타). 모르면 생략.',
        nullable: true,
      },
      uncertain: {
        type: 'BOOLEAN',
        description: '품목명 해석이 불확실하거나 식료품인지 애매하면 true, 확실하면 생략.',
        nullable: true,
      },
    },
    required: ['rawText', 'guessedName'],
  },
} as const;

const RECEIPT_PROMPT = `이 영수증 이미지에서 식료품 품목명과 수량을 추출해서 JSON 배열로 반환해줘.
- 품목명이 축약되어 있거나(예: "무G부침") 이해하기 어려우면 최대한 일반적인 재료명으로 해석해서 guessedName에 넣고, 원본은 rawText에 그대로 남겨줘.
- 수량/단위가 영수증에 표기돼 있으면 추출하고, 없으면 생략해도 돼.
- 세제, 휴지, 비닐봉투, 적립금, 할인, 카드결제 안내 같은 식료품이 아닌 항목은 결과에서 제외해줘.
- 해석이 불확실하거나 식료품인지 애매한 항목은 uncertain을 true로 표시해줘.
- 영수증 이미지가 아니거나 알아볼 수 있는 품목이 하나도 없으면 빈 배열 []을 반환해줘.`;

/** 영수증 이미지(base64, data: 접두사 없이)에서 식료품 품목을 추출한다. 항상 사용자 확인 화면을
 * 거친 뒤에만 실제로 재료에 반영되며(호출부 책임), 이 함수 자체는 인식만 하고 아무것도 저장하지 않는다. */
export async function extractReceiptItems(
  apiKey: string,
  model: string,
  imageBase64: string,
  mimeType: string,
): Promise<ReceiptItem[]> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: RECEIPT_PROMPT }, { inlineData: { mimeType, data: imageBase64 } }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GEMINI_RECEIPT_ITEMS_SCHEMA,
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
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('영수증 인식 결과를 읽지 못했어요. 다시 시도해주세요.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('영수증 인식 결과 형식이 올바르지 않습니다.');
  }
  return parsed as ReceiptItem[];
}
