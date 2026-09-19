-- My Cal — initial schema.
--
-- Every private table carries user_id and has row level security on. The
-- browser holds only the anon key, so RLS is the whole of the access control
-- story: if a policy is missing, the data is exposed.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums ----

create type sex_for_bmr as enum ('male', 'female', 'unspecified');
create type activity_level as enum ('sedentary', 'light', 'moderate', 'very', 'extra');
create type goal_type as enum ('lose', 'maintain', 'gain');
create type unit_preference as enum ('metric', 'imperial');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack', 'unassigned');
create type entry_source as enum ('photo_ai', 'barcode', 'manual');
create type part_kind as enum ('ingredient', 'extra');
create type image_status as enum ('uploaded', 'processing', 'ready', 'failed', 'deleted');
create type analysis_status as enum ('uploaded', 'processing', 'ready', 'failed', 'cancelled');
create type reference_source as enum ('openfoodfacts', 'curated', 'user');

-- ------------------------------------------------------------- profiles ----

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  age integer not null check (age between 13 and 110),
  sex_for_bmr sex_for_bmr not null,
  height_cm numeric(5,1) not null check (height_cm between 90 and 250),
  activity_level activity_level not null,
  goal goal_type not null,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  unit_preference unit_preference not null default 'metric',
  -- Required when the Mifflin–St Jeor constant does not apply.
  custom_calorie_target integer check (custom_calorie_target is null
    or custom_calorie_target between 1000 and 6000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint custom_target_required_when_unspecified
    check (sex_for_bmr <> 'unspecified' or custom_calorie_target is not null)
);

-- ----------------------------------------------------- nutrition targets ----

create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_on date not null,
  -- Snapshot of the inputs, so a past target stays explainable after the
  -- profile changes.
  input_age integer not null,
  input_sex_for_bmr sex_for_bmr not null,
  input_height_cm numeric(5,1) not null,
  input_weight_kg numeric(6,2) not null,
  input_activity_level activity_level not null,
  input_goal goal_type not null,
  bmi numeric(5,2) not null,
  bmr_kcal numeric(7,1) not null default 0,
  tdee_kcal numeric(7,1) not null default 0,
  calorie_target_kcal numeric(7,1) not null check (calorie_target_kcal >= 0),
  protein_target_g numeric(6,1) not null default 0,
  carbs_target_g numeric(6,1) not null default 0,
  fat_target_g numeric(6,1) not null default 0,
  fibre_target_g numeric(6,1) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, effective_on)
);

create index nutrition_targets_user_date_idx
  on public.nutrition_targets (user_id, effective_on desc);

-- -------------------------------------------------------- weight entries ----

create table public.weight_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  recorded_on date not null,
  weight_kg numeric(6,2) not null check (weight_kg between 25 and 400),
  note text check (note is null or char_length(note) <= 280),
  created_at timestamptz not null default now(),
  unique (user_id, recorded_on)
);

create index weight_entries_user_date_idx
  on public.weight_entries (user_id, recorded_on);

-- ----------------------------------------------------------- food images ----

create table public.food_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- A path into the private bucket. Never a durable public URL.
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 10485760),
  status image_status not null default 'uploaded',
  created_at timestamptz not null default now()
);

create index food_images_user_idx on public.food_images (user_id, created_at desc);

-- ---------------------------------------------------------- ai analyses ----

create table public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_image_id uuid references public.food_images(id) on delete cascade,
  status analysis_status not null default 'processing',
  model text,
  model_version text,
  -- Bounded, versioned provider output kept for review and audit.
  result jsonb,
  failure_code text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index ai_analyses_user_idx on public.ai_analyses (user_id, created_at desc);
create index ai_analyses_image_idx on public.ai_analyses (food_image_id);

-- ------------------------------------------------------- food references ----

