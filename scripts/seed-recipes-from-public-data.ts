// ============================================================================
// scripts/seed-recipes-from-public-data.ts
// ============================================================================
// 식품의약품안전처 "조리식품의 레시피 DB"(COOKRCP01) 공공데이터 API에서 레시피를 가져와
// cookkit-system 계정(user_id: 00000000-0000-0000-0000-000000000001) 소유의 공개(visibility=
// 'public') 레시피로 시드 데이터를 생성한다. 앱의 정규 데이터 레이어(supabaseAdapter.ts)를
// 거치지 않고 Supabase에 service_role 키로 직접 쓴다 — cookkit-system은 auth.users에 SQL로
// 직접 만든 계정(0011_cookkit_system_account.sql)이라 로그인 세션이 없어 RLS를 우회해야 하기
// 때문(household 단위 RLS는 auth.uid() 기반이라 서버 스크립트에서는 애초에 통과 불가).
//
// 실행 방법:
//   node --env-file=.env scripts/seed-recipes-from-public-data.ts <start> <end> [batchId]
//   예: node --env-file=.env scripts/seed-recipes-from-public-data.ts 1 20 public-data-pilot
//
// 재실행 안전(idempotent): 각 레시피의 content.sourceRcpSeq(RCP_SEQ)로 이미 들어간 레시피는
// 건너뛴다 — 같은 범위를 다시 실행해도 중복 생성되지 않는다.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEFAULT_CATEGORY_NAME = '기타';
const SYSTEM_HOUSEHOLD_NAME = 'CookKit 시스템';
const FALLBACK_SECONDS_PER_STEP = 120; // src/lib/recipeTime.ts와 동일 규칙(타이머 없는 단계는 2분 보정)

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FOOD_API_KEY = process.env.FOOD_SAFETY_API_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error('VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY를 .env에 설정하세요.');
}
if (!FOOD_API_KEY) {
  throw new Error('FOOD_SAFETY_API_KEY를 .env에 설정하세요.');
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ----------------------------------------------------------------------------
// 1. 식품의약품안전처 API 응답 타입 + 호출
// ----------------------------------------------------------------------------
interface FoodApiRow {
  RCP_SEQ: string;
  RCP_NM: string;
  RCP_WAY2: string;
  RCP_PAT2: string;
  RCP_PARTS_DTLS: string;
  ATT_FILE_NO_MAIN?: string;
  [key: string]: string | undefined; // MANUAL01~20, MANUAL_IMG01~20
}

async function fetchRecipeRows(start: number, end: number): Promise<FoodApiRow[]> {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${FOOD_API_KEY}/COOKRCP01/json/${start}/${end}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`공공데이터 API 호출 실패: HTTP ${res.status}`);
  const data = await res.json();
  const body = data?.COOKRCP01;
  if (!body) throw new Error(`공공데이터 API 응답 형식 이상: ${JSON.stringify(data).slice(0, 300)}`);
  if (body.RESULT && body.RESULT.CODE !== 'INFO-000') {
    throw new Error(`공공데이터 API 오류: ${body.RESULT.CODE} ${body.RESULT.MSG}`);
  }
  return (body.row ?? []) as FoodApiRow[];
}

// ----------------------------------------------------------------------------
// 2. 재료 텍스트(RCP_PARTS_DTLS) 파싱
// ----------------------------------------------------------------------------
interface ParsedIngredient {
  name: string;
  amount: number;
  unit: string;
}

const NO_AMOUNT_UNITS = ['약간', '적당량', '조금'];

function parseIngredientItem(rawItem: string): ParsedIngredient | null {
  // 괄호 안 내용(부가 정보, 예: "(3/4모)")은 참고용이라 무시한다.
  const withoutParen = rawItem.replace(/\([^)]*\)/g, '').trim();
  if (!withoutParen) return null;

  // "이름 숫자단위" 형태 (예: "연두부 75g", "물 300ml")
  const measured = withoutParen.match(/^(.+?)\s+([\d.]+)\s*([가-힣a-zA-Z]+)$/);
  if (measured) {
    const [, name, amountStr, unit] = measured;
    const amount = Number.parseFloat(amountStr);
    if (name.trim() && Number.isFinite(amount)) {
      return { name: name.trim(), amount, unit: unit.trim() };
    }
  }

  // "이름 약간/적당량/조금" 형태 — 수량 없이 단위만 있는 경우
  for (const noAmountUnit of NO_AMOUNT_UNITS) {
    if (withoutParen.endsWith(noAmountUnit)) {
      const name = withoutParen.slice(0, withoutParen.length - noAmountUnit.length).trim();
      if (name) return { name, amount: 0, unit: noAmountUnit };
    }
  }

  // 그 외(수량/단위를 못 찾음) — 이름만이라도 amount=0으로 남긴다.
  return { name: withoutParen, amount: 0, unit: '' };
}

