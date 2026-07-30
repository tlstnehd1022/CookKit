import Anthropic from '@anthropic-ai/sdk';
import {
  RECIPE_CHAT_SYSTEM_PROMPT,
  buildCurrentRecipeNote,
  buildExistingContextNote,
  type ChatResult,
  type ChatTurn,
  type ExistingContext,
} from './aiChat.js';
import type { RecipeSnapshot } from './recipeDiff.js';

export const AVAILABLE_MODELS = [
  { id: 'claude-opus-4-8', label: 'Claude Opus 4.8 (기본, 가장 정확함)' },
  { id: 'claude-sonnet-5', label: 'Claude Sonnet 5 (빠르고 저렴)' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5 (가장 저렴)' },
] as const;

export const DEFAULT_MODEL = 'claude-opus-4-8';

export interface ExtractedRecipe {
  name: string;
  servingsBase: number;
  ingredients: { name: string; amount: number; unit: string; categoryName?: string | null }[];
  steps: { title: string; content: string; timerSeconds?: number | null }[];
  tagNames?: string[] | null;
  warning?: string | null;
  difficulty?: 'easy' | 'medium' | 'hard' | null;
  difficultyReason?: string | null;
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
          name: { type: 'string', description: '재료 이름 (이미 등록된 재료와 같으면 그 이름 그대로)' },
          amount: { type: 'number', description: '수량 (숫자만)' },
          unit: { type: 'string', description: '단위 (예: g, ml, 개, 큰술)' },
          categoryName: {
            type: ['string', 'null'],
            description: '이 재료의 카테고리 이름. 기존 카테고리 목록 중 하나를 최대한 사용, 없으면 새로 제안.',
          },
        },
        required: ['name', 'amount', 'unit', 'categoryName'],
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
    tagNames: {
      type: ['array', 'null'],
      items: { type: 'string' },
      description: '이 레시피에 어울리는 스타일/카테고리 태그 이름들. 기존 태그 목록을 최대한 재사용.',
    },
    warning: {
      type: ['string', 'null'],
      description:
        '추출 결과가 불확실하거나 정보가 부족했을 경우 사용자에게 보여줄 경고 메시지. 문제없으면 null.',
    },
    difficulty: {
      type: ['string', 'null'],
      description:
        '난이도 판단. easy=30분 이내·재료 5가지 이하·특수 도구 불필요, medium=1시간 이내·기본 도구로 가능, ' +
        'hard=1시간 이상 걸리거나 특수 기술/도구가 필요. 값은 "easy", "medium", "hard" 중 하나.',
    },
    difficultyReason: {
      type: ['string', 'null'],
      description: '난이도를 이렇게 판단한 근거를 한국어 한 문장으로.',
    },
  },
  required: [
    'name',
    'servingsBase',
    'ingredients',
    'steps',
    'tagNames',
    'warning',
    'difficulty',
    'difficultyReason',
  ],
  additionalProperties: false,
} as const;

/**
 * 유튜브 영상에서 이미 추출된 자막 텍스트(/api/youtube-transcript, 별도 서버리스 함수)를 받아
 * 레시피로 구조화한다. Claude가 직접 영상 페이지를 읽는 대신 자막 텍스트를 입력으로 쓰므로
 * output_config.format(강제 구조화 응답)만으로 충분하다.
 */
export async function extractRecipeFromTranscript(
  apiKey: string,
  model: string,
  transcriptText: string,
  existing: ExistingContext,
): Promise<ExtractedRecipe> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const response = await client.messages.create({
    model,
    max_tokens: 4096,
    output_config: {
      format: { type: 'json_schema', schema: RECIPE_SCHEMA },
      effort: 'medium',
    },
    messages: [
      {
        role: 'user',
        content:
          `다음은 유튜브 요리 영상에서 추출한 자막 텍스트야. 이 내용을 바탕으로 레시피(재료+수량+단위, 조리순서)를 정리해줘. 자막이라 구어체나 요리와 무관한 문구(인사말, 광고 등)가 섞여 있을 수 있으니 그런 부분은 무시하고, 정보가 부족하거나 추측한 부분이 많다면 warning 필드에 그 사실을 한국어로 설명해줘.\n\n자막:\n${transcriptText}\n\n` +
          buildExistingContextNote(existing),
      },
    ],
  });

  return parseRecipeResponse(response);
}

const PROPOSE_RECIPE_TOOL: Anthropic.Tool = {
  name: 'propose_recipe',
  description:
    '지금까지 파악한 레시피 전체를 구조화된 형태로 사용자 화면에 제안합니다. 재료를 사서 쓰는지 직접 ' +
    '만드는지처럼 애매한 부분이 있으면 이 도구를 호출하기 전에 먼저 사용자에게 질문하세요.',
  input_schema: RECIPE_SCHEMA as unknown as Anthropic.Tool['input_schema'],
};

/**
 * 레시피를 대화로 만들고 다듬는다(처음 설명하는 경우와 기존 초안을 수정하는 경우 모두 동일한 흐름).
 * 애매한 부분은 AI가 먼저 되물을 수 있고(자유 텍스트 응답), 충분한 정보가 모이면 propose_recipe 툴을
 * 호출해 구조화된 레시피로 갱신한다. output_config.format(강제 구조화 응답)은 쓰지 않는다 — 질문과
 * 구조화 제안을 한 응답에서 섞어야 하기 때문.
 */
export async function chatAboutRecipe(
  apiKey: string,
  model: string,
  history: ChatTurn[],
  useWebSearch: boolean,
  existing: ExistingContext,
  currentRecipe: RecipeSnapshot,
): Promise<ChatResult> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const tools = useWebSearch
    ? [PROPOSE_RECIPE_TOOL, { type: 'web_search_20260209' as const, name: 'web_search' as const, max_uses: 3 }]
    : [PROPOSE_RECIPE_TOOL];

  const messages: Anthropic.MessageParam[] = history.map((turn) => ({
    role: turn.role,
    content: turn.text,
  }));

  const currentRecipeNote = buildCurrentRecipeNote(currentRecipe);
  const systemPrompt = [RECIPE_CHAT_SYSTEM_PROMPT, buildExistingContextNote(existing), currentRecipeNote]
    .filter(Boolean)
    .join('\n\n');

  let updatedRecipe: ExtractedRecipe | null = null;
  let reply = '';

  for (let i = 0; i < 4; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      tools,
      messages,
    });

    messages.push({ role: 'assistant', content: response.content });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    if (textBlocks.length > 0) {
      reply = textBlocks.map((b) => b.text).join('\n');
    }

    const proposeCalls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use' && b.name === 'propose_recipe',
    );

    if (proposeCalls.length === 0) {
      break;
    }

    updatedRecipe = proposeCalls[proposeCalls.length - 1].input as ExtractedRecipe;

    const toolResults: Anthropic.ToolResultBlockParam[] = proposeCalls.map((call) => ({
      type: 'tool_result',
      tool_use_id: call.id,
      content: '레시피 초안이 사용자 화면에 반영되었습니다.',
    }));
    messages.push({ role: 'user', content: toolResults });

    if (response.stop_reason !== 'tool_use') {
      break;
    }
  }

  return {
    reply: reply || (updatedRecipe ? '레시피 변경안을 준비했어요. 아래에서 확인하고 반영해주세요.' : '(응답을 받지 못했습니다)'),
    updatedRecipe,
  };
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
