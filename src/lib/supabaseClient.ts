/// <reference types="vite/client" />
// 위 triple-slash reference는 import.meta.env의 타입(ImportMetaEnv)을 이 파일 안에서 명시적으로
// 끌어온다 — 이 파일은 브라우저 전용이라 원래 tsconfig.app.json의 "types": ["vite/client"]로
// 충분했지만, TypeScript는 동적 import(youtubeTranscript.ts의 `await import('./aiProxy.js')`)의
// 타입도 정적으로 분석하기 때문에, api/*.ts(Vercel 서버리스 함수, vite/client 타입이 없는 별도
// tsconfig로 체크됨)를 타입체크할 때도 이 파일까지 끌려들어와 "Property 'env' does not exist on
// type 'ImportMeta'" 에러가 났었다(빌드 자체는 로컬에서 안 잡힘 — tsc -b가 api/를 대상에 안 둬서).
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