/**
 * RCP_PARTS_DTLS 원문을 줄바꿈 기준으로 나눈 뒤, 숫자가 없는 줄(메뉴명 반복, "고명" 같은 그룹
 * 라벨)은 건너뛰고, "●라벨 : "/"·라벨 : " 형태로 라벨과 재료가 한 줄에 섞여 있으면 라벨 부분만
 * 제거한다. "[1인분]"처럼 맨 앞에 붙는 인분 표기도 제거한다.
 */
export function parseIngredientsText(raw: string): { items: ParsedIngredient[]; skippedLines: string[] } {
  const items: ParsedIngredient[] = [];
  const skippedLines: string[] = [];
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    let content = line.replace(/^[●·]\s*[^:：]+[:：]\s*/, '');
    content = content.replace(/^\[[^\]]*\]/, '').trim();

    if (!/\d/.test(content)) {
      // 순수 라벨/메뉴명 반복 줄 — 무시(그룹명은 재료에 안 남김)
      continue;
    }

    const parts = content
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of parts) {
      const parsed = parseIngredientItem(part);
      if (parsed) {
        items.push(parsed);
      } else {
        skippedLines.push(part);
      }
    }
  }

  return { items, skippedLines };
}

// ----------------------------------------------------------------------------
// 3. 조리순서(MANUAL01~20) 매핑
// ----------------------------------------------------------------------------
interface ParsedStep {
  title: string;
  content: string;
  imageUrl?: string;
}

function makeStepTitle(content: string, index: number): string {
  // 첫 문장(마침표 기준)이 짧으면 그대로 제목으로 쓰고, 길거나 비면 "n단계"로 대체.
  // 쉼표로도 나눠보면 "재료 나열, 동작" 형태에서 재료 나열 부분만 잘려 제목처럼 보이는 문제가
  // 있어(예: "연두부, 달걀, ... 섞어 담는다" → "연두부"), 마침표만 기준으로 삼는다.
  const firstSentence = content.split('.')[0]?.trim() ?? '';
  if (firstSentence && firstSentence.length <= 18) return firstSentence;
  return `${index}단계`;
}

function mapSteps(row: FoodApiRow): ParsedStep[] {
  const steps: ParsedStep[] = [];
  for (let i = 1; i <= 20; i++) {
    const num = String(i).padStart(2, '0');
    const raw = (row[`MANUAL${num}`] ?? '').trim();
    if (!raw) continue;

    const withoutNumberPrefix = raw.replace(/^\d+\.\s*/, '').trim();
    // 일부 항목 끝에 알파벳 한 글자가 붙어있는 원본 데이터 특유의 잔재(예: "...건진다.a")를 제거.
    const cleaned = withoutNumberPrefix.replace(/(?<=[.가-힣])[a-zA-Z]$/, '').trim();
    if (!cleaned) continue;

    const imageUrl = row[`MANUAL_IMG${num}`]?.trim() || undefined;
    steps.push({ title: makeStepTitle(cleaned, i), content: cleaned, imageUrl });
  }
  return steps;
}

