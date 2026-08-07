import { useMemo, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { Recipe } from '../../data/types';
import { buildMultiCookPlan, type OrderedStepRef } from '../../lib/multiCookOrdering';

function stepKey(ref: OrderedStepRef): string {
  return `${ref.recipeId}-${ref.stepIndex}`;
}

/**
 * 규칙 기반으로 짠 순서를 사용자가 시작 전에 확인하는 화면. 원본 레시피 내용은 절대 바꾸지
 * 않고, 여기서 조정하는 건 "단계를 배치한 순서"뿐이다 — 각 카드에 항상 출처 레시피를 표시해서
 * 어느 레시피 것인지 헷갈리지 않게 한다. 순서가 마음에 안 들면 카드 오른쪽 "⠿" 손잡이를 눌러
 * 드래그로 직접 옮길 수 있고, "순서 다시 짜기"는 드래그로 옮긴 걸 되돌려 알고리즘이 처음 짠
 * 순서로 복원한다(규칙 기반이라 같은 입력이면 항상 같은 결과라 "다시 계산"이 아니라 "리셋"에
 * 가깝다). 드래그는 이 프로젝트 첫 @dnd-kit 도입 — RecipeEditor의 조리 단계 순서 변경은 "모바일
 * 터치에서 더 안정적"이라는 이유로 여전히 ▲/▼ 버튼 방식을 쓰고 있고(CLAUDE.md 참고), 여기는
 * 사용자가 명시적으로 드래그를 요청해서 라이브러리를 새로 들였다 — 카드 전체가 아니라 손잡이에만
 * 드래그 리스너를 붙여서, 손잡이 밖 영역은 그대로 스크롤 제스처와 충돌하지 않게 한다.
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
  // 손잡이를 살짝 스치기만 해도 드래그가 시작되면 오히려 오작동이라, 8px 이상 움직여야 드래그로
  // 인식한다(짧은 탭/스크롤 시작 제스처와 구분).
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setOrder((prev) => {
      const oldIndex = prev.findIndex((ref) => stepKey(ref) === active.id);
      const newIndex = prev.findIndex((ref) => stepKey(ref) === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return arrayMove(prev, oldIndex, newIndex);
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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={order.map(stepKey)} strategy={verticalListSortingStrategy}>
          {order.map((stepRef, index) => (
            <MultiCookStepCard
              key={stepKey(stepRef)}
              id={stepKey(stepRef)}
              index={index}
              stepRef={stepRef}
              recipe={recipeById.get(stepRef.recipeId)}
            />
          ))}
        </SortableContext>
      </DndContext>

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

function MultiCookStepCard({
  id,
  index,
  stepRef,
  recipe,
}: {
  id: string;
  index: number;
  stepRef: OrderedStepRef;
  recipe: Recipe | undefined;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const step = recipe?.steps[stepRef.stepIndex];

  return (
    <div
      ref={setNodeRef}
      className="card"
      style={{
        marginBottom: 8,
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.6 : 1,
      }}
    >
      <div className="row">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          <span className="chip">{index + 1}</span>
          <div style={{ minWidth: 0 }}>
            <div className="text-muted" style={{ fontSize: 12 }}>
              {stepRef.phase === 'prep' ? '🔪 손질' : '🍳 조리'} · {recipe?.name ?? '(레시피 없음)'}
            </div>
            <strong>{step?.title ?? '(단계 없음)'}</strong>
            {step?.timerSeconds ? (
              <span className="text-muted" style={{ fontSize: 12 }}> · 약 {Math.round(step.timerSeconds / 60)}분</span>
            ) : null}
          </div>
        </div>
        <button
          className="btn small"
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', touchAction: 'none' }}
          aria-label="순서 옮기기"
        >
          ⠿
        </button>
      </div>
    </div>
  );
}
