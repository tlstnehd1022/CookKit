import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

/** 새 household의 "기타" 카테고리를 찾거나 만든다 — 온보딩 시점은 initializeDataLayer가 아직
 * 실행되기 전이라 useCategories() 같은 반응형 훅을 못 쓰고, create_household/
 * join_household_by_invite_code RPC처럼 supabase를 직접 호출한다. */
async function ensureDefaultCategoryId(householdId: string): Promise<string> {
  const { data: existing, error: selectError } = await supabase
    .from('categories')
    .select('id')
    .eq('household_id', householdId)
    .eq('name', '기타')
    .maybeSingle();
  if (selectError) throw selectError;
  if (existing) return existing.id as string;

  const { data, error } = await supabase
    .from('categories')
    .insert({ household_id: householdId, name: '기타' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export function HouseholdOnboarding({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'choice' | 'create' | 'join' | 'allergies'>('choice');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [allergyInput, setAllergyInput] = useState('');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('create_household', { household_name: name.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setHouseholdId(data as string);
    setMode('allergies');
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('join_household_by_invite_code', { code: inviteCode.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setHouseholdId(data as string);
    setMode('allergies');
  }

  /** 알러지 재료 등록은 실패해도 온보딩 자체를 막지 않는다 — 나중에 재료 화면에서 직접
   * 추가/수정할 수 있으니 여기서는 편의를 위한 부가 단계일 뿐이다. */
  async function handleSubmitAllergies() {
    const names = Array.from(new Set(allergyInput.split(/[,，]/).map((s) => s.trim()).filter(Boolean)));
    if (names.length > 0 && householdId) {
      setLoading(true);
      try {
        const categoryId = await ensureDefaultCategoryId(householdId);
        for (const allergyName of names) {
          const { error } = await supabase.from('ingredients').insert({
            household_id: householdId,
            category_id: categoryId,
            name: allergyName,
            unit: '1개',
            allergens: [allergyName],
            owned: false,
          });
          if (error) throw error;
        }
      } catch (err) {
        console.error('알러지 재료 등록 실패:', err);
      } finally {
        setLoading(false);
      }
    }
    onDone();
  }

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0 }}>가구 설정</h1>
      {mode !== 'allergies' && (
        <p className="text-muted" style={{ maxWidth: 280 }}>
          재료와 장보기 목록을 같이 볼 가구가 아직 없어요. 새로 만들거나, 가족이 만든 가구에
          초대 코드로 들어갈 수 있어요.
        </p>
      )}

      {mode === 'choice' && (
        <div className="row" style={{ gap: 8, justifyContent: 'center' }}>
          <button className="btn primary" onClick={() => setMode('create')}>
            가구 만들기
          </button>
          <button className="btn" onClick={() => setMode('join')}>
            초대 코드로 참여하기
          </button>
        </div>
      )}

      {mode === 'create' && (
        <div className="field" style={{ width: '100%', maxWidth: 280, textAlign: 'left' }}>
          <label>가구 이름</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 김영희네" />
          <p className="text-muted" style={{ marginTop: 4 }}>
            가구 이름은 모든 구성원과 다른 가구 유저에게 동일하게 보여요. "우리집"이나 "장모님댁"처럼 특정
            사람 기준의 호칭보다는, "김영희네"처럼 누가 봐도 자연스러운 이름을 추천해요.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setMode('choice')}>
              뒤로
            </button>
            <button className="btn primary" disabled={loading || !name.trim()} onClick={handleCreate}>
              {loading ? '만드는 중...' : '만들기'}
            </button>
          </div>
        </div>
      )}

      {mode === 'join' && (
        <div className="field" style={{ width: '100%', maxWidth: 280, textAlign: 'left' }}>
          <label>초대 코드</label>
          <input
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            placeholder="가족에게 받은 코드"
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setMode('choice')}>
              뒤로
            </button>
            <button className="btn primary" disabled={loading || !inviteCode.trim()} onClick={handleJoin}>
              {loading ? '참여하는 중...' : '참여하기'}
            </button>
          </div>
        </div>
      )}

      {mode === 'allergies' && (
        <div className="field" style={{ width: '100%', maxWidth: 280, textAlign: 'left' }}>
          <label>알러지나 못 먹는 재료가 있나요? (선택)</label>
          <input
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            placeholder="예: 마늘, 밀가루"
          />
          <p className="text-muted" style={{ marginTop: 4 }}>
            여기 적은 재료는 알러지 표시가 붙어서, 이 재료가 들어간 레시피를 목록에서 바로 제외할 수
            있어요. 나중에 재료 화면에서 언제든 추가/수정할 수 있으니 지금은 건너뛰어도 괜찮아요.
          </p>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" disabled={loading} onClick={onDone}>
              건너뛰기
            </button>
            <button className="btn primary" disabled={loading} onClick={handleSubmitAllergies}>
              {loading ? '저장하는 중...' : allergyInput.trim() ? '저장하고 시작하기' : '시작하기'}
            </button>
          </div>
        </div>
      )}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
