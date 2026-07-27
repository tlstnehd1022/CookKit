import type { Difficulty } from '../data/types';

// 사용자가 난이도를 직접 선택했을 때 difficultyReason에 남기는 고정 문구.
// 이 문구가 남아있는 동안은 재료/조리시간/단계가 바뀌어도 자동 재계산으로 덮어쓰지 않는다
// (RecipeEditor.tsx에서 이 값과 비교해 "수동 설정 여부"를 판단).
export const MANUAL_DIFFICULTY_REASON = '사용자가 직접 설정함';

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: '쉬움',
  medium: '보통',
  hard: '어려움',
};

export interface DifficultyInput {
  ingredientCount: number;
  cookMinutes: number;
  stepCount: number;
}

export interface DifficultyResult {
  difficulty: Difficulty;
  reason: string;
}

/**
 * 재료 개수 + 조리시간 + 조리단계 개수를 점수화해 난이도를 규칙 기반으로 판단한다.
 * 점수: 재료(5개 이하 0점/6~10개 1점/11개 이상 2점) + 조리시간(30분 이하 0점/60분 이하 1점/그 이상 2점)
 * + 조리단계(5개 이하 0점/6개 이상 1점). 총점 0~1: easy, 2~3: medium, 4+: hard.
 */
export function computeDifficulty({ ingredientCount, cookMinutes, stepCount }: DifficultyInput): DifficultyResult {
  let score = 0;
  const reasons: string[] = [];

  if (ingredientCount <= 5) {
    reasons.push(`재료 ${ingredientCount}개`);
  } else if (ingredientCount <= 10) {
    score += 1;
    reasons.push(`재료 ${ingredientCount}개`);
  } else {
    score += 2;
    reasons.push(`재료 ${ingredientCount}개`);
  }

  if (cookMinutes <= 30) {
    reasons.push(`예상 조리시간 약 ${cookMinutes}분`);
  } else if (cookMinutes <= 60) {
    score += 1;
    reasons.push(`예상 조리시간 약 ${cookMinutes}분`);
  } else {
    score += 2;
    reasons.push(`예상 조리시간 약 ${cookMinutes}분`);
  }

  if (stepCount <= 5) {
    reasons.push(`조리단계 ${stepCount}개`);
  } else {
    score += 1;
    reasons.push(`조리단계 ${stepCount}개`);
  }

  const difficulty: Difficulty = score <= 1 ? 'easy' : score <= 3 ? 'medium' : 'hard';
  return {
    difficulty,
    reason: `${reasons.join(', ')} 기준으로 자동 판단됨 (${DIFFICULTY_LABEL[difficulty]})`,
  };
}