// ----------------------------------------------------------------------------
// 4. system household / 기타 카테고리 준비 (idempotent)
// ----------------------------------------------------------------------------
async function ensureSystemHousehold(): Promise<{ householdId: string; categoryId: string }> {
  const { data: existingMember, error: memberError } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', SYSTEM_USER_ID)
    .maybeSingle();
  if (memberError) throw memberError;

  let householdId: string;
  if (existingMember) {
    householdId = existingMember.household_id as string;
  } else {
    const { data: household, error } = await supabase
      .from('households')
      .insert({ name: SYSTEM_HOUSEHOLD_NAME, created_by: SYSTEM_USER_ID })
      .select('id')
      .single();
    if (error) throw error;
    householdId = household.id as string;

    const { error: insertMemberError } = await supabase
      .from('household_members')
      .insert({ household_id: householdId, user_id: SYSTEM_USER_ID });
    if (insertMemberError) throw insertMemberError;

    console.log(`[system household] 새로 생성함: ${householdId}`);
  }

  const { data: existingCategory, error: categoryError } = await supabase
    .from('categories')
    .select('id')
    .eq('household_id', householdId)
    .eq('name', DEFAULT_CATEGORY_NAME)
    .maybeSingle();
  if (categoryError) throw categoryError;

  let categoryId: string;
  if (existingCategory) {
    categoryId = existingCategory.id as string;
  } else {
    const { data: category, error } = await supabase
      .from('categories')
      .insert({ household_id: householdId, name: DEFAULT_CATEGORY_NAME })
      .select('id')
      .single();
    if (error) throw error;
    categoryId = category.id as string;
  }

  return { householdId, categoryId };
}

// ----------------------------------------------------------------------------
// 5. 태그/재료 캐시 + resolve (배치 내 중복 생성 방지 — CLAUDE.md의 "순차 처리 + 배치 내 캐시" 패턴)
// ----------------------------------------------------------------------------
const tagCache = new Map<string, string>();
const ingredientCache = new Map<string, string>();

async function preloadCaches(householdId: string): Promise<void> {
  const [{ data: tags, error: tagError }, { data: ingredients, error: ingredientError }] = await Promise.all([
    supabase.from('tags').select('id, name, type').eq('household_id', householdId),
    supabase.from('ingredients').select('id, name').eq('household_id', householdId),
  ]);
  if (tagError) throw tagError;
  if (ingredientError) throw ingredientError;
  for (const tag of tags ?? []) tagCache.set(`${tag.type}:${tag.name}`, tag.id as string);
  for (const ingredient of ingredients ?? []) ingredientCache.set(ingredient.name as string, ingredient.id as string);
}

async function resolveTag(householdId: string, name: string, type: 'style' | 'category'): Promise<string> {
  const cacheKey = `${type}:${name}`;
  const cached = tagCache.get(cacheKey);
  if (cached) return cached;

  const { data: created, error } = await supabase
    .from('tags')
    .insert({ household_id: householdId, name, type })
    .select('id')
    .single();
  if (error) throw error;
  tagCache.set(cacheKey, created.id as string);
  return created.id as string;
}

async function resolveIngredient(householdId: string, categoryId: string, parsed: ParsedIngredient): Promise<string> {
  const cached = ingredientCache.get(parsed.name);
  if (cached) return cached;

  const { data: created, error } = await supabase
    .from('ingredients')
    .insert({
      household_id: householdId,
      category_id: categoryId,
      name: parsed.name,
      unit: parsed.unit || null,
      allergens: [],
      owned: false,
    })
    .select('id')
    .single();
  if (error) throw error;
  ingredientCache.set(parsed.name, created.id as string);
  return created.id as string;
}

// ----------------------------------------------------------------------------
// 6. 이미지 다운로드 → Supabase Storage 업로드 (실패해도 무시하고 진행)
// ----------------------------------------------------------------------------
const STORAGE_BUCKET = 'recipe-images';

async function downloadAndStoreImage(
  sourceUrl: string,
  householdId: string,
  recipeId: string,
  kind: 'step' | 'final',
): Promise<string | undefined> {
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const arrayBuffer = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const path = `${householdId}/${recipeId}/${kind}/${crypto.randomUUID()}`;
    const { error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, Buffer.from(arrayBuffer), { contentType, upsert: true });
    if (error) throw error;
    return path;
  } catch (err) {
    console.warn(`  [이미지 실패] ${sourceUrl} - ${(err as Error).message}`);
    return undefined;
  }
}

// ----------------------------------------------------------------------------
// 7. 난이도/조리시간 계산 (src/lib/recipeDifficulty.ts, recipeTime.ts와 동일 규칙)
// ----------------------------------------------------------------------------
type Difficulty = 'easy' | 'medium' | 'hard';

