-- ============================================================================
-- CookKit — Supabase(PostgreSQL) 스키마 초안
-- ============================================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에 전체를 붙여넣고 실행(Run)하면 됩니다.
-- 이 파일은 "설계 단계" 산출물입니다 — 아직 앱 코드는 이 스키마를 사용하지 않습니다
-- (실제 데이터 레이어 전환은 다음 단계에서 진행).
--
-- 관계 요약
--   - profiles : households = N:1 (household_members로 매핑)
--   - ingredients        : household 단위로 공유(같은 집 식구끼리만 보임)
--   - recipes            : user(profile) 단위 소유, visibility로 3단계 공개범위(기본 household)
--   - categories / tags  : household 단위로 관리(기존 앱의 "카테고리 관리"/"태그 관리" 화면과 대응)
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid() 사용을 위함


-- ============================================================================
-- 1) profiles — Supabase Auth(auth.users)와 1:1로 연결되는 프로필 테이블
-- ============================================================================
-- 주의: 별도의 "users" 테이블을 새로 만들지 않습니다. Supabase Auth가 auth.users를
-- 이미 관리하고 있어서(이메일/구글 로그인 정보 등), 여기서는 앱에서 쓰는 프로필 정보만
-- 담는 public.profiles를 만들고 auth.users(id)를 그대로 참조합니다. (Supabase 공식 권장 패턴)

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  -- 구글 프로필 사진 URL(0013) — 우리 Storage에 복사하지 않고 구글이 제공하는 URL을 그대로 참조만
  avatar_url text,
  created_at timestamptz not null default now()
);

-- 구글 로그인으로 새 계정이 생성되면 profiles 행도 자동으로 만들어주는 트리거
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'full_name',
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============================================================================
-- 2) households — 가구
-- ============================================================================
create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);


-- ============================================================================
-- 3) household_members — User-Household 매핑 (N:1 관계 구현)
-- ============================================================================
create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- 스펙상 "여러 유저가 하나의 household에 속함(N:1)"이므로, 한 유저는 하나의 household에만
-- 속할 수 있도록 제한합니다(유저당 household 여러 개 허용하려면 이 인덱스를 지우면 됨).
create unique index household_members_one_household_per_user
  on public.household_members (user_id);

create index household_members_household_id_idx on public.household_members (household_id);


-- ============================================================================
-- RLS 재귀 방지용 헬퍼 함수
-- ============================================================================
-- household_members 자기 자신을 참조하는 정책을 직접 만들면 "infinite recursion
-- detected in policy" 에러가 남(정책 평가 중 서브쿼리가 같은 테이블의 정책을 다시 트리거).
-- Supabase 공식 권장대로 SECURITY DEFINER 함수로 우회해서 이 문제를 피합니다.

create function public.is_household_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.household_members
    where household_id = target_household_id and user_id = auth.uid()
  );
$$;

create function public.shares_household_with(target_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.household_members hm1
    join public.household_members hm2 on hm2.household_id = hm1.household_id
    where hm1.user_id = auth.uid() and hm2.user_id = target_user_id
  );
$$;


-- ============================================================================
-- 4) categories — 재료 카테고리 (household 단위, 사용자가 추가/이름변경/삭제 가능)
-- ============================================================================
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create index categories_household_id_idx on public.categories (household_id);


-- ============================================================================
-- 5) ingredients — 재료 (household 단위로 공유)
-- ============================================================================
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  name text not null,
  quantity numeric,
  unit text,
  allergens text[] not null default '{}',
  preferred_unit text,
  preferred_method text,
  -- 0016: 유통기한(선택) — 화면 임박 배지 + 예정된 웹 푸시 알림(Vercel Cron)이 참조
  expiration_date date,
  created_at timestamptz not null default now()
);
-- 참고: quantity/unit은 요청하신 스키마 그대로 넣었습니다. 기존 앱(localStorage 버전)은
-- "보유 여부(boolean)"만 저장했는데, 여기서는 실제 수량까지 저장하는 걸로 살짝 확장한
-- 형태입니다 — 실제 마이그레이션 때 UI를 boolean 토글로 쓸지 수량 입력으로 바꿀지 정하면 됩니다.
-- allergens/preferred_unit/preferred_method는 기존 앱에 이미 있는 필드라 추가했습니다.

