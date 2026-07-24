import { useSession } from '../../data/session';

export function LoginPage() {
  const { login } = useSession();

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
    </div>
  );
}
