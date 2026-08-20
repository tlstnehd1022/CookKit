// 조리 단계로부터 예상 조리시간(분)을 규칙 기반으로 계산한다. Recipe.estimatedMinutes의
// 자동 계산값을 만드는 용도 — 실제 저장값은 사용자가 직접 수정할 수 있다.
const FALLBACK_SECONDS_PER_STEP = 120; // 타이머가 없는 단계는 단계당 2분으로 보정

export function estimateCookMinutes(steps: { timerSeconds?: number | null }[]): number {
  const totalSeconds = steps.reduce((sum, step) => {
    const seconds = step.timerSeconds && step.timerSeconds > 0 ? step.timerSeconds : FALLBACK_SECONDS_PER_STEP;
    return sum + seconds;
  }, 0);
  return Math.round(totalSeconds / 60);
}
