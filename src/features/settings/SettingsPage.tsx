import { useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSettings } from '../../data/settings';
import { useSession } from '../../data/session';
import { useHousehold } from '../../data/household';
import { useProfile } from '../../data/profile';
import { useTheme } from '../../data/theme';
import { AVAILABLE_MODELS } from '../../lib/claudeClient';
import { downloadBackup, restoreBackupFromFile } from '../../data/backup';
import { getErrorMessage } from '../../lib/errorMessage';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { user, logout } = useSession();
  const { household, refresh: refreshHousehold } = useHousehold();
  const { profile, updateDisplayName } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const [anthropicKeyDraft, setAnthropicKeyDraft] = useState(settings.anthropicApiKey);
  const [geminiKeyDraft, setGeminiKeyDraft] = useState(settings.geminiApiKey);
  const [youtubeKeyDraft, setYoutubeKeyDraft] = useState(settings.youtubeApiKey);
  const [importMessage, setImportMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function saveNickname(next: string) {
    await updateDisplayName(next);
  }

  async function saveHouseholdName(next: string) {
    if (!household) return;
    const trimmed = next.trim();
    if (!trimmed) throw new Error('가구 이름을 입력해주세요.');
    const { error } = await supabase.from('households').update({ name: trimmed }).eq('id', household.id);
    if (error) throw error;
    await refreshHousehold();
  }

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

      <div className="section-title">화면 테마</div>
      <div className="card">
        <div className="row">
          <span>다크 모드</span>
          <button
            className={`toggle ${theme === 'dark' ? 'on' : ''}`}
            onClick={toggleTheme}
            aria-label="다크 모드 전환"
          >
            <span className="knob" />
          </button>
        </div>
      </div>

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
            <div className="field">
              <label>이미지 생성 모델 ID (조리 단계/완성 사진)</label>
              <input
                value={settings.geminiImageModel}
                onChange={(e) => updateSettings({ geminiImageModel: e.target.value })}
                placeholder="gemini-3.1-flash-image"
              />
              <p className="text-muted" style={{ marginTop: 4 }}>
                기본값은 최신 모델이지만 유료 티어 전용일 수 있어요. 무료로 테스트하려면
                <code> gemini-2.5-flash-image</code>(무료 티어, 하루 약 500장)로 바꿔보세요.
              </p>
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

      <div className="section-title">가구</div>
      <div className="card">
        {household ? (
          <>
            <InlineEditRow
              label="가구 이름"
              value={household.name}
              placeholder="예: 김영희네"
              helperText={
                '가구 이름은 모든 구성원과 다른 가구 유저에게 동일하게 보여요. "우리집"이나 "장모님댁"처럼 ' +
                '특정 사람 기준의 호칭보다는, "김영희네"처럼 누가 봐도 자연스러운 이름을 추천해요.'
              }
              onSave={saveHouseholdName}
            />
            <p className="text-muted" style={{ marginTop: 12 }}>
              초대 코드: <strong>{household.inviteCode}</strong> (가족에게 공유해서 같이 쓰세요)
            </p>
          </>
        ) : (
          <p className="text-muted">가구 정보를 불러오는 중...</p>
        )}
      </div>

      <div className="section-title">계정</div>
      <div className="card">
        <div className="row" style={{ justifyContent: 'flex-start', gap: 10 }}>
          {profile?.avatarUrl && (
            <img
              src={profile.avatarUrl}
              alt=""
              style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }}
            />
          )}
          <p className="text-muted" style={{ margin: 0 }}>
            {user?.email}로 로그인되어 있습니다.
          </p>
        </div>
        <InlineEditRow
          label="닉네임"
          value={profile?.displayName ?? ''}
          placeholder="닉네임"
          helperText="닉네임은 레시피 작성자 표시 등으로 같은 가구 구성원과 다른 가구 유저에게도 공개돼요."
          onSave={saveNickname}
        />
        <button className="btn danger" style={{ marginTop: 12 }} onClick={logout}>
          로그아웃
        </button>
      </div>
    </div>
  );
}

/**
 * "라벨: 값  [변경]" 형태로 보여주다가, [변경]을 누르면 그 자리가 입력창 + [취소]/[저장]으로
 * 바뀌는 인라인 편집 행. API 키 입력 폼처럼 입력창+저장 버튼+상태 문구를 항상 늘어놓는 대신,
 * 평소엔 값만 조용히 보여주고 편집이 필요할 때만 입력 UI가 나타나게 해서 설정 화면이 덜
 * 번잡해 보이게 한다.
 */
function InlineEditRow({
  label,
  value,
  placeholder,
  helperText,
  onSave,
}: {
  label: string;
  value: string;
  placeholder?: string;
  helperText?: string;
  onSave: (next: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(value);
    setError(null);
    setEditing(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (err) {
      setError(getErrorMessage(err, '저장에 실패했습니다.'));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="row">
        <span>
          {label}: <strong>{value || '(미설정)'}</strong>
        </span>
        <button className="btn small" onClick={startEditing}>
          변경
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="row" style={{ gap: 8 }}>
        <input
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          style={{ flex: 1 }}
        />
        <div className="chip-row" style={{ marginTop: 0 }}>
          <button className="btn small" onClick={() => setEditing(false)} disabled={saving}>
            취소
          </button>
          <button className="btn small primary" onClick={handleSave} disabled={saving}>
            저장
          </button>
        </div>
      </div>
      {helperText && (
        <p className="text-muted" style={{ marginTop: 4 }}>
          {helperText}
        </p>
      )}
      {error && (
        <p style={{ marginTop: 4, color: 'var(--danger)' }}>
          ⚠️ {error}
        </p>
      )}
    </div>
  );
}
