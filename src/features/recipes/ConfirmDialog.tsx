import { useState } from 'react';

/** 브라우저 기본 confirm()은 CSS를 못 입힌다(브라우저 네이티브 UI) — 디자인 컨셉에 맞춰야 하는
 * 곳에서 기존 .modal-backdrop/.modal-sheet를 재사용한 대체 다이얼로그. */
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

interface ConfirmRequest {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (result: boolean) => void;
}

/** window.confirm()을 그대로 대체하는 async 버전 — `await confirmAsync('...')`로 쓰고, 반환된
 * `dialog`를 JSX 아무 곳에나 렌더링해두면 된다. 여러 confirm이 순서대로 이어지는 흐름(예:
 * RecipeEditor의 이미지 생성 확인 체인)도 기존 `if (confirm(...))` 코드를 거의 그대로 두고
 * `confirm` → `await confirmAsync`만 바꾸면 되게 하기 위한 헬퍼. */
export function useConfirmDialog() {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  function confirmAsync(
    message: string,
    options?: { confirmLabel?: string; cancelLabel?: string },
  ): Promise<boolean> {
    return new Promise((resolve) => {
      setRequest({ message, confirmLabel: options?.confirmLabel, cancelLabel: options?.cancelLabel, resolve });
    });
  }

  const dialog = request ? (
    <ConfirmDialog
      message={request.message}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      onConfirm={() => {
        request.resolve(true);
        setRequest(null);
      }}
      onCancel={() => {
        request.resolve(false);
        setRequest(null);
      }}
    />
  ) : null;

  return { confirmAsync, dialog };
}
