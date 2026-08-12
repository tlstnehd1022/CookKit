import type { MealPlan, MealType } from '../data/types';

/** 끼니 순서(간식은 시간 판단에서 제외되지만 순서상 맨 뒤에 위치) — mealPlans.ts의 내부 정렬
 * 기준과 같은 값이지만, lib/ 모듈이 data/ 계층에 런타임 의존하지 않도록 여기서 별도로 둔다. */
const MEAL_TYPE_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

/** 끼니별 "아직 지나지 않음" 판정 시각 기준(시, 24시간제) — 간식은 시간 기준이 없어(항상 지나지
 * 않은 것으로 취급) 여기 없음. */
const MEAL_TIME_CUTOFF_HOUR: Partial<Record<MealType, number>> = {
  breakfast: 10,
  lunch: 15,
  dinner: 21,
};

function sortByMealOrder(plans: MealPlan[]): MealPlan[] {
  return [...plans].sort(
    (a, b) => MEAL_TYPE_ORDER[a.mealType] - MEAL_TYPE_ORDER[b.mealType] || a.sortOrder - b.sortOrder,
  );
}

/** 지금 이 순간이 "몇 시 끼니대"인지 아침/점심/저녁 셋 중 하나로 항상 분류한다(간식 제외) —
 * 실제 계획 여부와 무관하게 시간대 자체를 표시해야 하는 곳(홈 화면 상단 인사 줄 등)에서 쓴다.
 * 다음 끼니 판정(pickNextMealPlan)과 같은 시간 기준(MEAL_TIME_CUTOFF_HOUR)을 공유해서 화면마다
 * 다른 기준을 쓰는 어긋남이 생기지 않게 한다. */
export function currentMealPeriod(now: Date = new Date()): 'breakfast' | 'lunch' | 'dinner' {
  const hour = now.getHours();
  if (hour < MEAL_TIME_CUTOFF_HOUR.breakfast!) return 'breakfast';
  if (hour < MEAL_TIME_CUTOFF_HOUR.lunch!) return 'lunch';
  return 'dinner';
}

/**
 * 그 날 계획(dayPlans) 중 "다음 끼니"에 해당하는 메뉴 하나를 고른다.
 * - 오늘이면: 현재 시각 기준 아직 지나지 않은 끼니(실제로 계획이 있는 것만 후보) 중 가장 이른
 *   것을 반환. 예: 오후 3시에 점심·저녁이 모두 계획돼 있으면 점심은 이미 지났으므로(점심 기준
 *   15시) 저녁을 반환. 계획된 끼니가 전부 지났으면 그 날 첫 번째 메뉴로 폴백.
 * - 오늘이 아니면: 시간 개념이 없으므로 그 날 첫 번째 메뉴(끼니 순서 → sortOrder 기준)를 반환.
 *
 * 주간 일정의 "큰 카드" 선정(어떤 끼니 조합이든 항상 이미지가 하나는 나오게)과 홈 인사말/주간
 * 스트립의 "오늘은 OO예요" 대상 메뉴 선정이 이 함수를 공유한다.
 */
export function pickNextMealPlan(dayPlans: MealPlan[], isToday: boolean, now: Date = new Date()): MealPlan | undefined {
  if (dayPlans.length === 0) return undefined;
  const sorted = sortByMealOrder(dayPlans);
  if (!isToday) return sorted[0];

  const hour = now.getHours();
  // sorted가 이미 끼니 순서대로 정렬돼 있으므로, 등장하는 끼니 종류를 그 순서 그대로 중복 없이 뽑는다.
  const presentTypesInOrder = Array.from(new Set(sorted.map((p) => p.mealType)));
  for (const type of presentTypesInOrder) {
    const cutoff = MEAL_TIME_CUTOFF_HOUR[type];
    const notPassed = cutoff === undefined || hour < cutoff;
    if (notPassed) {
      return sorted.find((p) => p.mealType === type);
    }
  }
  // 계획된 끼니가(간식 제외) 전부 지났으면 그 날 첫 번째 메뉴로 폴백
  return sorted[0];
}
