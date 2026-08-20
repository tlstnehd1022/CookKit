import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { ChevronLeft, X, User, Home, Settings, LogOut, ChevronRight, Bell, Compass, Camera } from 'lucide-react';
import { supabase } from '../../lib/supabaseClient';
import { useSettings } from '../../data/settings';
import { useSession } from '../../data/session';
import { useHousehold } from '../../data/household';
import { useProfile } from '../../data/profile';
import { requestOnboardingTourRestart } from '../../data/onboardingTour';
import { useTheme } from '../../data/theme';
import { useApiKeyStatus } from '../../data/apiKeys';
import { useNotificationSettings, isIosNotInstalled } from '../../data/pushNotifications';
import {
  setAutoStartTimer,
  useAutoStartTimer,
  setAutoStartVoice,
  useAutoStartVoice,
  setSelectedVoiceURI,
  useSelectedVoiceURI,
  setAnnouncementTone,
  useAnnouncementTone,
} from '../../data/cookingModeSettings';
import { useNotifications, type AppNotification } from '../../data/notifications';
import { useIngredients, useRecipes } from '../../data/store';
import { AVAILABLE_MODELS } from '../../lib/claudeClient';
import { getErrorMessage } from '../../lib/errorMessage';
import { ConfirmDialog } from '../recipes/ConfirmDialog';

const API_KEY_MIGRATION_FLAG = 'cookkit:apiKeyMigrated';

type Section = 'menu' | 'notifications' | 'profile' | 'household' | 'app';

const SECTION_TITLE: Record<Exclude<Section, 'menu'>, string> = {
  notifications: '알림',
  profile: '내 프로필',
  household: '가구 설정',
  app: '앱 설정',
};

/**
 * 홈 화면 우상단 프로필 아이콘 → 바텀시트. 예전 SettingsPage.tsx의 내용을 3개 메뉴로 재분류했다
 * (내 프로필 / 가구 설정 / 앱 설정) + 알림함을 최상단에 추가 — 로그아웃은 메뉴 목록에 바로 노출.
 * 각 섹션은 기존 SettingsPage.tsx 로직/컴포넌트(InlineEditRow)를 최대한 그대로 재사용한다.
 * 태그/카테고리 관리는 각자의 홈(레시피 탭 "태그 관리"/냉장고 탭 "카테고리 관리")이 이미 있어
 * 여기 중복으로 두지 않는다.
 */
export function ProfileSheet({
  onClose,
  onNavigateToRecipe,
}: {
  onClose: () => void;
  /** 알림 탭 시 관련 레시피 상세로 이동시키기 위한 콜백 — 시트를 소유한 HomePage가 주입한다. */
  onNavigateToRecipe: (recipeId: string) => void;
}) {
  const [section, setSection] = useState<Section>('menu');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { user, logout } = useSession();
  const { profile } = useProfile();
  const { unreadCount } = useNotifications();

  const menuItems: { section: Section; icon: typeof User; label: string; badge?: number }[] = [
    { section: 'notifications', icon: Bell, label: '알림', badge: unreadCount },
    { section: 'profile', icon: User, label: '내 프로필' },
    { section: 'household', icon: Home, label: '가구 설정' },
    { section: 'app', icon: Settings, label: '앱 설정' },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet profile-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row profile-sheet-header">
          {section === 'menu' ? (
            <span className="profile-sheet-title">
              {profile?.avatarUrl && <img src={profile.avatarUrl} alt="" className="profile-sheet-avatar" />}
              {profile?.displayName || user?.email || '내 계정'}
            </span>
          ) : (
            <button type="button" className="profile-sheet-back" onClick={() => setSection('menu')}>
              <ChevronLeft size={20} strokeWidth={2.75} />
              {SECTION_TITLE[section]}
            </button>
          )}
          <button type="button" className="btn-icon-plain" onClick={onClose} aria-label="닫기">
            <X size={20} strokeWidth={2.75} />
          </button>
        </div>

        {section === 'menu' && (
          <div className="profile-sheet-menu">
            {menuItems.map(({ section: s, icon: Icon, label, badge }) => (
              <button type="button" key={s} className="profile-sheet-menu-item" onClick={() => setSection(s)}>
                <Icon size={19} strokeWidth={2.75} />
                <span>{label}</span>
                {Boolean(badge) && <span className="profile-sheet-menu-badge">{badge}</span>}
                <ChevronRight size={16} strokeWidth={2.75} className="profile-sheet-menu-chevron" />
              </button>
            ))}
            <button
              type="button"
              className="profile-sheet-menu-item"
              onClick={() => {
                requestOnboardingTourRestart();
                onClose();
              }}
            >
              <Compass size={19} strokeWidth={2.75} />
              <span>앱 사용법 다시 보기</span>
            </button>
            <button
              type="button"
              className="profile-sheet-menu-item danger"
              onClick={() => setShowLogoutConfirm(true)}
            >
              <LogOut size={19} strokeWidth={2.75} />
              <span>로그아웃</span>
            </button>
          </div>
        )}
        {showLogoutConfirm && (
          <ConfirmDialog
            message="로그아웃할까요?"
            confirmLabel="로그아웃"
            onConfirm={() => {
              setShowLogoutConfirm(false);
              logout();
            }}
            onCancel={() => setShowLogoutConfirm(false)}
          />
        )}

        {section === 'notifications' && (
          <NotificationsSection
            onNavigateToRecipe={(recipeId) => {
              onClose();
              onNavigateToRecipe(recipeId);
            }}
          />
        )}
        {section === 'profile' && <ProfileSection />}
        {section === 'household' && <HouseholdSection />}
        {section === 'app' && <AppSettingsSection />}
      </div>
    </div>
  );
}

