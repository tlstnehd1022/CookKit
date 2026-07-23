import { useRef, useState } from 'react';
import { useSettings } from '../../data/settings';
import { useSession } from '../../data/session';
import { AVAILABLE_MODELS } from '../../lib/claudeClient';
import { downloadBackup, restoreBackupFromFile } from '../../data/backup';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { user, logout } = useSession();
  const [anthropicKeyDraft, setAnthropicKeyDraft] = useState(settings.anthropicApiKey);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(settings.geminiApiKey);
  const [youtubeKeyDraft, setYoutubeKeyDraft] = useState(settings.youtubeApiKey);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  interface SaveStatus {
    text: string;
    ok: boolean;
  }
  const [anthropicStatus, setAnthropicStatus] = useState<SaveStatus | null>(null);
  const [geminiStatus, setGeminiStatus] = useState<SaveStatus | null>(null);
  const [youtubeStatus, setYoutubeStatus] = useState<SaveStatus | null>(null);

  function saveAnthropicKey() {
    try {
      updateSettings({ anthropicApiKey: anthropicKeyDraft.trim() });
      setAnthropicStatus({ text: '저장되었습니다.', ok: true });
    } catch (err) {
      setAnthropicStatus({ text: err instanceof Error ? err.message : '저장에 실패했습니다.', ok: false });
    }
  }

  function saveGeminiKey() {
    try {
      updateSettings({ geminiApiKey: geminiKeyDraft.trim() });
      setGeminiStatus({ text: '저장되었습니다.', ok: true });
    } catch (err) {
      setGeminiStatus({ text: err instanceof Error ? err.message : '저장에 실패했습니다.', ok: false });
    }
  }

  function saveYoutubeKey() {
    try {
      updateSettings({ youtubeApiKey: youtubeKeyDraft.trim() });
      setYoutubeStatus({ text: '저장되었습니다.', ok: true });
    } catch (err) {
      setYoutubeStatus({ text: err instanceof Error ? err.message : '저장에 실패했습니다.', ok: false });
    }
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

      <div className="section-title">AI 제공자 (자연어/유튜브 → 레시피 변환용)</div>
      <div className="card">
        <div className="field">
          <label>사용할 AI</label>
          <select
            value={settings.aiProvider}
            onChange={(e) => updateSettings({ aiProvider: e.target.value as 'anthropic' | 'gemini' })}
          >
            <option value="gemini">Google Gemini (무료 쿼터, 추천)</option>
            <option value="anthropic">Anthropic Claude (유료)</option>
          </select>
        </div>
        <p className="text-muted">
          ⚠️ 여기 입력하는 키는 브라우저 localStorage에만 저장되며, 변환 요청 시 브라우저에서 직접 해당 API로
          전송됩니다. 본인만 사용하는 환경에서만 입력하세요. 공개된 기기나 배포된 앱에서는 사용하지 마세요.
        </p>
      </div>

      {settings.aiProvider === 'gemini' && (
        <>
          <div className="section-title">Gemini API 키</div>
          <div className="card">
            <div className="field">
              <label>API 키 (Google AI Studio에서 무료 발급)</label>
              <input
                type="password"
                value={geminiKeyDraft}
                onChange={(e) => {
                  setGeminiKeyDraft(e.target.value);
                  setGeminiStatus(null);
                }}
                placeholder="AIza..."
              />
            </div>
            <div className="field">
              <label>사용 모델 ID</label>
              <input
                value={settings.geminiModel}
                onChange={(e) => updateSettings({ geminiModel: e.target.value })}
                placeholder="gemini-2.5-flash"
              />
            </div>
            <button className="btn primary" onClick={saveGeminiKey}>
              저장
            </button>
            {geminiStatus && (
              <p style={{ marginTop: 8, color: geminiStatus.ok ? 'var(--success)' : 'var(--danger)' }}>
                {geminiStatus.ok ? '✅ ' : '⚠️ '}
                {geminiStatus.text}
              </p>
            )}
          </div>

          <div className="section-title">YouTube Data API 키 (유튜브 변환용, 선택)</div>
          <div className="card">
            <div className="field">
              <label>API 키 (Google Cloud Console에서 무료 발급)</label>
              <input
                type="password"
                value={youtubeKeyDraft}
                onChange={(e) => {
                  setYoutubeKeyDraft(e.target.value);
                  setYoutubeStatus(null);
                }}
                placeholder="AIza..."
              />
            </div>
            <p className="text-muted">
              공식 YouTube API는 자막까지는 제공하지 않지만, 영상 제목/설명란을 함께 가져와 자막 자동 추출
              결과와 합쳐서 정확도를 더 높이는 데 씁니다. 자막 자체는 별도 서버리스 함수로 자동 추출되므로,
              이 키를 입력하지 않아도 유튜브 변환은 정상 동작합니다(완전히 선택 사항).
            </p>
            <button className="btn primary" onClick={saveYoutubeKey}>
              저장
            </button>
            {youtubeStatus && (
              <p style={{ marginTop: 8, color: youtubeStatus.ok ? 'var(--success)' : 'var(--danger)' }}>
                {youtubeStatus.ok ? '✅ ' : '⚠️ '}
                {youtubeStatus.text}
              </p>
            )}
          </div>
        </>
      )}

      {settings.aiProvider === 'anthropic' && (
        <>
          <div className="section-title">Anthropic API 키</div>
          <div className="card">
            <div className="field">
              <label>API 키</label>
              <input
                type="password"
                value={anthropicKeyDraft}
                onChange={(e) => {
                  setAnthropicKeyDraft(e.target.value);
                  setAnthropicStatus(null);
                }}
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
            <button className="btn primary" onClick={saveAnthropicKey}>
              저장
            </button>
            {anthropicStatus && (
              <p style={{ marginTop: 8, color: anthropicStatus.ok ? 'var(--success)' : 'var(--danger)' }}>
                {anthropicStatus.ok ? '✅ ' : '⚠️ '}
                {anthropicStatus.text}
              </p>
            )}
          </div>
        </>
      )}

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