create table public.food_references (
  id uuid primary key default gen_random_uuid(),
  source reference_source not null,
  external_id text,
  name text not null,
  brand text,
  barcode text,
  serving_description text,
  serving_grams numeric(8,2),
  nutrients_per_100g jsonb not null,
  retrieved_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- A product is identified by its barcode, so cache one row per code.
create unique index food_references_barcode_idx
  on public.food_references (barcode) where barcode is not null;
create index food_references_name_idx on public.food_references using gin (to_tsvector('simple', name));

-- ---------------------------------------------------------- food entries ----

create table public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Set by the client from the user's own timezone, not the server clock.
  consumed_on date not null,
  meal_type meal_type not null default 'unassigned',
  source entry_source not null,
  display_name text not null check (char_length(display_name) between 1 and 160),
  quantity numeric(10,2) not null default 1 check (quantity >= 0),
  quantity_unit text not null default 'serving' check (char_length(quantity_unit) <= 24),
  -- The historical record for totals. Never recomputed from a reference that
  -- changed later.
  nutrition_snapshot jsonb not null,
  -- Materialised for indexing and day aggregation.
  calories_kcal numeric(8,1) generated always as
    ((nutrition_snapshot ->> 'calories_kcal')::numeric) stored,
  food_reference_id uuid references public.food_references(id) on delete set null,
  ai_analysis_id uuid references public.ai_analyses(id) on delete set null,
  food_image_id uuid references public.food_images(id) on delete set null,
  user_corrected boolean not null default false,
  confidence numeric(4,3) check (confidence is null or confidence between 0 and 1),
  note text check (note is null or char_length(note) <= 500),
  -- Stops a retried save from logging the same meal twice.
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index food_entries_user_day_idx on public.food_entries (user_id, consumed_on);
create index food_entries_image_idx on public.food_entries (food_image_id);

-- ----------------------------------------------------- food entry parts ----

create table public.food_entry_parts (
  id uuid primary key default gen_random_uuid(),
  food_entry_id uuid not null references public.food_entries(id) on delete cascade,
  kind part_kind not null,
  name text not null check (char_length(name) between 1 and 160),
  quantity numeric(10,2) check (quantity is null or quantity >= 0),
  quantity_unit text check (quantity_unit is null or char_length(quantity_unit) <= 24),
  nutrition_snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index food_entry_parts_entry_idx on public.food_entry_parts (food_entry_id);

-- ------------------------------------------------------------- updated_at ---

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger food_entries_touch before update on public.food_entries
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------- micronutrient summing ----

-- Adds two sparse nutrient maps. A key present on one side survives; a key
-- present on neither stays absent, which is what "not available" means here.
create or replace function public.jsonb_add_numeric(acc jsonb, item jsonb)
returns jsonb language sql immutable as $$
  select coalesce((
    select jsonb_object_agg(key, total)
    from (
      select key, sum(value::numeric) as total
      from (
        select key, value from jsonb_each_text(coalesce(acc, '{}'::jsonb))
        union all
        select key, value from jsonb_each_text(coalesce(item, '{}'::jsonb))
      ) pairs
      where value ~ '^-?[0-9]+(\.[0-9]+)?$'
      group by key
    ) summed
  ), '{}'::jsonb);
$$;

create aggregate public.jsonb_sum(jsonb) (
  sfunc = public.jsonb_add_numeric,
  stype = jsonb,
  initcond = '{}'
);

-- One day's totals: every entry plus every part attached to it. The view runs
-- as the caller, so RLS still applies.
create or replace view public.daily_totals
with (security_invoker = true) as
with line_items as (
  select e.user_id, e.consumed_on, e.nutrition_snapshot as snapshot
  from public.food_entries e
  union all
  select e.user_id, e.consumed_on, p.nutrition_snapshot
  from public.food_entry_parts p
  join public.food_entries e on e.id = p.food_entry_id
)
select
  user_id,
  consumed_on,
  round(sum((snapshot ->> 'calories_kcal')::numeric), 0) as calories_kcal,
  round(sum((snapshot ->> 'protein_g')::numeric), 1) as protein_g,
  round(sum((snapshot ->> 'carbs_g')::numeric), 1) as carbs_g,
  round(sum((snapshot ->> 'fat_g')::numeric), 1) as fat_g,
  -- Null when no source reported fibre at all, rather than a misleading zero.
  round(sum((snapshot ->> 'fibre_g')::numeric), 1) as fibre_g,
  public.jsonb_sum(coalesce(snapshot -> 'micronutrients', '{}'::jsonb)) as micronutrients,
  count(*) as line_item_count
from line_items
group by user_id, consumed_on;

-- ------------------------------------------------------------------ RLS ----

alter table public.profiles enable row level security;
alter table public.nutrition_targets enable row level security;
alter table public.weight_entries enable row level security;
alter table public.food_images enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.food_entries enable row level security;
alter table public.food_entry_parts enable row level security;
alter table public.food_references enable row level security;

-- Owner-only tables. USING guards reads and the old row; WITH CHECK guards the
-- new row, so an update cannot reassign a record to someone else.
create policy "read own profile" on public.profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own profile" on public.profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own profile" on public.profiles
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own profile" on public.profiles
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own targets" on public.nutrition_targets
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own targets" on public.nutrition_targets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own targets" on public.nutrition_targets
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own targets" on public.nutrition_targets
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own weights" on public.weight_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own weights" on public.weight_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own weights" on public.weight_entries
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own weights" on public.weight_entries
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own images" on public.food_images
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own images" on public.food_images
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own images" on public.food_images
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own images" on public.food_images
  for delete to authenticated using (user_id = (select auth.uid()));

-- Analyses are written by the edge function under the service role, which
-- bypasses RLS; the browser may read and abandon its own, nothing more.
create policy "read own analyses" on public.ai_analyses
  for select to authenticated using (user_id = (select auth.uid()));
create policy "delete own analyses" on public.ai_analyses
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "read own entries" on public.food_entries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert own entries" on public.food_entries
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update own entries" on public.food_entries
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own entries" on public.food_entries
  for delete to authenticated using (user_id = (select auth.uid()));

-- A part is reachable only through an entry the caller owns. The caller's
-- food_entry_id is never trusted on its own.
create policy "read own entry parts" on public.food_entry_parts
  for select to authenticated using (exists (
    select 1 from public.food_entries e
    where e.id = food_entry_id and e.user_id = (select auth.uid())));
create policy "insert own entry parts" on public.food_entry_parts
  for insert to authenticated with check (exists (
    select 1 from public.food_entries e
    where e.id = food_entry_id and e.user_id = (select auth.uid())));
create policy "update own entry parts" on public.food_entry_parts
  for update to authenticated
  using (exists (select 1 from public.food_entries e
    where e.id = food_entry_id and e.user_id = (select auth.uid())))
  with check (exists (select 1 from public.food_entries e
    where e.id = food_entry_id and e.user_id = (select auth.uid())));
create policy "delete own entry parts" on public.food_entry_parts
  for delete to authenticated using (exists (
    select 1 from public.food_entries e
    where e.id = food_entry_id and e.user_id = (select auth.uid())));

-- Reference data is shared and read-only to the browser. Ingestion and cache
-- refreshes happen in edge functions under the service role.
create policy "read reference foods" on public.food_references
  for select to authenticated using (true);

-- -------------------------------------------------------------- storage ----

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('food-images', 'food-images', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Objects live at food-images/{user_id}/{image_id}.{ext}; the policy checks
-- that first path segment on every operation.
create policy "read own food images" on storage.objects
  for select to authenticated
  using (bucket_id = 'food-images'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "upload own food images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'food-images'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "update own food images" on storage.objects
  for update to authenticated
  using (bucket_id = 'food-images'
         and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'food-images'
              and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "delete own food images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'food-images'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
