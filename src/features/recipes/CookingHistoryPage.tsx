import { useEffect, useState } from 'react';
import { fetchCookingHistory, type CookingLogEntry } from '../../data/cookingLog';
import { getErrorMessage } from '../../lib/errorMessage';

/** "📋 요리 기록" — 우리 household가 최근에 만든 요리를 최신순으로 보여주는 최소한의 조회 화면
 * (검색/필터/수정 없이 목록만). RecipesPage.tsx 상단 버튼으로 진입한다. */
export function CookingHistoryPage({ householdId, onBack }: { householdId: string; onBack: () => void }) {
  const [entries, setEntries] = useState<CookingLogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchCookingHistory(householdId)
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch((err) => {
        if (!cancelled) setError(getErrorMessage(err, '요리 기록을 불러오지 못했습니다.'));
      });
    return () => {
      cancelled = true;
    };
  }, [householdId]);

  return (
    <div>
      <div className="row">
        <button className="btn small" onClick={onBack}>
          ← 뒤로
        </button>
        <h1 style={{ margin: 0 }}>📋 요리 기록</h1>
        <span />
      </div>

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!error && entries === null && <p className="text-muted">불러오는 중...</p>}
      {entries && entries.length === 0 && (
        <div className="empty-hint">
          아직 기록된 요리가 없어요. 레시피 상세 화면에서 "🍳 오늘 만들었어요"를 눌러보세요.
        </div>
      )}
      {entries?.map((entry) => (
        <div className="card" key={entry.id}>
          <div className="row">
            <strong>{entry.recipeName ?? '(알 수 없는 레시피)'}</strong>
            <span className="text-muted" style={{ fontSize: 12 }}>
              {new Date(entry.cookedAt).toLocaleString('ko-KR')}
            </span>
          </div>
          <div className="text-muted" style={{ fontSize: 12, marginTop: 4 }}>
            {entry.authorName ?? '이름 없는 사용자'}
            {entry.memo ? ` · ${entry.memo}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
