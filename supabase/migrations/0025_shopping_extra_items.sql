-- 장보기 화면에서 레시피를 거치지 않고 "직접 추가"한 항목(E-2/E-3) — household 공유,
-- shopping_selection과 같은 패턴. 재료 하나당 household에 한 행만 존재(unique) — 이미 직접
-- 추가돼있으면 다시 추가해도 덮어쓴다.
create table public.shopping_extra_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  amount numeric,
  unit text,
  created_at timestamptz not null default now(),
  unique (household_id, ingredient_id)
);

create index shopping_extra_items_household_id_idx on public.shopping_extra_items (household_id);

alter table public.shopping_extra_items enable row level security;

create policy "shopping_extra_items_all_household_member" on public.shopping_extra_items
  for all using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));
