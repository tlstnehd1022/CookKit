import { useMemo, useState } from 'react';
import type { Recipe } from '../../data/types';
import { buildMultiCookPlan, type OrderedStepRef } from '../../lib/multiCookOrdering';

/**
 * 규칙 기반으로 짠 순서를 사용자가 시작 전에 확인하는 화면. 원본 레시피 내용은 절대 바꾸지
 * 않고, 여기서 조정하는 건 "단계를 배치한 순서"뿐이다 — 각 카드에 항상 출처 레시피를 표시해서
 * 어느 레시피 것인지 헷갈리지 않게 한다. 순서가 마음에 안 들면 ▲/▼로 직접 옮길 수 있고,
 * "순서 다시 짜기"는 수동으로 옮긴 걸 되돌려 알고리즘이 처음 짠 순서로 복원한다(규칙 기반이라
 * 같은 입력이면 항상 같은 결과라 "다시 계산"이 아니라 "리셋"에 가깝다).
 */
export function MultiCookPreviewPage({
  recipes,
  onCancel,
  onReselect,
  onStart,
}: {
  recipes: Recipe[];
  onCancel: () => void;
  onReselect: () => void;
  onStart: (order: OrderedStepRef[]) => void;
}) {
  const initialPlan = useMemo(() => buildMultiCookPlan(recipes), [recipes]);
  const [order, setOrder] = useState<OrderedStepRef[]>(initialPlan.order);
  const recipeById = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  function moveUp(index: number) {
    if (index === 0) return;
    setOrder((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setOrder((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onCancel}>
          취소
        </button>
        <h1 style={{ margin: 0 }}>요리 순서 미리보기</h1>
        <span />
      </div>
      <p className="text-muted">예상 소요시간: 약 {initialPlan.estimatedTotalMinutes}분 (동시 진행 기준)</p>

      {order.map((ref, index) => {
        const recipe = recipeById.get(ref.recipeId);
        const step = recipe?.steps[ref.stepIndex];
        return (
          <div className="card" key={`${ref.recipeId}-${ref.stepIndex}`} style={{ marginBottom: 8 }}>
            <div className="row">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                <span className="chip">{index + 1}</span>
                <div style={{ minWidth: 0 }}>
                  <div className="text-muted" style={{ fontSize: 12 }}>
                    {ref.phase === 'prep' ? '🔪 손질' : '🍳 조리'} · {recipe?.name ?? '(레시피 없음)'}
                  </div>
                  <strong>{step?.title ?? '(단계 없음)'}</strong>
                  {step?.timerSeconds ? (
                    <span className="text-muted" style={{ fontSize: 12 }}> · 약 {Math.round(step.timerSeconds / 60)}분</span>
                  ) : null}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <button className="btn small" onClick={() => moveUp(index)} disabled={index === 0}>
                  ▲
                </button>
                <button className="btn small" onClick={() => moveDown(index)} disabled={index === order.length - 1}>
                  ▼
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <div className="row" style={{ gap: 6, marginTop: 16 }}>
        <button className="btn" onClick={onReselect}>
          레시피 다시 고르기
        </button>
        <button className="btn" onClick={() => setOrder(initialPlan.order)}>
          순서 다시 짜기
        </button>
        <button className="btn primary" onClick={() => onStart(order)}>
          이 순서로 시작하기
        </button>
      </div>
    </div>
  );
}
