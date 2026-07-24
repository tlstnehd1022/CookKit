import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

export function HouseholdOnboarding({ onDone }: { onDone: () => void }) {
  const [mode, setMode] = useState<'choice' | 'create' | 'join'>('choice');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc('create_household', { household_name: name.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.rpc('join_household_by_invite_code', { code: inviteCode.trim() });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
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
      <p className="text-muted" style={{ maxWidth: 280 }}>
        재료와 장보기 목록을 같이 볼 가구가 아직 없어요. 새로 만들거나, 가족이 만든 가구에
        초대 코드로 들어갈 수 있어요.
      </p>

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
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 우리집" />
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

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
    </div>
  );
}