function formatNotificationText(notification: AppNotification, recipeName: string): string {
  if (notification.type === 'recipe_liked') {
    return `${notification.payload.liker_name}님이 회원님의 레시피 "${recipeName}"를 좋아해요`;
  }
  return `${notification.payload.author_name}님이 새 레시피 "${recipeName}"를 추가했어요`;
}

function NotificationsSection({ onNavigateToRecipe }: { onNavigateToRecipe: (recipeId: string) => void }) {
  const { notifications, markRead } = useNotifications();
  const { recipes } = useRecipes();

  async function handleTap(notification: AppNotification) {
    if (!notification.readAt) {
      markRead(notification.id).catch((err) => console.error('알림 읽음 처리 실패:', err));
    }
    onNavigateToRecipe(notification.payload.recipe_id);
  }

  if (notifications.length === 0) {
    return <p className="empty-hint">아직 알림이 없어요.</p>;
  }

  return (
    <div>
      {notifications.map((notification) => {
        const recipeName = recipes.find((r) => r.id === notification.payload.recipe_id)?.name ?? '레시피';
        return (
          <button
            type="button"
            key={notification.id}
            className={`notification-row ${notification.readAt ? '' : 'unread'}`}
            onClick={() => handleTap(notification)}
          >
            <span className="notification-text">{formatNotificationText(notification, recipeName)}</span>
            <span className="notification-time">{new Date(notification.createdAt).toLocaleDateString('ko-KR')}</span>
          </button>
        );
      })}
    </div>
  );
}

