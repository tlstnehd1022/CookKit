import { useState } from 'react';
import type { Recipe } from '../../data/types';
import type { StepAdjustmentSuggestion } from '../../data/cookingLog';
import { getErrorMessage } from '../../lib/errorMessage';

function formatMinutesSeconds(totalSeconds: number): string {
  const minutes = Math.round(totalSeconds / 60);
  return minutes >= 1 ? `${minutes}분` : `${totalSeconds}초`;
}

/**
 * 요리 모드에서 측정한 실제 조리 시간이 레시피 설정값과 꾸준히 다를 때 조정을 제안하는 확인
 * 화면 — "오늘 만들었어요" 완료 직후(주 진입점)와 레시피 상세의 "⏱ 조정 제안" 배지(보조 진입점)
 * 둘 다 이 컴포넌트를 재사용한다. 자동 반영 없음: 사용자가 체크하고 "조정하기"를 눌러야만
 * recipe.steps[].timerSeconds가 바뀐다.
 */
export function TimingAdjustmentModal({
  recipe,
  suggestions,
  onClose,
  onApply,
}: {
  recipe: Recipe;
  suggestions: StepAdjustmentSuggestion[];
  onClose: () => void;
  onApply: (accepted: StepAdjustmentSuggestion[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set(suggestions.map((s) => s.stepIndex)));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(stepIndex: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stepIndex)) next.delete(stepIndex);
      else next.add(stepIndex);
      return next;
    });
  }

  async function handleApply() {
    setSaving(true);
    setError(null);
    try {
      await onApply(suggestions.filter((s) => selected.has(s.stepIndex)));
    } catch (err) {
      setError(getErrorMessage(err, '반영 중 오류가 발생했습니다.'));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <h2>⏱ 시간 조정 제안</h2>
        <p className="text-muted">실제로 걸린 시간을 바탕으로 레시피 타이머를 조정해볼까요?</p>

        {suggestions.map((s) => {
          const step = recipe.steps[s.stepIndex] as { title: string } | undefined;
          return (
            <label className="row" key={s.stepIndex} style={{ padding: '8px 0', alignItems: 'flex-start' }}>
              <input
                type="checkbox"
                checked={selected.has(s.stepIndex)}
                onChange={() => toggle(s.stepIndex)}
                style={{ marginTop: 4 }}
              />
              <div style={{ flex: 1 }}>
                <strong>
                  {s.stepIndex + 1}단계{step ? ` — ${step.title}` : ''}
                </strong>
                <div className="text-muted" style={{ fontSize: 13 }}>
                  설정 {formatMinutesSeconds(s.plannedSeconds)} → 최근 {s.sampleCount}회 기준{' '}
                  {formatMinutesSeconds(s.suggestedSeconds)}
                </div>
              </div>
            </label>
          );
        })}

        {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}

        <div className="row" style={{ gap: 6, marginTop: 16 }}>
          <button className="btn" onClick={onClose} disabled={saving}>
            건너뛰기
          </button>
          <button className="btn primary" onClick={handleApply} disabled={saving || selected.size === 0}>
            {saving ? '반영 중...' : `조정하기 (${selected.size}개)`}
          </button>
        </div>
      </div>
    </div>
  );
}
