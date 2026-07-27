import { useState } from 'react';
import { useSession } from '../../data/session';
import { supabase } from '../../lib/supabaseClient';

function translateAuthError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 올바르지 않습니다.';
  if (message.includes('User already registered')) return '이미 가입된 이메일입니다. 로그인을 시도해주세요.';
  if (message.includes('Password should be at least')) return '비밀번호는 6자 이상이어야 합니다.';
  if (message.includes('Unable to validate email address')) return '이메일 형식이 올바르지 않습니다.';
  return message;
}

type View = 'main' | 'emailForm' | 'confirmSent';

export function LoginPage() {
  const { login } = useSession();
  const [view, setView] = useState<View>('main');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState('');

  function switchMode(next: 'signin' | 'signup') {
    setMode(next);
    setError(null);
  }

  function backToMain() {
    setView('main');
    setMode('signin');
    setEmail('');
    setPassword('');
    setError(null);
  }

  async function handleEmailSubmit() {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError(null);
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        // 성공하면 onAuthStateChange가 세션을 반영해서 App.tsx가 알아서 다음 화면으로 넘어감
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
        if (error) throw error;
        // 프로젝트의 "Confirm email" 설정이 켜져 있으면 세션 없이 유저만 생성됨 — 이 경우
        // 화면을 명확히 전환해서 "뭔가 일어났다"는 게 바로 보이게 한다(예전엔 작은 문구만 떠서 헷갈렸음).
        if (!data.session) {
          setConfirmedEmail(email.trim());
          setView('confirmSent');
        }
      }
    } catch (err) {
      setError(translateAuthError(err));
    } finally {
      setLoading(false);
    }
  }

  if (view === 'confirmSent') {
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
        <div style={{ fontSize: 40 }}>📬</div>
        <h1 style={{ fontSize: 22, margin: 0 }}>이메일을 확인해주세요</h1>
        <p className="text-muted" style={{ maxWidth: 280 }}>
          <strong>{confirmedEmail}</strong>로 인증 메일을 보냈어요. 메일함(스팸함도 확인해주세요)에서
          링크를 눌러 인증을 완료하면 로그인할 수 있어요.
        </p>
        <button className="btn" onClick={backToMain}>
          로그인 화면으로 돌아가기
        </button>
      </div>
    );
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
      <div style={{ fontSize: 40 }}>🍳</div>
      <h1 style={{ fontSize: 28, margin: 0 }}>CookKit</h1>
      <p className="text-muted" style={{ maxWidth: 280 }}>
        알러지 걱정 없이 함께 만드는 레시피 & 장보기 도우미
      </p>
      <button className="btn primary" style={{ padding: '12px 28px', fontSize: 16 }} onClick={login}>
        Google로 로그인
      </button>

      {view === 'main' && (
        <button className="btn small" onClick={() => setView('emailForm')}>
          이메일로 로그인
        </button>
      )}

      {view === 'emailForm' && (
        <div className="field" style={{ width: '100%', maxWidth: 280, textAlign: 'left' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 4px' }}>
            {mode === 'signin' ? '이메일로 로그인' : '이메일로 계정 만들기'}
          </h2>
          <label>이메일</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
          <label style={{ marginTop: 8 }}>비밀번호</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === 'signup' ? '6자 이상' : ''}
            onKeyDown={(e) => e.key === 'Enter' && handleEmailSubmit()}
          />
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn small" onClick={backToMain}>
              ← 뒤로
            </button>
            <button
              className="btn small"
              onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
            >
              {mode === 'signin' ? '계정 만들기' : '로그인으로'}
            </button>
            <button
              className="btn primary small"
              disabled={loading || !email.trim() || !password}
              onClick={handleEmailSubmit}
            >
              {loading ? '처리 중...' : mode === 'signin' ? '로그인' : '가입하기'}
            </button>
          </div>
          {error && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{error}</p>}
        </div>
      )}
    </div>
  );
}
