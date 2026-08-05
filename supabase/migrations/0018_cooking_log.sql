-- ============================================================================
-- 0018_cooking_log.sql — 요리 완료 기록(CookingLog)
-- ============================================================================
-- household 공유(누가 만들었든 우리집 기록으로 다 같이 보임), 기록 생성은 household 멤버면
-- 누구나 가능하지만 수정/삭제는 본인 것만 — recipe_likes(0009)의 "본인 것만 write" 패턴과
-- shopping_selection(스키마 8번)의 "household 공유" 패턴을 섞은 형태.
--
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 한 번 실행.
-- ============================================================================

create table if not exists public.cooking_log (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes(id) on delete cascade,
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  cooked_at timestamptz not null default now(),
  memo text,
  created_at timestamptz not null default now()
);

create index if not exists cooking_log_recipe_id_idx on public.cooking_log (recipe_id);
create index if not exists cooking_log_household_id_idx on public.cooking_log (household_id);

alter table public.cooking_log enable row level security;

-- household 구성원이면 누가 기록했든 다 같이 조회 가능(우리집 기록)
drop policy if exists "cooking_log_select_household" on public.cooking_log;
create policy "cooking_log_select_household" on public.cooking_log
  for select using (public.is_household_member(household_id));

-- 기록 생성은 household 멤버 + 본인 명의로만
drop policy if exists "cooking_log_insert_household" on public.cooking_log;
create policy "cooking_log_insert_household" on public.cooking_log
  for insert with check (public.is_household_member(household_id) and user_id = auth.uid());

drop policy if exists "cooking_log_update_own" on public.cooking_log;
create policy "cooking_log_update_own" on public.cooking_log
  for update using (user_id = auth.uid());

drop policy if exists "cooking_log_delete_own" on public.cooking_log;
create policy "cooking_log_delete_own" on public.cooking_log
  for delete using (user_id = auth.uid());