create index ingredients_household_id_idx on public.ingredients (household_id);
create index ingredients_category_id_idx on public.ingredients (category_id);


-- ============================================================================
-- 6) tags — 레시피 태그(스타일/카테고리), household 단위로 관리
-- ============================================================================
create table public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  type text not null default 'style' check (type in ('style', 'category', 'cuisine')),
  created_at timestamptz not null default now()
);

create index tags_household_id_idx on public.tags (household_id);


-- ============================================================================
-- 7) recipes — 레시피 (user 단위 소유, visibility로 3단계 공개범위)
-- ============================================================================
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  -- private=본인만, household=같은 가구원까지(기본값), public=전체 공개
  visibility text not null default 'household' check (visibility in ('private', 'household', 'public')),
  source_recipe_id uuid references public.recipes(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- content(jsonb) 예시 구조 — 재료/조리순서처럼 레시피에 종속된 중첩 데이터는
-- 별도 테이블로 정규화하지 않고 jsonb 하나에 담습니다(개인/가구 단위 앱 규모에서는
-- 테이블을 여러 개로 쪼개는 것보다 이쪽이 더 간단하고, 필요하면 jsonb도 쿼리 가능):
-- {
--   "servingsBase": 2,
--   "ingredients": [{ "ingredientId": "<ingredients.id>", "amount": 200, "unit": "ml" }],
--   "steps": [{ "title": "...", "content": "...", "timerSeconds": 180, "imageId": "..." }]
-- }
-- 주의: ingredients 배열 안의 ingredientId는 FK 제약이 걸려있지 않음(jsonb 내부라 불가능) —
-- 재료를 삭제해도 레시피 쪽 참조가 자동으로 정리되지 않는 점은 감안해야 함.

create index recipes_user_id_idx on public.recipes (user_id);
create index recipes_visibility_idx on public.recipes (visibility) where visibility <> 'private';

create table public.recipe_tags (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);


-- ============================================================================
-- 8) shopping_selection — 장보기에 담긴 레시피 (household 단위 공유)
-- ============================================================================
create table public.shopping_selection (
  household_id uuid not null references public.households(id) on delete cascade,
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (household_id, recipe_id)
);

-- ============================================================================
-- 9) recipe_likes — 공개 레시피 좋아요(하트). user_id+recipe_id 복합 PK라 중복 좋아요 방지
-- ============================================================================
create table public.recipe_likes (
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (recipe_id, user_id)
);

create index recipe_likes_recipe_id_idx on public.recipe_likes (recipe_id);

-- 참고: CookingLog/MenuSet(요리 기록/손님초대모드)은 앱에서도 아직 UI가 없는 스텁이라
-- 이번 스키마에는 포함하지 않았습니다. 실제로 기능을 만들 때 테이블을 추가하면 됩니다.


-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.categories enable row level security;
alter table public.ingredients enable row level security;
alter table public.tags enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_tags enable row level security;
alter table public.shopping_selection enable row level security;

-- ---- profiles ---------------------------------------------------------
-- 본인 프로필 + 같은 household 구성원 프로필(이름 표시용)까지 조회 가능
create policy "profiles_select_own_or_household" on public.profiles
  for select using (
    id = auth.uid() or public.shares_household_with(id)
  );

-- 공개 레시피 작성자 이름("OO님의 레시피")은 household가 달라도 조회 가능해야 함
-- (household 등급 레시피 작성자는 위 profiles_select_own_or_household가 이미 커버함)
create policy "profiles_select_via_public_recipe" on public.profiles
  for select using (
    id in (select user_id from public.recipes where visibility = 'public')
  );

create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- ---- households ---------------------------------------------------------
create policy "households_select_member" on public.households
  for select using (public.is_household_member(id));

-- 다른 가구의 공개 레시피에 "OO님의 레시피 (가구이름)"처럼 작성자의 가구 이름을 표시하기
-- 위한 예외(0012) — tags/ingredients/profiles에 이미 있던 것과 같은 종류의 SELECT 전용 보완
create policy "households_select_via_public_recipe" on public.households
  for select using (
    id in (
      select hm.household_id
      from public.household_members hm
      join public.recipes r on r.user_id = hm.user_id
      where r.visibility = 'public'
    )
  );

