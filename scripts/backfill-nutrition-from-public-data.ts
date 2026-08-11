// ============================================================================
// scripts/backfill-nutrition-from-public-data.ts
// ============================================================================
// scripts/seed-recipes-from-public-data.ts로 이미 심어둔 공공데이터(식약처 COOKRCP01) 레시피
// 200여 건에 영양 정보(content.nutrition)를 채워 넣는다 — 원래 시딩 스크립트가 COOKRCP01
// 응답의 INFO_ENG(열량)/INFO_CAR(탄수화물)/INFO_PRO(단백질)/INFO_FAT(지방)/INFO_NA(나트륨)
// 필드를 받아오긴 했지만 저장하지 않고 버렸던 것을 뒤늦게 채워 넣는 1회성 백필 스크립트.
//
// COOKRCP01은 RCP_SEQ로 단건 조회하는 파라미터를 지원하지 않아(테스트로 확인 —
// RCP_SEQ=n을 붙여도 무시되고 그냥 1번부터 반환됨) 전체 데이터셋(현재 약 1,156건)을
// 페이지 단위로 훑어 RCP_SEQ→영양정보 맵을 만든 뒤, 우리 DB에 이미 있는 공공데이터 시드
// 레시피(user_id=cookkit-system, content.sourceRcpSeq 보유)와 매칭해서 업데이트한다.
//
// 실행 방법:
//   node --env-file=.env scripts/backfill-nutrition-from-public-data.ts
//
// 재실행 안전(idempotent): 이미 content.nutrition이 있는 레시피는 건너뛴다.
// ============================================================================

import { createClient } from '@supabase/supabase-js';

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';
const PAGE_SIZE = 200;

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

interface NutritionInfo {
  calories: number;
  carbs: number;
  protein: number;
  fat: number;
  sodium: number;
}

function parseNutrition(row: Record<string, string | undefined>): NutritionInfo | null {
  const calories = Number(row.INFO_ENG);
  const carbs = Number(row.INFO_CAR);
  const protein = Number(row.INFO_PRO);
  const fat = Number(row.INFO_FAT);
  const sodium = Number(row.INFO_NA);
  if (![calories, carbs, protein, fat, sodium].every(Number.isFinite)) return null;
  return { calories, carbs, protein, fat, sodium };
}

async function fetchAllNutritionBySeq(): Promise<Map<string, NutritionInfo>> {
  const result = new Map<string, NutritionInfo>();
  let start = 1;
  let totalCount = Infinity;

  while (start <= totalCount) {
    const end = start + PAGE_SIZE - 1;
    const url = `http://openapi.foodsafetykorea.go.kr/api/${FOOD_API_KEY}/COOKRCP01/json/${start}/${end}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`공공데이터 API 호출 실패: HTTP ${res.status}`);
    const data = await res.json();
    const body = data?.COOKRCP01;
    if (!body) throw new Error(`공공데이터 API 응답 형식 이상: ${JSON.stringify(data).slice(0, 300)}`);
    if (body.RESULT && body.RESULT.CODE !== 'INFO-000') {
      throw new Error(`공공데이터 API 오류: ${body.RESULT.CODE} ${body.RESULT.MSG}`);
    }
    totalCount = Number(body.total_count) || 0;
    const rows = (body.row ?? []) as Record<string, string | undefined>[];
    for (const row of rows) {
      const seq = row.RCP_SEQ;
      if (!seq) continue;
      const nutrition = parseNutrition(row);
      if (nutrition) result.set(seq, nutrition);
    }
    console.log(`[영양정보 수집] ${start}~${end} (총 ${totalCount}건 중)`);
    start = end + 1;
  }
  return result;
}

async function main() {
  console.log('공공데이터에서 전체 레시피의 영양정보를 먼저 수집합니다...');
  const nutritionBySeq = await fetchAllNutritionBySeq();
  console.log(`영양정보 ${nutritionBySeq.size}건 수집 완료.`);

  const { data: recipes, error } = await supabase
    .from('recipes')
    .select('id, title, content')
    .eq('user_id', SYSTEM_USER_ID);
  if (error) throw error;

  let updated = 0;
  let alreadyHad = 0;
  let noSourceSeq = 0;
  let noMatch = 0;

  for (const recipe of recipes ?? []) {
    const content = (recipe.content ?? {}) as Record<string, unknown>;
    const sourceRcpSeq = content.sourceRcpSeq as string | undefined;
    if (!sourceRcpSeq) {
      noSourceSeq += 1;
      continue;
    }
    if (content.nutrition) {
      alreadyHad += 1;
      continue;
    }
    const nutrition = nutritionBySeq.get(sourceRcpSeq);
    if (!nutrition) {
      noMatch += 1;
      console.warn(`  [매칭 실패] ${recipe.title} (RCP_SEQ:${sourceRcpSeq})`);
      continue;
    }
    const { error: updateError } = await supabase
      .from('recipes')
      .update({ content: { ...content, nutrition, nutritionSource: 'public_data' } })
      .eq('id', recipe.id);
    if (updateError) {
      console.error(`  [업데이트 실패] ${recipe.title}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }

  console.log('\n===== 요약 =====');
  console.log({ updated, alreadyHad, noSourceSeq, noMatch, total: recipes?.length ?? 0 });
}

main().catch((err) => {
  console.error('스크립트 실행 중 오류:', err);
  process.exitCode = 1;
});
