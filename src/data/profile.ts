import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useSession } from './session';
import { resizeImageForUpload } from '../lib/imageResize';

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export interface Profile {
  id: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
}

/**
 * 로그인한 사용자의 profiles 행(닉네임 등)을 조회/수정한다. display_name은 가입 시
 * handle_new_user() 트리거가 구글 계정 이름(raw_user_meta_data->>'full_name')으로 자동
 * 채워두지만, 이후 사용자가 설정 화면에서 직접 바꿀 수 있다(profiles_update_own RLS로
 * 이미 본인 행 수정은 허용되어 있어 별도 마이그레이션 불필요).
 */
export function useProfile() {
  const { user } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  // useHousehold()와 같은 이유로 user?.id로만 의존성을 좁힌다(household.ts의 설명 참고).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const refresh = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data } = await supabase
      .from('profiles')
      .select('id, display_name, email, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    setProfile(
      data
        ? { id: data.id, displayName: data.display_name ?? '', email: data.email, avatarUrl: data.avatar_url }
        : null,
    );
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function updateDisplayName(name: string) {
    if (!user) return;
    const trimmed = name.trim();
    const { error } = await supabase.from('profiles').update({ display_name: trimmed }).eq('id', user.id);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, displayName: trimmed } : p));
  }

  /** 갤러리에서 고른 사진을 프로필 사진으로 업로드한다 — avatars 버킷(공개, 0020 마이그레이션)에
   * 사용자당 고정 경로({user_id}/avatar.jpg)로 upsert하고 profiles.avatar_url을 그 공개 URL로
   * 갱신한다. 구글 로그인으로 자동 채워진 값을 덮어쓰게 되므로, 원래 구글 사진으로 되돌리고
   * 싶으면 revertToGoogleAvatar()를 쓴다(useSession()의 googleAvatarUrl 참고). */
  async function updateAvatarFromFile(file: File) {
    if (!user) return;
    const { base64, mimeType } = await resizeImageForUpload(file);
    const path = `${user.id}/avatar.jpg`;
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, base64ToUint8Array(base64), { contentType: mimeType, upsert: true });
    if (uploadError) throw uploadError;
    // 같은 경로라 공개 URL 문자열 자체는 안 바뀌므로, 브라우저 캐시를 피하려고 타임스탬프를 붙인다.
    const { data } = supabase.storage.from('avatars').getPublicUrl(path);
    const avatarUrl = `${data.publicUrl}?t=${Date.now()}`;
    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, avatarUrl } : p));
  }

  async function updateAvatarUrl(avatarUrl: string) {
    if (!user) return;
    const { error } = await supabase.from('profiles').update({ avatar_url: avatarUrl }).eq('id', user.id);
    if (error) throw error;
    setProfile((p) => (p ? { ...p, avatarUrl } : p));
  }

  return { profile, loading, updateDisplayName, updateAvatarFromFile, updateAvatarUrl, refresh };
}