function ProfileSection() {
  const { user } = useSession();
  const { profile, updateDisplayName, updateAvatarFromFile, updateAvatarUrl } = useProfile();
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

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

  return (
    <div className="card">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <div style={{ position: 'relative', width: 72, height: 72 }}>
          {profile?.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--chip-bg)' }} />
          )}
          <input
            ref={avatarInputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleAvatarFileChange}
          />
          <button
            type="button"
            disabled={avatarUploading}
            onClick={() => avatarInputRef.current?.click()}
            aria-label="프로필 사진 변경"
            style={{
              position: 'absolute',
              right: -2,
              bottom: -2,
              width: 28,
              height: 28,
              borderRadius: '50%',
              background: 'var(--accent)',
              color: 'var(--accent-contrast)',
              border: '2px solid var(--bg-card)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Camera size={14} strokeWidth={2.75} />
          </button>
        </div>
        <p className="text-muted" style={{ margin: 0, fontSize: 12, textAlign: 'center' }}>
          {avatarUploading ? '업로드 중...' : `${user?.email}로 로그인되어 있습니다.`}
        </p>
        {user?.googleAvatarUrl && user.googleAvatarUrl !== profile?.avatarUrl && (
          <button className="btn small" disabled={avatarUploading} onClick={handleRevertToGoogleAvatar}>
            구글 사진으로 되돌리기
          </button>
        )}
      </div>
      {avatarError && (
        <p className="text-muted" style={{ color: 'var(--danger)', marginTop: 4, textAlign: 'center' }}>
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
    </div>
  );
}

function HouseholdSection() {
  const { household, refresh: refreshHousehold } = useHousehold();
  const { ingredients, saveIngredient } = useIngredients();
  const [allergenDraft, setAllergenDraft] = useState('');
  const [allergenError, setAllergenError] = useState<string | null>(null);

  async function saveHouseholdName(next: string) {
    if (!household) return;
    const trimmed = next.trim();
    if (!trimmed) throw new Error('가구 이름을 입력해주세요.');
    const { error } = await supabase.from('households').update({ name: trimmed }).eq('id', household.id);
    if (error) throw error;
    await refreshHousehold();
  }

  async function saveDefaultServings(next: string) {
    if (!household) return;
    const parsed = Number(next);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error('1 이상의 숫자로 입력해주세요.');
    }
    const { error } = await supabase.from('households').update({ default_servings: parsed }).eq('id', household.id);
    if (error) throw error;
    await refreshHousehold();
  }

  /** 가구 알러지 목록에 추가하면서, 이름이 정확히 같은 기존 재료가 있으면 자동으로
   * 태깅한다("돈까스소스"처럼 이름만 봐선 알 수 없는 재료는 재료 상세 화면에서 따로 표시해야
   * 하지만, "마늘"처럼 재료 자체가 알러지원인 흔한 경우는 이걸로 끝난다). */
  async function addHouseholdAllergen() {
    if (!household) return;
    const trimmed = allergenDraft.trim();
    if (!trimmed || household.allergens.includes(trimmed)) {
      setAllergenDraft('');
      return;
    }
    setAllergenError(null);
    try {
      const { error } = await supabase
        .from('households')
        .update({ allergens: [...household.allergens, trimmed] })
        .eq('id', household.id);
      if (error) throw error;
      await refreshHousehold();
      const matched = ingredients.find((i) => i.name.trim().toLowerCase() === trimmed.toLowerCase());
      if (matched && !matched.allergens.includes(trimmed)) {
        await saveIngredient({ ...matched, allergens: [...matched.allergens, trimmed] });
      }
      setAllergenDraft('');
    } catch (err) {
      setAllergenError(getErrorMessage(err, '알러지 성분을 추가하지 못했어요.'));
    }
  }

  /** 가구 목록에서만 빼고, 이미 재료에 붙어있는 태그는 건드리지 않는다(그 재료의 실제 성분
   * 정보를 잃지 않기 위해 — 지우고 싶으면 그 재료 상세 화면에서 직접 뺄 수 있음). */
  async function removeHouseholdAllergen(name: string) {
    if (!household) return;
    setAllergenError(null);
    try {
      const { error } = await supabase
        .from('households')
        .update({ allergens: household.allergens.filter((a) => a !== name) })
        .eq('id', household.id);
      if (error) throw error;
      await refreshHousehold();
    } catch (err) {
      setAllergenError(getErrorMessage(err, '알러지 성분을 지우지 못했어요.'));
    }
  }

  return (
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
          <InlineEditRow
            label="기본 인원 수"
            value={String(household.defaultServings)}
            placeholder="예: 2"
            helperText="레시피를 장보기에 담거나 식단에 배치할 때 처음 보여줄 인분 수예요. 손님이 오는 등 예외적인 날은 그 항목만 따로 조절할 수 있어요."
            onSave={saveDefaultServings}
          />
          <p className="text-muted" style={{ marginTop: 12 }}>
            초대 코드: <strong>{household.inviteCode}</strong> (가족에게 공유해서 같이 쓰세요)
          </p>

          <div className="section-title">알러지 관리</div>
          <p className="text-muted" style={{ marginTop: -4, marginBottom: 8 }}>
            우리 가구가 피하는 성분이에요. 여기 추가하면 이름이 같은 재료엔 자동으로 표시되고,
            "돈까스소스"처럼 이름만 봐선 알 수 없는 재료는 냉장고에서 그 재료를 눌러 따로
            표시할 수 있어요. 대화형 AI도 이 목록을 보고 레시피 제안 전에 먼저 확인해요.
          </p>
          {household.allergens.length > 0 && (
            <div className="chip-row" style={{ marginBottom: 8 }}>
              {household.allergens.map((name) => (
                <span className="chip allergen" key={name}>
                  {name}
                  <button onClick={() => removeHouseholdAllergen(name)}>✕</button>
                </span>
              ))}
            </div>
          )}
          <div className="row pill-input-row">
            <input
              value={allergenDraft}
              onChange={(e) => setAllergenDraft(e.target.value)}
              placeholder="예: 마늘, 밀가루"
              onKeyDown={(e) => e.key === 'Enter' && addHouseholdAllergen()}
            />
            <button className="btn small" onClick={addHouseholdAllergen}>
              추가
            </button>
          </div>
          {allergenError && <p style={{ color: 'var(--danger)', marginTop: 8 }}>{allergenError}</p>}
        </>
      ) : (
        <p className="text-muted">가구 정보를 불러오는 중...</p>
      )}
    </div>
  );
}

/** 브라우저/기기가 제공하는 TTS 음성 목록 — Chrome 등에서는 비동기로("voiceschanged") 채워져서
 * 이벤트를 같이 구독한다. 한국어 음성만 추리되(있으면), 하나도 없으면 전체 목록을 보여준다. */
function useAvailableVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    'speechSynthesis' in window ? window.speechSynthesis.getVoices() : [],
  );

  useEffect(() => {
    if (!('speechSynthesis' in window)) return;
    function refresh() {
      setVoices(window.speechSynthesis.getVoices());
    }
    refresh();
    window.speechSynthesis.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', refresh);
  }, []);

  const korean = voices.filter((v) => v.lang.toLowerCase().startsWith('ko'));
  return korean.length > 0 ? korean : voices;
}