-- 새 household 생성은 로그인한 사용자면 누구나 가능(생성 직후 household_members에도
-- 본인을 추가해야 실제로 그 household의 멤버가 됨 — 앱에서 두 insert를 함께 처리할 것)
create policy "households_insert_authenticated" on public.households
  for insert with check (auth.uid() is not null);

create policy "households_update_member" on public.households
  for update using (public.is_household_member(id));

-- ---- household_members ---------------------------------------------------------
create policy "household_members_select_own_household" on public.household_members
  for select using (public.is_household_member(household_id));

-- 공개 레시피 작성자가 어느 household 소속인지 알아내기 위한 예외(0012) — households_select_via_public_recipe가
-- 참조하는 조인 경로. 노출 컬럼은 user_id/household_id뿐이라 추가 민감정보 노출은 없음.
create policy "household_members_select_via_public_recipe" on public.household_members
  for select using (
    user_id in (select user_id from public.recipes where visibility = 'public')
  );

-- TODO(실제 구현 때 보완): 지금은 "내 user_id로만 insert 가능"만 체크해서, household_id를
-- 알고 있으면(UUID라 추측은 어렵지만) invite_code 검증 없이 바로 가입이 가능한 상태입니다.
-- 실제 "초대 코드로 가입하기" 기능을 만들 때는 invite_code를 검증하고 나서 insert까지
-- 한번에 처리하는 SECURITY DEFINER 함수(RPC)로 바꿀 것.
create policy "household_members_insert_self" on public.household_members
  for insert with check (user_id = auth.uid());

-- ---- categories / ingredients / tags ---------------------------------------------------------
-- 세 테이블 모두 "같은 household면 보고 고칠 수 있다"로 동일한 규칙이라 헬퍼 함수 하나로 처리
create policy "categories_all_household_member" on public.categories
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "ingredients_all_household_member" on public.ingredients
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "tags_all_household_member" on public.tags
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- 공개(public) 레시피가 쓰는 태그/재료는 household가 달라도 이름을 읽을 수 있어야 함(둘러보기
-- 화면용) — household 등급은 어차피 같은 household 멤버끼리라 위 household 단위 정책이 이미 커버함.
create policy "tags_select_via_public_recipe" on public.tags
  for select using (
    exists (
      select 1 from public.recipe_tags rt
      join public.recipes r on r.id = rt.recipe_id
      where rt.tag_id = tags.id and r.visibility = 'public'
    )
  );

create policy "ingredients_select_via_public_recipe" on public.ingredients
  for select using (
    exists (
      select 1 from public.recipes r
      where r.visibility = 'public'
        and exists (
          select 1 from jsonb_array_elements(coalesce(r.content->'ingredients', '[]'::jsonb)) as ing
          where (ing->>'ingredientId')::uuid = ingredients.id
        )
    )
  );

-- ---- recipes ---------------------------------------------------------
-- private=본인만, household=같은 가구원까지, public=전체 공개
create policy "recipes_select_visibility" on public.recipes
  for select using (
    visibility = 'public'
    or user_id = auth.uid()
    or (visibility = 'household' and public.shares_household_with(user_id))
  );

create policy "recipes_insert_own" on public.recipes
  for insert with check (user_id = auth.uid());

create policy "recipes_update_own" on public.recipes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "recipes_delete_own" on public.recipes
  for delete using (user_id = auth.uid());

-- ---- recipe_tags ---------------------------------------------------------
create policy "recipe_tags_select_via_recipe" on public.recipe_tags
  for select using (
    recipe_id in (
      select id from public.recipes
      where visibility = 'public'
        or user_id = auth.uid()
        or (visibility = 'household' and public.shares_household_with(user_id))
    )
  );

create policy "recipe_tags_modify_via_recipe_owner" on public.recipe_tags
  for all using (
    recipe_id in (select id from public.recipes where user_id = auth.uid())
  );

-- ---- shopping_selection ---------------------------------------------------------
create policy "shopping_selection_all_household_member" on public.shopping_selection
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

