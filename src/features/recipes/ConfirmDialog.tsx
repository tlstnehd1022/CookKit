/** 브라우저 기본 confirm()은 CSS를 못 입힌다(브라우저 네이티브 UI) — 디자인 컨셉에 맞춰야 하는
 * 곳(요리 모드 시작/종료 확인)에서만 기존 .modal-backdrop/.modal-sheet를 재사용한 대체 다이얼로그. */
export function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = '확인',
  cancelLabel = '취소',
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 300 }}>
        <p style={{ margin: '0 0 16px', textAlign: 'center' }}>{message}</p>
        <div className="row" style={{ gap: 6 }}>
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className="btn primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
