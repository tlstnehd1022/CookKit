import { currentMealPeriod } from './mealTime';
import { MEAL_TYPE_LABEL } from '../data/mealPlans';
import type { MealType } from '../data/types';

export type GreetingTimeSlot = 'morning' | 'day' | 'evening';

export const TIME_SLOT_LABEL: Record<GreetingTimeSlot, string> = {
  morning: '아침',
  day: '점심',
  evening: '저녁',
};

const MORNING_POOL = ['좋은 아침이에요', '오늘 아침은 뭘로 할까요?'];
const DAY_POOL = ['점심 뭐 먹지?', '오늘 뭐 만들어볼까요?'];
const EVENING_POOL = ['오늘 뭐 먹지?', '저녁 뭐 해먹지?'];
const WEEKEND_POOL = ['느긋하게 뭐 해먹을까요?', '주말엔 뭐 만들어볼까요?'];

const MEAL_PERIOD_TO_TIME_SLOT: Record<'breakfast' | 'lunch' | 'dinner', GreetingTimeSlot> = {
  breakfast: 'morning',
  lunch: 'day',
  dinner: 'evening',
};

// src/lib/mealTime.ts의 "다음 끼니" 판정과 같은 시간 기준(아침~10시/점심~15시/저녁)을 그대로
// 써서, 홈 화면 상단 인사 줄(시간대 표시)과 "오늘은 OO예요" 메뉴 안내가 서로 어긋나지 않게 한다.
function getTimeSlot(now: Date): GreetingTimeSlot {
  return MEAL_PERIOD_TO_TIME_SLOT[currentMealPeriod(now)];
}

// 문구 풀에서 "같은 날엔 같은 문구" 유지용 — 날짜(+선택적 추가 시드) 문자열을 해시해서 항상
// 같은 인덱스가 나오게 한다(localStorage 등 별도 저장 없이 순수 함수로 안정적 선택 가능).
function stableIndex(seed: string, length: number): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % length;
}

export interface GreetingContext {
  now: Date;
  /** YYYY-MM-DD — 문구 풀 내 안정적 선택의 시드(날짜가 바뀌면 자연히 새로 뽑힘) */
  dateStr: string;
  /** 오늘 이미 요리 기록이 있으면 그 레시피 이름(household 공유 — 누가 만들었든 인정) */
  cookedTodayRecipeName?: string;
  /** 오늘 "다음 끼니"(mealTime.ts pickNextMealPlan 기준)에 배치된 메뉴 — 그 끼니에 메뉴가
   * 여러 개면 menuLabel이 이미 "OO 외 n개" 형태로 요약돼 들어온다. */
  todayNextMeal?: { mealType: MealType; menuLabel: string };
  /** 유통기한 임박(3일 이내) 재료 중 가장 급한 것의 이름 */
  expiringIngredientName?: string;
  /** 장보기에 담긴 레시피가 하나라도 있는지 */
  hasShoppingSelection?: boolean;
}

export interface GreetingResult {
  text: string;
  timeSlot: GreetingTimeSlot;
}

/**
 * 우선순위 1~4(오늘 요리함 → 오늘 식단 계획 → 유통기한 임박 → 장보기 담김) 중 조건에 맞는 첫
 * 번째를 쓰고, 전부 해당 없으면 시간대·요일 기반 기본 문구 풀에서 하나를 고른다. AI 호출 없이
 * 전부 규칙 기반 — 홈은 가장 자주 열리는 화면이라 비용·지연 부담을 피한다.
 */
export function pickGreeting(ctx: GreetingContext): GreetingResult {
  const timeSlot = getTimeSlot(ctx.now);
  const isWeekend = ctx.now.getDay() === 0 || ctx.now.getDay() === 6;

  if (ctx.cookedTodayRecipeName) {
    const pool = ['오늘도 수고하셨어요', '잘 드셨어요?', `오늘 ${ctx.cookedTodayRecipeName} 어떠셨어요?`];
    return { text: pool[stableIndex(ctx.dateStr + 'cooked', pool.length)], timeSlot };
  }
  if (ctx.todayNextMeal) {
    return {
      text: `오늘 ${MEAL_TYPE_LABEL[ctx.todayNextMeal.mealType]}은 ${ctx.todayNextMeal.menuLabel}예요`,
      timeSlot,
    };
  }
  if (ctx.expiringIngredientName) {
    return { text: `${ctx.expiringIngredientName}, 오늘 쓰기 좋아요`, timeSlot };
  }
  if (ctx.hasShoppingSelection) {
    return { text: '장 보러 가는 날인가요?', timeSlot };
  }

  const pool = isWeekend
    ? WEEKEND_POOL
    : timeSlot === 'morning'
      ? MORNING_POOL
      : timeSlot === 'day'
        ? DAY_POOL
        : EVENING_POOL;
  return { text: pool[stableIndex(ctx.dateStr + timeSlot + (isWeekend ? 'weekend' : ''), pool.length)], timeSlot };
}