-- ---- recipe_likes ---------------------------------------------------------
alter table public.recipe_likes enable row level security;

create policy "recipe_likes_select_via_recipe" on public.recipe_likes
  for select using (
    recipe_id in (
      select id from public.recipes
      where visibility = 'public'
        or user_id = auth.uid()
        or (visibility = 'household' and public.shares_household_with(user_id))
    )
  );

create policy "recipe_likes_insert_own" on public.recipe_likes
  for insert with check (user_id = auth.uid());

create policy "recipe_likes_delete_own" on public.recipe_likes
  for delete using (user_id = auth.uid());

-- ---- user_api_keys (0014) — Anthropic/Gemini API 키 Vault 암호화 저장 ----------------------
-- 실제 키 값은 vault.secrets에 암호화 저장하고, 이 테이블은 그 참조(secret_id)만 가진다.
-- household가 아니라 user 단위. "본인 키만 조회/저장 가능"은 RLS가 아니라 서버리스 함수가
-- 로그인 세션(JWT)을 검증해서 그 user_id로만 동작하게 하는 방식으로 보장한다 — 아래 함수들이
-- service_role 전용이라 클라이언트는 어차피 이 경로로 접근할 수 없다. 자세한 배경은
-- supabase/migrations/0014_api_key_vault.sql 참고.
create extension if not exists supabase_vault;

create table public.user_api_keys (
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- youtube는 0015에서 추가(YouTube Data API 키도 같은 방식으로 Vault 저장)
  provider text not null check (provider in ('anthropic', 'gemini', 'youtube')),
  secret_id uuid not null references vault.secrets(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, provider)
);

alter table public.user_api_keys enable row level security;

create or replace function public.save_user_api_key(p_user_id uuid, p_provider text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_secret_id uuid;
begin
  if p_provider not in ('anthropic', 'gemini') then
    raise exception 'invalid provider: %', p_provider;
  end if;

  select secret_id into existing_secret_id
  from public.user_api_keys
  where user_id = p_user_id and provider = p_provider;

  if existing_secret_id is not null then
    perform vault.update_secret(existing_secret_id, p_secret);
    update public.user_api_keys
      set updated_at = now()
      where user_id = p_user_id and provider = p_provider;
  else
    existing_secret_id := vault.create_secret(p_secret, p_user_id::text || ':' || p_provider);
    insert into public.user_api_keys (user_id, provider, secret_id)
    values (p_user_id, p_provider, existing_secret_id);
  end if;
end;
$$;

create or replace function public.get_user_api_key(p_user_id uuid, p_provider text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  result text;
begin
  select vs.decrypted_secret into result
  from public.user_api_keys k
  join vault.decrypted_secrets vs on vs.id = k.secret_id
  where k.user_id = p_user_id and k.provider = p_provider;
  return result;
end;
$$;

revoke execute on function public.save_user_api_key(uuid, text, text) from public;
revoke execute on function public.save_user_api_key(uuid, text, text) from anon;
revoke execute on function public.save_user_api_key(uuid, text, text) from authenticated;
grant execute on function public.save_user_api_key(uuid, text, text) to service_role;

revoke execute on function public.get_user_api_key(uuid, text) from public;
revoke execute on function public.get_user_api_key(uuid, text) from anon;
revoke execute on function public.get_user_api_key(uuid, text) from authenticated;
grant execute on function public.get_user_api_key(uuid, text) to service_role;

-- ---- push_subscriptions (0017) — 웹 푸시 구독 정보(유통기한 알림용) --------------------------
-- 구독 정보 자체는 비밀값이 아니라 RLS만으로 본인 것만 관리. 실제 발송은 service_role로
-- api/check-expiring-ingredients.ts(Vercel Cron)가 처리. 자세한 배경은 0017 마이그레이션 참고.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  subscription_data jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_select_own" on public.push_subscriptions
  for select using (user_id = auth.uid());

create policy "push_subscriptions_insert_own" on public.push_subscriptions
  for insert with check (user_id = auth.uid());

create policy "push_subscriptions_delete_own" on public.push_subscriptions
  for delete using (user_id = auth.uid());
