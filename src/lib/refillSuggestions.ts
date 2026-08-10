import type { Ingredient } from '../data/types';
import type { FillFrequencyInfo } from '../data/ingredientFillLog';

// "최근 90일간 3회 이상 채워짐"을 자주 쓰는 재료로 보는 최소 기준 — 이력이 부족하면(3회 미만)
// 판단 근거가 약해서 제안하지 않는다. 평소 재구매 간격(avgIntervalDays)의 1.5배가 지나도록 다시
// 안 채워졌으면 슬슬 떨어졌을 시점으로 보고 제안한다.
const FREQUENT_FILL_THRESHOLD = 3;
const REFILL_OVERDUE_MULTIPLIER = 1.5;

/** 장보기 화면 "💡 자주 채우시는데 지금 없어요" 제안 대상을 계산한다(순수 함수, 캐싱은 호출부 책임). */
export function computeRefillSuggestions(
  ingredients: Ingredient[],
  frequencies: Map<string, FillFrequencyInfo>,
): Ingredient[] {
  const now = Date.now();
  return ingredients.filter((ingredient) => {
    if (ingredient.owned) return false;
    if (!ingredient.lastFilledAt) return false;
    const freq = frequencies.get(ingredient.id);
    if (!freq || freq.count < FREQUENT_FILL_THRESHOLD || freq.avgIntervalDays == null) return false;
    const daysSinceLastFilled = (now - new Date(ingredient.lastFilledAt).getTime()) / (24 * 60 * 60 * 1000);
    return daysSinceLastFilled > freq.avgIntervalDays * REFILL_OVERDUE_MULTIPLIER;
  });
}