function estimateCookMinutes(stepCount: number): number {
  return Math.round((stepCount * FALLBACK_SECONDS_PER_STEP) / 60);
}

function computeDifficulty(ingredientCount: number, cookMinutes: number, stepCount: number): { difficulty: Difficulty; reason: string } {
  let score = 0;
  if (ingredientCount > 10) score += 2;
  else if (ingredientCount > 5) score += 1;
  if (cookMinutes > 60) score += 2;
  else if (cookMinutes > 30) score += 1;
  if (stepCount > 5) score += 1;
  const difficulty: Difficulty = score <= 1 ? 'easy' : score <= 3 ? 'medium' : 'hard';
  const label = { easy: '쉬움', medium: '보통', hard: '어려움' }[difficulty];
  return {
    difficulty,
    reason: `재료 ${ingredientCount}개, 예상 조리시간 약 ${cookMinutes}분, 조리단계 ${stepCount}개 기준으로 자동 판단됨 (${label}) — 공공데이터 기반 추정치라 타이머 정보는 없음`,
  };
}

// ----------------------------------------------------------------------------
// 8. 레시피 1건 처리
// ----------------------------------------------------------------------------
interface ProcessResult {
  status: 'created' | 'skipped_duplicate' | 'skipped_no_ingredients' | 'skipped_category_filter' | 'failed';
  rcpSeq: string;
  name: string;
  detail?: string;
}

