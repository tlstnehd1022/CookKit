# Supabase 설정 가이드 (CookKit)

CookKit을 localStorage 단독 구조에서 Supabase(Postgres + Auth) 기반으로 전환하는 첫 단계입니다.
이 문서는 **콘솔 설정**을 순서대로 안내합니다 — 아직 앱 코드는 Supabase를 사용하지 않습니다
(다음 단계에서 실제 데이터 레이어 전환을 진행할 예정).

## 0. 준비물
- Google 계정(구글 로그인용 OAuth 클라이언트를 만들 때 필요)
- Supabase 계정 (https://supabase.com, 무료 티어로 시작 가능)

---

## 1. Supabase 프로젝트 생성
1. https://supabase.com 에 가입/로그인
2. "New Project" 클릭
3. 프로젝트 이름(예: `cookkit`), DB 비밀번호(랜덤 생성 후 안전한 곳에 보관 — SQL Editor 사용에는
   필요 없지만 나중에 직접 DB 접속할 때 필요할 수 있음), 리전(가까운 곳, 예: Northeast Asia)을 선택
4. 프로젝트 생성 완료까지 1~2분 정도 걸림

## 2. 구글 소셜 로그인(OAuth) 설정
구글 로그인은 **Google Cloud Console에서 OAuth 클라이언트를 먼저 만든 뒤**, 그 클라이언트
ID/Secret을 Supabase에 등록하는 2단계로 진행됩니다.

### 2-1. Supabase에서 리다이렉트 URL 먼저 확인
1. Supabase 대시보드 > 좌측 메뉴 **Authentication > Providers > Google**로 이동
2. 여기 보이는 **Callback URL(Redirect URL)**을 복사해둠
   (형태: `https://<project-ref>.supabase.co/auth/v1/callback`)

### 2-2. Google Cloud Console에서 OAuth 클라이언트 생성
1. https://console.cloud.google.com/ 접속 (없으면 새 프로젝트 생성)
2. **APIs & Services > OAuth consent screen**에서 동의 화면 설정(External, 앱 이름 등 최소 정보만
   입력하면 됨 — 개인/가구용이라 "테스트 사용자"로 본인/가족 이메일만 추가해도 충분)
3. **APIs & Services > Credentials > Create Credentials > OAuth client ID** 선택
4. Application type: **Web application**
5. **Authorized redirect URIs**에 2-1에서 복사한 Supabase Callback URL을 붙여넣기
6. 생성 후 나오는 **Client ID**와 **Client Secret**을 복사

### 2-3. Supabase에 구글 클라이언트 정보 등록
1. 다시 Supabase 대시보드 **Authentication > Providers > Google**로 이동
2. Google 활성화(Enable) 토글 켜기
3. Client ID / Client Secret 붙여넣고 저장

## 3. 데이터베이스 스키마 적용
1. Supabase 대시보드 > 좌측 메뉴 **SQL Editor** 이동
2. "New query" 클릭
3. 이 저장소의 `supabase/schema.sql` 파일 내용을 전체 복사해서 붙여넣기
4. **Run** 클릭해서 실행 — 에러 없이 끝나면 테이블/정책이 모두 생성된 것
5. 좌측 메뉴 **Table Editor**에서 `profiles`, `households`, `household_members`, `categories`,
   `ingredients`, `tags`, `recipes`, `recipe_tags`, `shopping_selection` 테이블이 보이는지 확인

## 4. API 키 발급 및 .env 설정
1. Supabase 대시보드 > **Project Settings > API** 이동
2. **Project URL**과 **Project API keys > anon public** 키를 복사
   (⚠️ `service_role` 키는 절대 복사해서 프론트엔드 코드/`.env`에 넣지 말 것 — 이건 RLS를
   무시하는 관리자 권한 키라 브라우저에 노출되면 안 됨. 지금 필요한 건 `anon` 키뿐)
3. 프로젝트 루트의 `.env.example`을 복사해서 `.env` 파일 생성
4. `.env` 안의 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` 값을 방금 복사한 실제 값으로 교체
5. `.env`는 `.gitignore`에 이미 포함되어 있어 커밋되지 않음(확인 완료)

## 5. 여기까지 확인되면
- Table Editor에서 테이블 목록이 정상적으로 보임
- `.env`에 실제 URL/anon key가 채워짐
- Authentication > Providers에서 Google이 "Enabled" 상태

이 상태가 되면 다음 단계(실제 로그인 화면을 구글 OAuth로 교체, `src/data/session.ts`·
`src/data/repos.ts` 등 데이터 레이어를 Supabase 호출로 전환, 기존 localStorage 데이터를
JSON 내보내기 → Supabase로 가져오는 마이그레이션 스크립트 작성)로 넘어가면 됩니다.

## 참고: 아직 안 만든 것 (다음 단계 예정)
- `src/lib/supabaseClient.ts` (Supabase 클라이언트 초기화 코드) — 아직 없음
- 실제 로그인 화면의 구글 로그인 버튼 연동
- household 생성/초대코드로 가입하는 화면 및 로직(초대 코드 검증은 RPC 함수로 별도 구현 필요 —
  `supabase/schema.sql`의 `household_members_insert_self` 정책 주석 참고)
- 기존 localStorage 데이터 → Supabase 마이그레이션 스크립트(JSON 내보내기 포맷 재사용 예정)
