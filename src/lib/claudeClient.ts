import Anthropic from '@anthropic-ai/sdk';

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (기본, 가장 정확함)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (빠르고 저렴)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (가장 저렴)' },
] as const;

export const DEFAULT_MODEL = 'claude-opus-4-8';

export interface ExtractedRecipe {
  name: string;
  servingsBase: number;
  ingredients: { name: string; amount: number; unit: string }[];
  steps: { title: string; content: string; timerSeconds?: number | null }[];
  warning?: string | null;
}

const RECIPE_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: '레시피 이름' },
    servingsBase: { type: 'integer', description: '기준 인분 수' },
    ingredients: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '재료 이름' },
          amount: { type: 'number', description: '수량 (숫자만)' },
          unit: { type: 'string', description: '단위 (예: g, ml, 개, 큰술)' },
        },
        required: ['name', 'amount', 'unit'],
        additionalProperties: false,
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string', description: '조리 단계 제목' },
          content: { type: 'string', description: '조리 단계 상세 설명' },
          timerSeconds: {
            type: ['integer', 'null'],
            description: '이 단계에 타이머가 필요하면 초 단위 시간, 아니면 null',
          },
        },
        required: ['title', 'content', 'timerSeconds'],
        additionalProperties: false,
      },
    },
    warning: {
      type: ['string', 'null'],
      description:
        '추출 결과가 불확실하거나 정보가 부족했을 경우 사용자에게 보여줄 경고 메시지. 문제없으면 null.',
    },
  },
  required: ['name', 'servingsBase', 'ingredients', 'steps', 'warning'],
  additionalProperties: false,
} as const;

export async function extractRecipeFromText(
  apiKey: string,
  model: string,
  description: string,
): Promise<ExtractedRecipe> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    output_config: {
      format: { type: 'json_schema', schema: RECIPE_SCHEMA },
      effort: 'low',
    },
    messages: [
      {
        role: 'user',
        content: `다음 설명을 레시피 형태(재료+수량+단위, 조리순서)로 구조화해줘. 재료 이름은 한국어로, 일반적으로 쓰이는 명칭으로 정리해줘.\n\n${description}`,
      },
    ],
  });

  return parseRecipeResponse(response);
}

/**
 * 유튜브 링크에서 레시피를 추출한다. Claude의 서버사이드 web_fetch 툴로 영상 페이지(자막/설명란)를
 * 읽어오게 한 뒤 구조화한다. 유튜브는 공식 자막 API가 없어 자막을 못 가져오는 영상도 있을 수 있으니
 * best-effort로 취급하고, 결과는 항상 사용자가 검토 후 저장하는 기존 편집 흐름을 그대로 탄다.
 */
export async function extractRecipeFromYoutubeUrl(
  apiKey: string,
  model: string,
  url: string,
): Promise<ExtractedRecipe> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    tools: [{ type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 5 }],
    output_config: {
      format: { type: 'json_schema', schema: RECIPE_SCHEMA },
      effort: 'medium',
    },
    messages: [
      {
        role: 'user',
        content: `다음 유튜브 영상에서 레시피를 추출해줘: ${url}\n\n이 영상 페이지를 확인해서 자막(스크립트)이 있으면 자막 내용을 바탕으로, 자막을 가져올 수 없다면 영상 제목과 설명란 텍스트를 최대한 활용해서 재료(이름+수량+단위)와 조리순서를 정리해줘. 정보가 부족하거나 추측한 부분이 많다면 warning 필드에 그 사실을 한국어로 설명해줘.`,
      },
    ],
  });

  return parseRecipeResponse(response);
}

function parseRecipeResponse(response: Anthropic.Message): ExtractedRecipe {
  // 서버사이드 툴(web_fetch) 사용 시 여러 콘텐츠 블록이 섞일 수 있어, 구조화된 JSON이 담긴
  // 마지막 텍스트 블록을 사용한다.
  const textBlocks = response.content.filter(
    (block): block is Anthropic.TextBlock => block.type === 'text',
  );
  const lastTextBlock = textBlocks[textBlocks.length - 1];
  if (!lastTextBlock) {
    throw new Error('AI 응답에서 텍스트를 찾을 수 없습니다.');
  }
  return JSON.parse(lastTextBlock.text) as ExtractedRecipe;
}