async function recipeAlreadyExists(rcpSeq: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('recipes')
    .select('id')
    .eq('user_id', SYSTEM_USER_ID)
    .contains('content', { sourceRcpSeq: rcpSeq })
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function processRow(
  row: FoodApiRow,
  householdId: string,
  categoryId: string,
  seedBatchId: string,
  categoryFilter?: string[],
): Promise<ProcessResult> {
  const rcpSeq = row.RCP_SEQ;
  const name = row.RCP_NM?.trim() || `레시피 ${rcpSeq}`;

  // 특정 RCP_PAT2(요리종류)만 골라 담고 싶을 때 쓰는 필터 — 카테고리 분포가 한쪽(반찬)에
  // 쏠렸을 때 후식/국&찌개 등 부족한 종류만 추가로 채워 넣는 용도.
  if (categoryFilter && categoryFilter.length > 0 && !categoryFilter.includes(row.RCP_PAT2?.trim())) {
    return { status: 'skipped_category_filter', rcpSeq, name };
  }

  if (await recipeAlreadyExists(rcpSeq)) {
    return { status: 'skipped_duplicate', rcpSeq, name };
  }

  const { items: parsedIngredients, skippedLines } = parseIngredientsText(row.RCP_PARTS_DTLS ?? '');
  if (parsedIngredients.length === 0) {
    return { status: 'skipped_no_ingredients', rcpSeq, name, detail: `재료 파싱 실패(원문: ${row.RCP_PARTS_DTLS?.slice(0, 80)})` };
  }
  if (skippedLines.length > 0) {
    console.warn(`  [재료 파싱 일부 실패] ${name}: ${skippedLines.join(' / ')}`);
  }

  try {
    const recipeId = crypto.randomUUID();

    // 재료 순차 처리 + 배치 내 캐시(CLAUDE.md "카테고리 중복 생성 레이스 컨디션" 교훈 재사용) —
    // Promise.all로 동시에 새 재료를 만들면 같은 이름이 다른 id로 중복 생성될 수 있다.
    const recipeIngredients: { ingredientId: string; amount: number; unit: string }[] = [];
    for (const parsed of parsedIngredients) {
      const ingredientId = await resolveIngredient(householdId, categoryId, parsed);
      recipeIngredients.push({ ingredientId, amount: parsed.amount, unit: parsed.unit });
    }

    const parsedSteps = mapSteps(row);
    const steps: { title: string; content: string; imageId?: string }[] = [];
    for (const step of parsedSteps) {
      let imageId: string | undefined;
      if (step.imageUrl) {
        imageId = await downloadAndStoreImage(step.imageUrl, householdId, recipeId, 'step');
      }
      steps.push({ title: step.title, content: step.content, imageId });
    }

    let finalImageId: string | undefined;
    if (row.ATT_FILE_NO_MAIN?.trim()) {
      finalImageId = await downloadAndStoreImage(row.ATT_FILE_NO_MAIN.trim(), householdId, recipeId, 'final');
    }

    const tagIds: string[] = [];
    if (row.RCP_PAT2?.trim()) tagIds.push(await resolveTag(householdId, row.RCP_PAT2.trim(), 'category'));
    if (row.RCP_WAY2?.trim()) tagIds.push(await resolveTag(householdId, row.RCP_WAY2.trim(), 'style'));

    const cookMinutes = estimateCookMinutes(steps.length);
    const { difficulty, reason } = computeDifficulty(recipeIngredients.length, cookMinutes, steps.length);

    const { error: insertError } = await supabase.from('recipes').insert({
      id: recipeId,
      user_id: SYSTEM_USER_ID,
      title: name,
      visibility: 'public',
      content: {
        servingsBase: 1,
        ingredients: recipeIngredients,
        steps,
        difficulty,
        difficultyReason: reason,
        estimatedMinutes: cookMinutes,
        finalImageId,
        sourceType: 'public_data',
        sourceNote: `식품의약품안전처 조리식품의 레시피 DB (RCP_SEQ: ${rcpSeq})`,
        sourceRcpSeq: rcpSeq,
        seedBatchId,
      },
    });
    if (insertError) throw insertError;

    if (tagIds.length > 0) {
      const { error: tagInsertError } = await supabase
        .from('recipe_tags')
        .insert(tagIds.map((tagId) => ({ recipe_id: recipeId, tag_id: tagId })));
      if (tagInsertError) throw tagInsertError;
    }

    return { status: 'created', rcpSeq, name };
  } catch (err) {
    return { status: 'failed', rcpSeq, name, detail: (err as Error).message };
  }
}

// ----------------------------------------------------------------------------
// 9. 메인
// ----------------------------------------------------------------------------
async function main() {
  const [startArg, endArg, batchArg, categoryFilterArg] = process.argv.slice(2);
  const start = Number.parseInt(startArg ?? '1', 10);
  const end = Number.parseInt(endArg ?? '20', 10);
  const seedBatchId = batchArg ?? `public-data-${new Date().toISOString().slice(0, 10)}`;
  // 5번째 인자로 "후식,국&찌개"처럼 쉼표로 RCP_PAT2 값을 주면 그 카테고리만 골라 담는다
  // (카테고리 분포가 한쪽으로 쏠렸을 때 부족한 종류만 추가 수집하는 용도).
  const categoryFilter = categoryFilterArg ? categoryFilterArg.split(',').map((s) => s.trim()) : undefined;

  console.log(
    `공공데이터 API에서 ${start}~${end}번 레시피를 가져옵니다 (batch: ${seedBatchId}${categoryFilter ? `, 카테고리 필터: ${categoryFilter.join('/')}` : ''})`,
  );

  const { householdId, categoryId } = await ensureSystemHousehold();
  await preloadCaches(householdId);

  const rows = await fetchRecipeRows(start, end);
  console.log(`${rows.length}건 응답받음`);

  const results: ProcessResult[] = [];
  for (const row of rows) {
    const result = await processRow(row, householdId, categoryId, seedBatchId, categoryFilter);
    results.push(result);
    if (result.status !== 'skipped_category_filter') {
      console.log(`[${result.status}] ${result.name} (RCP_SEQ:${result.rcpSeq})${result.detail ? ` - ${result.detail}` : ''}`);
    }
  }

  const summary = {
    created: results.filter((r) => r.status === 'created').length,
    skipped_duplicate: results.filter((r) => r.status === 'skipped_duplicate').length,
    skipped_no_ingredients: results.filter((r) => r.status === 'skipped_no_ingredients').length,
    skipped_category_filter: results.filter((r) => r.status === 'skipped_category_filter').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
  console.log('\n===== 요약 =====');
  console.log(summary);
  const problems = results.filter((r) => r.status === 'failed' || r.status === 'skipped_no_ingredients');
  if (problems.length > 0) {
    console.log('\n===== 실패/스킵 상세 =====');
    for (const p of problems) console.log(`- [${p.status}] ${p.name} (RCP_SEQ:${p.rcpSeq}): ${p.detail}`);
  }
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err);
  process.exitCode = 1;
});