function AppSettingsSection() {
  const { settings, updateSettings } = useSettings();
  const { theme, toggleTheme } = useTheme();
  const anthropicKeyStatus = useApiKeyStatus('anthropic');
  const geminiKeyStatus = useApiKeyStatus('gemini');
  const youtubeKeyStatus = useApiKeyStatus('youtube');
  const notificationSettings = useNotificationSettings();
  const autoStartTimer = useAutoStartTimer();
  const autoStartVoice = useAutoStartVoice();
  const selectedVoiceURI = useSelectedVoiceURI();
  const tone = useAnnouncementTone();
  const availableVoices = useAvailableVoices();

  const [migrating, setMigrating] = useState(false);
  const [migrationError, setMigrationError] = useState<string | null>(null);
  const [migrationDone, setMigrationDone] = useState(
    () => localStorage.getItem(API_KEY_MIGRATION_FLAG) === 'true',
  );
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

  return (
    <>
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
          켜두면 재료의 유통기한이 2일 이내로 임박했거나 지났을 때 매일 한 번 알림을 보내드려요.
        </p>
        {!notificationSettings.supported && (
          <p className="text-muted" style={{ marginTop: 4 }}>
            이 브라우저는 웹 푸시 알림을 지원하지 않아요.
          </p>
        )}
        {isIosNotInstalled() && (
          <p className="text-muted" style={{ marginTop: 4 }}>
            📱 iOS(아이폰/아이패드)에서는 Safari 공유 버튼 → "홈 화면에 추가"로 앱을 설치한 상태에서만
            알림을 받을 수 있어요. 브라우저 탭 상태로는 알림이 오지 않아요.
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
          켜두면 요리 모드에서 타이머가 있는 단계에 들어갈 때 말하거나 누르지 않아도 자동으로 타이머가
          시작돼요.
        </p>

        <div className="row" style={{ marginTop: 16 }}>
          <span>음성 인식 자동 시작</span>
          <button
            className={`toggle ${autoStartVoice ? 'on' : ''}`}
            onClick={() => setAutoStartVoice(!autoStartVoice)}
            aria-label="음성 인식 자동 시작 전환"
          >
            <span className="knob" />
          </button>
        </div>
        <p className="text-muted" style={{ marginTop: 8 }}>
          켜두면 요리 모드에 들어갈 때 마이크 버튼을 누르지 않아도 바로 음성 명령을 들어요. 요리 모드를
          마치면 자동으로 꺼져요.
        </p>

        <div className="field" style={{ marginTop: 16 }}>
          <label>안내 음성</label>
          <select
            value={selectedVoiceURI ?? ''}
            onChange={(e) => setSelectedVoiceURI(e.target.value || null)}
          >
            <option value="">기기 기본값</option>
            {availableVoices.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI}>
                {voice.name}
              </option>
            ))}
          </select>
          {availableVoices.length === 0 && (
            <p className="text-muted" style={{ marginTop: 4 }}>
              이 기기에서 사용 가능한 음성 목록을 아직 못 받아왔어요. 잠시 후 다시 열어보세요.
            </p>
          )}
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ fontSize: 13, color: 'var(--text-secondary)' }}>안내 말투</label>
          <div className="chip-row" style={{ marginTop: 6 }}>
            <button
              type="button"
              className={`chip selectable ${tone === 'formal' ? 'active' : ''}`}
              onClick={() => setAnnouncementTone('formal')}
            >
              표준(존댓말)
            </button>
            <button
              type="button"
              className={`chip selectable ${tone === 'friendly' ? 'active' : ''}`}
              onClick={() => setAnnouncementTone('friendly')}
            >
              친근하게
            </button>
          </div>
          <p className="text-muted" style={{ marginTop: 6 }}>
            타이머·단계 전환 같은 안내 문구의 말투예요(레시피 본문 내용은 그대로예요).
          </p>
        </div>
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
            {migrationError && <p style={{ marginTop: 8, color: 'var(--danger)' }}>⚠️ {migrationError}</p>}
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
    </>
  );
}

/**
 * "라벨: 값  [변경]" 형태로 보여주다가, [변경]을 누르면 그 자리가 입력창 + [취소]/[저장]으로
 * 바뀌는 인라인 편집 행. API 키 입력 폼처럼 입력창+저장 버튼+상태 문구를 항상 늘어놓는 대신,
 * 평소엔 값만 조용히 보여주고 편집이 필요할 때만 입력 UI가 나타나게 해서 화면이 덜 번잡해 보이게
 * 한다.
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
      {error && <p style={{ marginTop: 4, color: 'var(--danger)' }}>⚠️ {error}</p>}
    </div>
  );
}
