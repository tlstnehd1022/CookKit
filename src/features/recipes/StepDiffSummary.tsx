import { useState } from 'react';
import { diffLineColor, summarizeStepDiff } from '../../lib/recipeDiff';

const KIND_PREFIX: Record<'add' | 'remove' | 'change', string> = { add: '+', remove: '−', change: '~' };
const KIND_SUFFIX: Record<'add' | 'remove' | 'change', string> = {
  add: ' (신규)',
  remove: ' (삭제됨)',
  change: ': 내용 일부 변경',
};

/**
 * AI 제안(대화/유튜브) 반영 전, 재료 diff는 이미 색으로 구분되지만 조리 단계 개수 변화는
 * 눈에 안 띄던 문제 — 개수 요약을 기본으로 보여주고, 탭하면 단계별 추가/제거/변경을
 * recipeDiff.ts의 색 규칙(add=초록/remove=빨강/change=강조색) 그대로 펼쳐서 보여준다.
 */
export function StepDiffSummary({
  beforeSteps,
  afterSteps,
}: {
  beforeSteps: { title: string; content: string; timerSeconds?: number | null }[];
  afterSteps: { title: string; content: string; timerSeconds?: number | null }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const entries = summarizeStepDiff(beforeSteps, afterSteps);
  if (entries.length === 0) return null;

  const countChanged = beforeSteps.length !== afterSteps.length;
  const summaryText = countChanged
    ? `조리 단계 ${beforeSteps.length}개 → ${afterSteps.length}개`
    : `조리 단계 내용 변경 (${beforeSteps.length}개)`;

  return (
    <div style={{ margin: '6px 0' }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--accent)',
        }}
      >
        {summaryText} {expanded ? '▴' : '▾'} 자세히 보기
      </button>
      {expanded && (
        <ul style={{ margin: '6px 0', paddingLeft: 18, fontSize: 13 }}>
          {entries.map((entry, i) => (
            <li key={i} style={{ color: diffLineColor(entry.kind) }}>
              {KIND_PREFIX[entry.kind]} {entry.index}단계: {entry.label}
              {KIND_SUFFIX[entry.kind]}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
