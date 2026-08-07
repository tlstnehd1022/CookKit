import { estimateCookMinutes } from './recipeTime';
import type { Recipe } from '../data/types';

/**
 * 복합 요리(여러 레시피 동시 진행)의 단계 순서를 규칙 기반으로 짠다. AI에게 순서를 맡기는 대신
 * 규칙으로 먼저 만들고(무료/즉시 응답), 결과가 어색하면 나중에 AI를 얹는 방향으로 남겨둠 —
 * 레시피 내용(재료/조리법) 자체는 절대 건드리지 않고 "어떤 순서로 배치할지"만 결정한다.
 */
export interface OrderedStepRef {
  recipeId: string;
  stepIndex: number;
  /** 'prep' = 재료 손질 등 타이머 없는 앞부분, 'cook' = 첫 타이머 단계부터 끝까지 */
  phase: 'prep' | 'cook';
}

export interface MultiCookPlan {
  recipeIds: string[];
  order: OrderedStepRef[];
  estimatedTotalMinutes: number;
}

/** 각 레시피를 "손질(타이머 없음)" 앞부분과 "조리(첫 타이머 단계부터 끝까지)" 뒷부분으로 나눈다.
 * 타이머가 하나도 없는 레시피는 전체를 prep으로 취급(조리 단계 간 인터리빙 대상이 없으므로). */
function splitPrepAndCook(recipe: Recipe): { prep: number[]; cook: number[] } {
  const firstTimerIndex = recipe.steps.findIndex((step) => Boolean(step.timerSeconds && step.timerSeconds > 0));
  const splitAt = firstTimerIndex === -1 ? recipe.steps.length : firstTimerIndex;
  const prep = Array.from({ length: splitAt }, (_, i) => i);
  const cook = Array.from({ length: recipe.steps.length - splitAt }, (_, i) => i + splitAt);
  return { prep, cook };
}

export function buildMultiCookPlan(recipes: Recipe[]): MultiCookPlan {
  const split = new Map(recipes.map((recipe) => [recipe.id, splitPrepAndCook(recipe)]));

  // 1) 손질 단계는 레시피별로 모아서 앞쪽에 배치(여러 레시피 손질을 한 번에 하는 게 효율적)
  const order: OrderedStepRef[] = [];
  for (const recipe of recipes) {
    for (const stepIndex of split.get(recipe.id)!.prep) {
      order.push({ recipeId: recipe.id, stepIndex, phase: 'prep' });
    }
  }

  // 2) 조리 단계는 레시피별 순서(각 레시피 내에서는 순서를 못 바꿈)를 지키면서, 매 순간 남은
  // 단계 중 타이머가 가장 긴 것을 먼저 배치한다 — 오래 걸리는 단계를 먼저 걸어둬야 그동안
  // 다른 레시피를 진행할 수 있고, 완성 시점도 서로 비슷해진다. 타이머가 없는 단계끼리 동률이면
  // (주로 이 경우) 라운드로빈으로 번갈아 골라 한쪽 레시피에 쏠리지 않게 한다.
  const cookQueues = new Map(recipes.map((recipe) => [recipe.id, [...split.get(recipe.id)!.cook]]));
  let roundRobinCursor = 0;
  while (Array.from(cookQueues.values()).some((queue) => queue.length > 0)) {
    let best: { recipeIndex: number; timer: number } | null = null;
    for (let offset = 0; offset < recipes.length; offset++) {
      const recipeIndex = (roundRobinCursor + offset) % recipes.length;
      const recipe = recipes[recipeIndex];
      const queue = cookQueues.get(recipe.id)!;
      if (queue.length === 0) continue;
      const timer = recipe.steps[queue[0]].timerSeconds ?? 0;
      if (!best || timer > best.timer) best = { recipeIndex, timer };
    }
    if (!best) break;
    const recipe = recipes[best.recipeIndex];
    const queue = cookQueues.get(recipe.id)!;
    const stepIndex = queue.shift()!;
    order.push({ recipeId: recipe.id, stepIndex, phase: 'cook' });
    roundRobinCursor = (best.recipeIndex + 1) % recipes.length;
  }

  // 예상 총 소요시간 = 손질 시간(순차) + 조리 시간(병렬로 진행되므로 가장 오래 걸리는 레시피 기준)
  const prepMinutes = recipes.reduce(
    (sum, recipe) => sum + estimateCookMinutes(split.get(recipe.id)!.prep.map((i) => recipe.steps[i])),
    0,
  );
  const cookMinutesByRecipe = recipes.map((recipe) =>
    estimateCookMinutes(split.get(recipe.id)!.cook.map((i) => recipe.steps[i])),
  );
  const estimatedTotalMinutes = prepMinutes + Math.max(0, ...cookMinutesByRecipe);

  return { recipeIds: recipes.map((r) => r.id), order, estimatedTotalMinutes };
}
