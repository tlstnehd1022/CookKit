import { useRef, useState } from 'react';
import { useSettings } from '../../data/settings';
import { useSession } from '../../data/session';
import { AVAILABLE_MODELS } from '../../lib/claudeClient';
import { downloadBackup, restoreBackupFromFile } from '../../data/backup';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { user, logout } = useSession();
  const [apiKeyDraft, setApiKeyDraft] = useState(settings.anthropicApiKey);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function saveApiKey() {
    updateSettings({ anthropicApiKey: apiKeyDraft.trim() });
  }

  async function handleImportFile(file: File) {
    if (!confirm('가져오기를 진행하면 현재 저장된 모든 데이터가 백업 파일 내용으로 대체됩니다. 계속할까요?')) {
      return;
    }
    try {
      await restoreBackupFromFile(file);
      setImportMessage('가져오기가 완료되었습니다.');
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : '가져오기에 실패했습니다.');
    }
  }

  return (
    <div>
      <h1>설정</h1>

      <div className="section-title">Anthropic API 키 (자연어 → 레시피 변환용)</div>
      <div className="card">
        <div className="field">
          <label>API 키</label>
          <input
            type="password"
            value={apiKeyDraft}
            onChange={(e) => setApiKeyDraft(e.target.value)}
            placeholder="sk-ant-..."
          />
        </div>
        <div className="field">
          <label>사용 모델</label>
          <select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
            {AVAILABLE_MODELS.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-muted">
          ⚠️ 이 키는 브라우저 localStorage에만 저장되며, 레시피 변환 요청 시 브라우저에서 직접 Anthropic API로
          전송됩니다. 본인만 사용하는 환경에서만 입력하세요. 공개된 기기나 배포된 앱에서는 사용하지 마세요.
        </p>
        <button className="btn primary" onClick={saveApiKey}>
          저장
        </button>
      </div>

      <div className="section-title">데이터 백업</div>
      <div className="card">
        <p className="text-muted">
          로컬 저장소만 사용하므로 브라우저 데이터가 삭제되면 모든 정보가 유실됩니다. 정기적으로 내보내기를
          해두는 것을 권장합니다.
        </p>
        <div className="row">
          <button className="btn" onClick={downloadBackup}>
            JSON 내보내기
          </button>
          <button className="btn" onClick={() => fileInputRef.current?.click()}>
            JSON 가져오기
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = '';
          }}
        />
        {importMessage && <p style={{ marginTop: 8 }}>{importMessage}</p>}
      </div>

      <div className="section-title">계정</div>
      <div className="card">
        <p className="text-muted">{user?.name}님으로 로그인되어 있습니다.</p>
        <button className="btn danger" onClick={logout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}
