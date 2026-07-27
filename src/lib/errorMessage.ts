/**
 * Error 인스턴스뿐 아니라 Supabase(PostgrestError 등)처럼 message 속성만 있는 일반 객체도
 * 처리한다. `err instanceof Error`만 체크하면 Supabase 에러는 항상 걸러져서(인스턴스가 아님)
 * 항상 뭉뚱그린 fallback 메시지만 보이는 버그가 있었음 — 이 헬퍼로 통일해서 재발 방지.
 */
export function getErrorMessage(err: unknown, fallback = '알 수 없는 오류가 발생했습니다.'): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  if (typeof err === 'string') return err;
  return fallback;
}
