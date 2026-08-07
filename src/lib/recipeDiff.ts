import type { ExtractedRecipe } from './claudeClient.js';

export interface RecipeSnapshot {
  name: string;
  servingsBase: number;
  ingredients: { name: string; amount: number; unit: string }[];
  tagNames: string[];
  steps: { title: string; content: string; timerSeconds?: number }[];
}

export type DiffLineKind = 'add' | 'remove' | 'change' | 'info';

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

/** 현재 폼 상태(before)와 AI가 새로 제안한 레시피(after)를 비교해 사람이 읽을 수 있는 변경 요약을 만든다. */
export function summarizeRecipeDiff(before: RecipeSnapshot, after: ExtractedRecipe): DiffLine[] {
  const lines: DiffLine[] = [];
  const afterServings = after.servingsBase || 1;

  if (!before.name.trim()) {
    lines.push({ kind: 'info', text: `레시피 "${after.name}" 새로 작성` });
  } else if (before.name !== after.name) {
    lines.push({ kind: 'change', text: `이름: "${before.name}" → "${after.name}"` });
  }

  if (before.servingsBase !== afterServings) {
    lines.push({ kind: 'change', text: `기준 인분: ${before.servingsBase}인분 → ${afterServings}인분` });
  }

  const beforeNames = new Set(before.ingredients.map((i) => i.name));
  const afterNames = new Set(after.ingredients.map((i) => i.name));

  const added = after.ingredients.filter((i) => !beforeNames.has(i.name));
  if (added.length > 0) {
    lines.push({
      kind: 'add',
      text: `재료 추가: ${added.map((i) => `${i.name} ${i.amount}${i.unit}`).join(', ')}`,
    });
  }

  const removed = before.ingredients.filter((i) => !afterNames.has(i.name));
  if (removed.length > 0) {
    lines.push({ kind: 'remove', text: `재료 제거: ${removed.map((i) => i.name).join(', ')}` });
  }

  const changed = after.ingredients.filter((i) => {
    const prev = before.ingredients.find((b) => b.name === i.name);
    return prev && (prev.amount !== i.amount || prev.unit !== i.unit);
  });
  if (changed.length > 0) {
    lines.push({
      kind: 'change',
      text: `수량 변경: ${changed
        .map((i) => {
          const prev = before.ingredients.find((b) => b.name === i.name)!;
          return `${i.name} ${prev.amount}${prev.unit} → ${i.amount}${i.unit}`;
        })
        .join(', ')}`,
    });
  }

  // 재료 구성이 그대로라도 조리 순서만 바뀌는 요청("A 다음에 B, 마지막에 C로 바꿔줘")이 흔한데,
  // 예전엔 steps.length만 비교해서 단계 개수가 같으면 순서/내용이 바뀌어도 "변화 없음"으로
  // 잘못 표시됐음(버그) — 각 단계를 위치별로 제목/본문/타이머까지 비교해서 실제 변경을 잡는다.
  const stepCountChanged = before.steps.length !== after.steps.length;
  const stepContentChanged =
    !stepCountChanged &&
    before.steps.some((step, i) => {
      const other = after.steps[i];
      return (
        step.title !== other.title ||
        step.content !== other.content ||
        (step.timerSeconds ?? null) !== (other.timerSeconds ?? null)
      );
    });
  if (stepCountChanged) {
    lines.push({ kind: 'change', text: `조리순서: ${before.steps.length}단계 → ${after.steps.length}단계` });
  } else if (stepContentChanged) {
    lines.push({ kind: 'change', text: '조리순서: 단계 내용 또는 순서가 바뀜' });
  }

  const beforeTags = new Set(before.tagNames);
  const afterTags = new Set((after.tagNames ?? []).filter((t): t is string => Boolean(t)));
  const addedTags = [...afterTags].filter((t) => !beforeTags.has(t));
  const removedTags = [...beforeTags].filter((t) => !afterTags.has(t));
  if (addedTags.length > 0) lines.push({ kind: 'add', text: `태그 추가: ${addedTags.join(', ')}` });
  if (removedTags.length > 0) lines.push({ kind: 'remove', text: `태그 제거: ${removedTags.join(', ')}` });

  if (lines.length === 0) {
    lines.push({ kind: 'info', text: '내용상 큰 변화는 없어요.' });
  }

  return lines;
}

export function diffLineColor(kind: DiffLineKind): string {
  switch (kind) {
    case 'add':
      return 'var(--success)';
    case 'remove':
      return 'var(--danger)';
    case 'change':
      return 'var(--accent)';
    default:
      return 'var(--text-muted)';
  }
}
