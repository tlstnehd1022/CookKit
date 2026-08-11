import { useRef, useState, type ChangeEvent } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useSettings } from '../../data/settings';
import { useSession } from '../../data/session';
import { useHousehold } from '../../data/household';
import { useProfile } from '../../data/profile';
import { useTheme } from '../../data/theme';
import { useApiKeyStatus } from '../../data/apiKeys';
import { useNotificationSettings, isIosNotInstalled } from '../../data/pushNotifications';
import { setAutoStartTimer, useAutoStartTimer } from '../../data/cookingModeSettings';
import { AVAILABLE_MODELS } from '../../lib/claudeClient';
import { getErrorMessage } from '../../lib/errorMessage';

// 예전엔 localStorage에 평문으로 저장하던 API 키를 Supabase Vault로 옮긴 뒤로 다시 안 보여주기
// 위한 1회성 플래그 — settings.anthropicApiKey/geminiApiKey/youtubeApiKey에 값이 남아있는데 이
// 플래그가 없으면 "옮길까요?" 배너를 보여준다(마이그레이션 완료/건너뛰기 둘 다 이 플래그를 세워서
// 다시 안 뜨게 함).
const API_KEY_MIGRATION_FLAG = 'cookkit:apiKeyMigrated';

export function SettingsPage() {
  const { settings, updateSettings } = useSettings();
  const { user, logout } = useSession();
  const { household, refresh: refreshHousehold } = useHousehold();
  const { profile, updateDisplayName, updateAvatarFromFile, updateAvatarUrl } = useProfile();
  const { theme, toggleTheme } = useTheme();
  const anthropicKeyStatus = useApiKeyStatus('anthropic');
  const geminiKeyStatus = useApiKeyStatus('gemini');
  const youtubeKeyStatus = useApiKeyStatus('youtube');
  const notificationSettings = useNotificationSettings();
  const autoStartTimer = useAutoStartTimer();

  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationDone, setMigrationDone] = useState(
    () => localStorage.getItem(API_KEY_MIGRATION_FLAG) === 'true',
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);
  const showMigrationBanner = Boolean(
    (settings.anthropicApiKey || settings.geminiApiKey || settings.youtubeApiKey) && !migrationDone,
  );

  async function runKeyMigration() {
    setMigrating(true);
    setMigrationError(null);
    try {
      if (settings.anthropicApiKey) await anthropicKeyStatus.saveKey(settings.anthropicApiKey);
      if (settings.geminiApiKey) await geminiKeyStatus.saveKey(settings.geminiApiKey);
      if (settings.youtubeApiKey) await youtubeKeyStatus.saveKey(settings.youtubeApiKey);
      updateSettings({ anthropicApiKey: '', geminiApiKey: '', youtubeApiKey: '' });
      localStorage.setItem(API_KEY_MIGRATION_FLAG, 'true');
      setMigrationDone(true);
    } catch (err) {
      setMigrationError(getErrorMessage(err, '마이그레이션 중 오류가 발생했습니다.'));
    } finally {
      setMigrating(false);
    }
  }

  function dismissKeyMigration() {
    localStorage.setItem(API_KEY_MIGRATION_FLAG, 'true');
    setMigrationDone(true);
  }

  async function saveNickname(next: string) {
    await updateDisplayName(next);
  }

  async function handleAvatarFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await updateAvatarFromFile(file);
    } catch (err) {
      console.error('프로필 사진 업로드 실패:', err);
      setAvatarError(getErrorMessage(err, '프로필 사진 업로드에 실패했습니다.'));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function handleRevertToGoogleAvatar() {
    if (!user?.googleAvatarUrl) return;
    setAvatarUploading(true);
    setAvatarError(null);
    try {
      await updateAvatarUrl(user.googleAvatarUrl);
    } catch (err) {
      console.error('구글 사진으로 되돌리기 실패:', err);
      setAvatarError(getErrorMessage(err, '구글 사진으로 되돌리는 데 실패했습니다.'));
    } finally {
      setAvatarUploading(false);
    }
  }

  async function saveHouseholdName(next: string) {
    if (!household) return;
    const trimmed = next.trim();
    if (!trimmed) throw new Error('가구 이름을 입력해주세요.');
    const { error } = await supabase.from('households').update({ name: trimmed }).eq('id', household.id);
    if (error) throw error;
    await refreshHousehold();
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

      <div className="section-title">유통기한 알림</div>
      <div className="card">
        <div className="row">
          <span>유통기한 알림 받기</span>
          <button
            className={`toggle ${notificationSettings.enabled ? 'on' : ''}`}
            onClick={() => notificationSettings.toggle(!notificationSettings.enabled)}
            aria-label="유통기한 알림 전환"
            disabled={notificationSettings.loading || !notificationSettings.supported}
          >
            <span className="knob" />
          </button>
        </div>
        <p className="text-muted" style={{ marginTop: 8 }}>
          켜두면 재료의 유통기한이 3일 이내로 임박했을 때 매일 한 번 알림을 보내드려요.
        </p>
        {!notificationSettings.supported && (
          <p className="text-muted" style={{ marginTop: 4 }}>
            이 브라우저는 웹 푸시 알림을 지원하지 않아요.
          </p>
        )}
        {isIosNotInstalled() && (
          <p className="text-muted" style={{ marginTop: 4 }}>
            📱 iOS(아이폰/아이패드)에서는 Safari 공유 버튼 → "홈 화면에 추가"로 앱을 설치한
            상태에서만 알림을 받을 수 있어요. 브라우저 탭 상태로는 알림이 오지 않아요.
          </p>
        )}
        {notificationSettings.error && (
          <p style={{ marginTop: 4, color: 'var(--danger)' }}>⚠️ {notificationSettings.error}</p>
        )}
      </div>

      <div className="section-title">요리 모드</div>
      <div className="card">
        <div className="row">
          <span>타이머 자동 시작</span>
          <button
            className={`toggle ${autoStartTimer ? 'on' : ''}`}
            onClick={() => setAutoStartTimer(!autoStartTimer)}
            aria-label="타이머 자동 시작 전환"
          >
            <span className="knob" />
          </button>
        </div>
        <p className="text-muted" style={{ marginTop: 8 }}>
          켜두면 요리 모드에서 타이머가 있는 단계에 들어갈 때 말하거나 누르지 않아도 자동으로
          타이머가 시작돼요.
        </p>
      </div>

      {showMigrationBanner && (
        <>
          <div className="section-title">API 키 저장 방식 변경 안내</div>
          <div className="card" style={{ border: '1px solid var(--accent)' }}>
            <p className="text-muted" style={{ marginTop: 0 }}>
              지금까지 입력해둔 API 키가 브라우저에 평문으로 저장돼 있어요. 서버에 암호화해서 안전하게
              옮기고, 브라우저에서는 지울까요? 옮기고 나면 이 키로 직접 브라우저에서 AI를 호출하지 않고
              서버를 거쳐서 호출해요.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn small" onClick={dismissKeyMigration} disabled={migrating}>
                나중에
              </button>
              <button className="btn small primary" onClick={runKeyMigration} disabled={migrating}>
                {migrating ? '옮기는 중...' : '안전하게 옮기기'}
              </button>
            </div>
            {migrationError && (
              <p style={{ marginTop: 8, color: 'var(--danger)' }}>⚠️ {migrationError}</p>
            )}
          </div>
        </>
      )}

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
          API 키는 Supabase Vault에 암호화되어 저장되고, 실제 AI 호출도 브라우저가 아니라 서버를 거쳐
          처리돼요. 브라우저에는 평문 키가 전혀 남지 않습니다.
        </p>
      </div>

      {settings.aiProvider === 'gemini' && (
        <>
          <div className="section-title">Gemini API 키</div>
          <div className="card">
            <InlineEditRow
              label="API 키"
              value={geminiKeyStatus.status?.hasKey ? (geminiKeyStatus.status.maskedKey ?? '') : ''}
              placeholder="AIza... (Google AI Studio에서 무료 발급)"
              startEmpty
              helperText="저장하면 서버에 암호화되어 보관되고, 이후엔 항상 마스킹된 값만 보여요. 기존 키를 다시
                보여주지 않으니, 바꾸려면 새 키를 처음부터 입력해주세요."
              onSave={(next) => geminiKeyStatus.saveKey(next)}
            />
            <div className="field" style={{ marginTop: 12 }}>
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
          </div>

          <div className="section-title">YouTube Data API 키 (유튜브 변환용, 선택)</div>
          <div className="card">
            <InlineEditRow
              label="API 키"
              value={youtubeKeyStatus.status?.hasKey ? (youtubeKeyStatus.status.maskedKey ?? '') : ''}
              placeholder="AIza... (Google Cloud Console에서 무료 발급)"
              startEmpty
              helperText="공식 YouTube API는 자막까지는 제공하지 않지만, 영상 제목/설명란을 함께 가져와 자막 자동
                추출 결과와 합쳐서 정확도를 더 높이는 데 씁니다. 이 키가 없어도 유튜브 변환은 정상
                동작합니다(완전히 선택 사항). 저장하면 서버에 암호화되어 보관됩니다."
              onSave={(next) => youtubeKeyStatus.saveKey(next)}
            />
          </div>
        </>
      )}

      {settings.aiProvider === 'anthropic' && (
        <>
          <div className="section-title">Anthropic API 키</div>
          <div className="card">
            <InlineEditRow
              label="API 키"
              value={anthropicKeyStatus.status?.hasKey ? (anthropicKeyStatus.status.maskedKey ?? '') : ''}
              placeholder="sk-ant-... (새 키 입력)"
              startEmpty
              helperText="저장하면 서버에 암호화되어 보관되고, 이후엔 항상 마스킹된 값만 보여요. 기존 키를 다시
                보여주지 않으니, 바꾸려면 새 키를 처음부터 입력해주세요."
              onSave={(next) => anthropicKeyStatus.saveKey(next)}
            />
            <div className="field" style={{ marginTop: 12 }}>
              <label>사용 모델</label>
              <select value={settings.model} onChange={(e) => updateSettings({ model: e.target.value })}>
                {AVAILABLE_MODELS.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </>
      )}

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
        <div className="row" style={{ justifyContent: 'flex-start', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarFileChange}
          />
          <button
            className="btn"
            disabled={avatarUploading}
            onClick={() => avatarInputRef.current?.click()}
          >
            {avatarUploading ? '업로드 중...' : '프로필 사진 변경'}
          </button>
          {user?.googleAvatarUrl && user.googleAvatarUrl !== profile?.avatarUrl && (
            <button className="btn" disabled={avatarUploading} onClick={handleRevertToGoogleAvatar}>
              구글 사진으로 되돌리기
            </button>
          )}
        </div>
        {avatarError && (
          <p className="text-muted" style={{ color: 'var(--danger)', marginTop: 4 }}>
            {avatarError}
          </p>
        )}
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
  startEmpty,
}: {
  label: string;
  value: string;
  placeholder?: string;
  helperText?: string;
  onSave: (next: string) => Promise<void>;
  /** API 키처럼 기존 값을 다시 보여주지 않고 항상 빈 입력창에서 새로 입력받고 싶을 때(선택) */
  startEmpty?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(startEmpty ? '' : value);
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
