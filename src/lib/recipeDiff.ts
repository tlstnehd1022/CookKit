import type { ExtractedRecipe } from './claudeClient';

export interface RecipeSnapshot {
  name: string;
  servingsBase: number;
  ingredients: { name: string; amount: number; unit: string }[];
  tagNames: string[];
  stepsCount: number;
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

  if (before.stepsCount !== after.steps.length) {
    lines.push({ kind: 'change', text: `조리순서: ${before.stepsCount}단계 → ${after.steps.length}단계` });
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
