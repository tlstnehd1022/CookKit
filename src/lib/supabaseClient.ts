import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Supabase 환경변수가 없습니다. .env.example을 복사해 .env를 만들고 ' +
      'VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY를 채워주세요.',
  );
}

// anon key는 공개해도 되는 키입니다(Row Level Security로 실제 접근 권한을 제어) — 브라우저에
// 그대로 노출되어도 안전하게 설계되어 있습니다. service_role 키는 여기서 절대 쓰지 않습니다.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
