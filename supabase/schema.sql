-- bogomolka: database setup. Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to re-run: it creates what is missing and replaces functions and policies.

create extension if not exists pgcrypto;

-- ============ admins & settings ============
create table if not exists public.admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.admins enable row level security;
drop policy if exists "admins see themselves" on public.admins;
create policy "admins see themselves" on public.admins for select to authenticated using (user_id = auth.uid());

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

create table if not exists public.site_config (
  key text primary key,
  value jsonb not null
);
alter table public.site_config enable row level security;
drop policy if exists "config is public" on public.site_config;
drop policy if exists "admin writes config" on public.site_config;
create policy "config is public" on public.site_config for select using (true);
create policy "admin writes config" on public.site_config for all to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.site_config (key, value) values ('timezone', '"Europe/Moscow"') on conflict (key) do nothing;

-- The project "today" in one time zone, so the wall flips at the same moment for everyone.
create or replace function public.project_today() returns date
language sql stable security definer set search_path = public as $$
  select (now() at time zone coalesce((select value #>> '{}' from public.site_config where key = 'timezone'), 'UTC'))::date;
$$;

-- ============ today's wall ============
create table if not exists public.wall_items (
  id uuid primary key default gen_random_uuid(),
  day date not null,
  kind text not null check (kind in ('note', 'whisper', 'sticker', 'image', 'strip', 'drawing', 'medal')),
  x real not null default 0 check (x between -200 and 2600),
  y real not null default 0 check (y between -200 and 1800),
  w real not null default 200 check (w between 16 and 1400),
  h real not null default 200 check (h between 16 and 1400),
  rot real not null default 0 check (rot between -360 and 360),
  z integer not null default 0,
  data jsonb not null default '{}'::jsonb check (pg_column_size(data) < 60000),
  owner uuid not null default auth.uid(),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists wall_items_day on public.wall_items (day);
create index if not exists wall_items_owner on public.wall_items (owner, created_at);
alter table public.wall_items enable row level security;
alter table public.wall_items replica identity full;

drop policy if exists "everyone reads the wall" on public.wall_items;
drop policy if exists "guests add to today" on public.wall_items;
drop policy if exists "guests edit their own today" on public.wall_items;
drop policy if exists "guests delete their own today" on public.wall_items;
create policy "everyone reads the wall" on public.wall_items for select
  using (hidden = false or public.is_admin());
create policy "guests add to today" on public.wall_items for insert to authenticated
  with check (owner = auth.uid() and day = public.project_today() and hidden = false);
create policy "guests edit their own today" on public.wall_items for update to authenticated
  using ((owner = auth.uid() and day = public.project_today()) or public.is_admin())
  with check ((owner = auth.uid() and day = public.project_today() and hidden = false) or public.is_admin());
create policy "guests delete their own today" on public.wall_items for delete to authenticated
  using ((owner = auth.uid() and day = public.project_today()) or public.is_admin());

-- Spam guard: pace, daily cap, text length. Admins are not limited.
create or replace function public.wall_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int; per_day int;
begin
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      select count(*) into recent from public.wall_items where owner = auth.uid() and created_at > now() - interval '1 minute';
      if recent >= 6 then raise exception 'slow_down'; end if;
      select count(*) into per_day from public.wall_items where owner = auth.uid() and day = new.day;
      if per_day >= 40 then raise exception 'daily_limit'; end if;
      new.hidden := false;
    end if;
    new.created_at := now();
  else
    -- pg_trigger_depth() > 1 means the change comes from auto_hide below, which may hide items
    if not public.is_admin() and pg_trigger_depth() < 2 then
      new.kind := old.kind; new.owner := old.owner; new.day := old.day; new.created_at := old.created_at; new.hidden := old.hidden;
    end if;
  end if;
  if new.kind in ('note', 'whisper') and length(coalesce(new.data ->> 'text', '')) > 280 then raise exception 'too_long'; end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists wall_guard on public.wall_items;
create trigger wall_guard before insert or update on public.wall_items for each row execute function public.wall_guard();

-- Reports: three different people → the item hides itself until an admin looks.
create table if not exists public.wall_reports (
  item_id uuid not null references public.wall_items(id) on delete cascade,
  reporter uuid not null default auth.uid(),
  reason text not null default '' check (length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (item_id, reporter)
);
alter table public.wall_reports enable row level security;
drop policy if exists "anyone signed in can report" on public.wall_reports;
drop policy if exists "admins read reports" on public.wall_reports;
drop policy if exists "admins clear reports" on public.wall_reports;
create policy "anyone signed in can report" on public.wall_reports for insert to authenticated with check (reporter = auth.uid());
create policy "admins read reports" on public.wall_reports for select to authenticated using (public.is_admin());
create policy "admins clear reports" on public.wall_reports for delete to authenticated using (public.is_admin());

create or replace function public.auto_hide() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.wall_reports where item_id = new.item_id) >= 3 then
    update public.wall_items set hidden = true where id = new.item_id;
  end if;
  return new;
end $$;
drop trigger if exists auto_hide on public.wall_reports;
create trigger auto_hide after insert on public.wall_reports for each row execute function public.auto_hide();

-- ============ content the owner edits ============
create table if not exists public.objects (id text primary key, sort real not null default 0, draft boolean not null default false, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
create table if not exists public.works   (id text primary key, sort real not null default 0, draft boolean not null default false, data jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now());
alter table public.objects enable row level security;
alter table public.works enable row level security;
drop policy if exists "read published objects" on public.objects;
drop policy if exists "admin edits objects" on public.objects;
drop policy if exists "read published works" on public.works;
drop policy if exists "admin edits works" on public.works;
create policy "read published objects" on public.objects for select using (draft = false or public.is_admin());
create policy "admin edits objects" on public.objects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "read published works" on public.works for select using (draft = false or public.is_admin());
create policy "admin edits works" on public.works for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.prompts (
  id bigint generated always as identity primary key,
  text text not null check (length(text) between 2 and 140),
  day date,
  active boolean not null default true
);
alter table public.prompts enable row level security;
drop policy if exists "prompts are public" on public.prompts;
drop policy if exists "admin edits prompts" on public.prompts;
create policy "prompts are public" on public.prompts for select using (true);
create policy "admin edits prompts" on public.prompts for all to authenticated using (public.is_admin()) with check (public.is_admin());

create table if not exists public.stickers (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  name text not null default '',
  active boolean not null default true,
  sort real not null default 0
);
alter table public.stickers enable row level security;
drop policy if exists "stickers are public" on public.stickers;
drop policy if exists "admin edits stickers" on public.stickers;
create policy "stickers are public" on public.stickers for select using (active or public.is_admin());
create policy "admin edits stickers" on public.stickers for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ============ live updates ============
do $$ begin
  alter publication supabase_realtime add table public.wall_items;
exception when duplicate_object then null; when undefined_object then null; end $$;

-- ============ file storage ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('wall', 'wall', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152, allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 15728640, array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml'])
on conflict (id) do update set public = true, file_size_limit = 15728640;

drop policy if exists "guests upload to their wall folder" on storage.objects;
drop policy if exists "guests delete their wall files" on storage.objects;
drop policy if exists "admin manages media" on storage.objects;
drop policy if exists "admin manages wall files" on storage.objects;
create policy "guests upload to their wall folder" on storage.objects for insert to authenticated
  with check (bucket_id = 'wall' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "guests delete their wall files" on storage.objects for delete to authenticated
  using (bucket_id = 'wall' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "admin manages media" on storage.objects for all to authenticated
  using (bucket_id = 'media' and public.is_admin()) with check (bucket_id = 'media' and public.is_admin());
create policy "admin manages wall files" on storage.objects for delete to authenticated
  using (bucket_id = 'wall' and public.is_admin());

-- ============ VIDEO RENTAL: film & series recommendations ============
-- Guests suggest films; a suggestion stays hidden ("pending") until the owner approves it in the admin panel.
create table if not exists public.recs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'film' check (kind in ('film', 'series')),
  title text not null check (length(title) between 1 and 120),
  year text not null default '' check (length(year) <= 9),
  genre text not null default '' check (length(genre) <= 40),
  note text not null default '' check (length(note) <= 600),
  author text not null default '' check (length(author) <= 40),
  links jsonb not null default '[]'::jsonb,
  by_owner boolean not null default false,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  owner uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table public.recs enable row level security;
drop policy if exists "approved recs are public" on public.recs;
drop policy if exists "guests suggest recs" on public.recs;
drop policy if exists "admin edits recs" on public.recs;
drop policy if exists "guests withdraw own pending recs" on public.recs;
create policy "approved recs are public" on public.recs for select using (status = 'approved' or owner = auth.uid() or public.is_admin());
create policy "guests suggest recs" on public.recs for insert to authenticated with check (owner = auth.uid());
create policy "admin edits recs" on public.recs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "guests withdraw own pending recs" on public.recs for delete to authenticated using (public.is_admin() or (owner = auth.uid() and status <> 'approved'));

-- Guard: guests always land in "pending", links must be http(s), pace 3 per 10 min and 10 per day.
create or replace function public.recs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare recent int; per_day int; l jsonb;
begin
  if jsonb_typeof(new.links) <> 'array' or jsonb_array_length(new.links) > 3 then raise exception 'bad_link'; end if;
  for l in select * from jsonb_array_elements(new.links) loop
    if coalesce(l ->> 'url', '') !~* '^https?://[^\s"''<>]+$' or length(l ->> 'url') > 500 or length(coalesce(l ->> 'label', '')) > 40 then raise exception 'bad_link'; end if;
  end loop;
  if public.is_admin() then
    if tg_op = 'INSERT' then new.by_owner := true; new.status := 'approved'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.status := 'pending'; new.by_owner := false; new.owner := auth.uid(); new.created_at := now();
    select count(*) into recent from public.recs where owner = auth.uid() and created_at > now() - interval '10 minutes';
    if recent >= 3 then raise exception 'slow_down'; end if;
    select count(*) into per_day from public.recs where owner = auth.uid() and created_at > now() - interval '1 day';
    if per_day >= 10 then raise exception 'daily_limit'; end if;
  end if;
  return new;
end $$;
drop trigger if exists recs_guard on public.recs;
create trigger recs_guard before insert or update on public.recs for each row execute function public.recs_guard();

create table if not exists public.rec_reports (
  rec_id uuid not null references public.recs(id) on delete cascade,
  reporter uuid not null default auth.uid(),
  reason text not null default '' check (length(reason) <= 200),
  created_at timestamptz not null default now(),
  primary key (rec_id, reporter)
);
alter table public.rec_reports enable row level security;
drop policy if exists "anyone signed in can report recs" on public.rec_reports;
drop policy if exists "admins read rec reports" on public.rec_reports;
drop policy if exists "admins clear rec reports" on public.rec_reports;
create policy "anyone signed in can report recs" on public.rec_reports for insert to authenticated with check (reporter = auth.uid());
create policy "admins read rec reports" on public.rec_reports for select to authenticated using (public.is_admin());
create policy "admins clear rec reports" on public.rec_reports for delete to authenticated using (public.is_admin());

-- Three reports send a guest's suggestion back to review. The owner's own picks stay up.
create or replace function public.recs_auto_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.rec_reports where rec_id = new.rec_id) >= 3 then
    update public.recs set status = 'pending' where id = new.rec_id and by_owner = false and status = 'approved';
  end if;
  return new;
end $$;
drop trigger if exists recs_auto_review on public.rec_reports;
create trigger recs_auto_review after insert on public.rec_reports for each row execute function public.recs_auto_review();

-- ============ starter content (demo, replace in the admin panel) ============
insert into public.prompts (text) select t from unnest(array[
  'Что тебя сегодня порадовало?', 'Оставь что-нибудь незнакомцу.', 'Нарисуй своё настроение.', 'То, что ты не смог(ла) сказать.', 'О чём ты сейчас думаешь?', 'Твой любимый цвет сегодня?', 'Нарисуй вид из своего окна.', 'Маленький комплимент тому, кто это прочитает.', 'Над чем ты сейчас работаешь?', 'Нарисуй существо, которое живёт в твоём столе.'
]) as t where not exists (select 1 from public.prompts);

-- demo shelf and portfolio (only inserted into empty tables; replace them from the site's studio mode)
insert into public.objects (id, sort, draft, data) select * from (values
  ('obj-pug', 10, false, '{"name": "Мопс Понедельник", "nick": "имеет мнение о твоём кернинге", "num": "001", "status": "soon", "price": "", "story": "Крошечная голова мопса в рюшевом воротнике — только что с принтера и ещё ждёт краски.\n\nОн хмурится на каждый бриф, каждую шрифтовую пару и каждый понедельник.", "height": "", "material": "Серый PLA, пока без покраски", "edition": "", "printTime": "", "photos": ["assets/objects/pug-1.jpg", "assets/objects/pug-2.jpg"], "colors": [], "demo": false, "createdAt": 1762977000000}'::jsonb),
  ('obj-bunbun', 20, false, '{"name": "Зайка", "nick": "самый мягкий критик в студии", "num": "002", "status": "available", "price": "3 900 ₽", "story": "Зайка слушает каждую идею, подняв оба уха, и ни разу не сказала «сделай поярче».\n\nНапечатана из матового PLA, отшлифована и раскрашена вручную, у каждой — румяные щёки.", "height": "9 см", "material": "PLA, акрил", "edition": "10 штук", "printTime": "7 ч", "photos": ["assets/objects/bunny-pink-1.jpg", "assets/objects/bunny-pink-2.jpg", "assets/objects/bunny-cobalt.jpg", "assets/objects/bunny-milk.jpg"], "colors": [{"name": "Розовый", "hex": "#ff9cc8", "photo": "assets/objects/bunny-pink-1.jpg"}, {"name": "Кобальт", "hex": "#244ee7", "photo": "assets/objects/bunny-cobalt.jpg"}, {"name": "Молочный", "hex": "#f6f3ec", "photo": "assets/objects/bunny-milk.jpg"}], "demo": true, "createdAt": 1762977000001}'::jsonb),
  ('obj-shroomie', 30, false, '{"name": "Грибочек", "nick": "лучше всего растёт в 2 ночи перед дедлайном", "num": "003", "status": "soldout", "price": "4 200 ₽", "story": "Маленький гриб с большой шляпой и тихим взглядом. Первая партия уже нашла хорошие дома.", "height": "8 см", "material": "PLA, акрил", "edition": "6 штук", "printTime": "5 ч", "photos": ["assets/objects/shroom-red-1.jpg", "assets/objects/shroom-red-2.jpg", "assets/objects/shroom-yellow.jpg"], "colors": [{"name": "Красная шляпка", "hex": "#f0332a", "photo": "assets/objects/shroom-red-1.jpg"}, {"name": "Жёлтая шляпка", "hex": "#ffc21a", "photo": "assets/objects/shroom-yellow.jpg"}], "demo": true, "createdAt": 1762977000002}'::jsonb),
  ('obj-ghostie', 40, false, '{"name": "Призрачок", "nick": "обитает в несохранённых файлах", "num": "004", "status": "available", "price": "2 900 ₽", "story": "Призрачок летает над столом и тихонько напоминает нажать «сохранить». Совсем не страшный и очень вежливый.", "height": "7 см", "material": "PLA, акрил", "edition": "12 штук", "printTime": "4 ч", "photos": ["assets/objects/ghost-1.jpg", "assets/objects/ghost-2.jpg"], "colors": [{"name": "Небесный", "hex": "#cfe2ff", "photo": ""}], "demo": true, "createdAt": 1762977000003}'::jsonb),
  ('obj-cubecat', 50, false, '{"name": "Кот-кубик", "nick": "идеально встаёт в любую сетку", "num": "005", "status": "soon", "price": "", "story": "Кот, который наконец поместился в коробку, потому что он сам коробка. Пока ещё на столе принтера — пробует новую матовую отделку.", "height": "6 см", "material": "PLA, акрил", "edition": "8 штук", "printTime": "", "photos": ["assets/objects/cat-cobalt-1.jpg", "assets/objects/cat-cobalt-2.jpg", "assets/objects/cat-milk.jpg"], "colors": [{"name": "Кобальт", "hex": "#244ee7", "photo": "assets/objects/cat-cobalt-2.jpg"}, {"name": "Молочный", "hex": "#f6f3ec", "photo": "assets/objects/cat-milk.jpg"}], "demo": true, "createdAt": 1762977000004}'::jsonb)
) as v(id, sort, draft, data) where not exists (select 1 from public.objects);
insert into public.works (id, sort, draft, data) select * from (values
  ('w-bigger', 10, false, '{"title": "Сделай крупнее", "category": "posters", "year": "2026", "summary": "Постер о самой популярной просьбе клиентов.", "body": "Три слова, четыре строки. Шрифт растёт, пока почти не падает с листа, — как любой логотип после третьего круга правок.\n\nРизография, A2, кобальт и жёлтый.", "images": ["assets/works/bigger-1.jpg", "assets/works/bigger-2.jpg"], "demo": true}'::jsonb),
  ('w-soft', 20, false, '{"title": "Мягкие объекты", "category": "3d", "year": "2026", "summary": "Маленькие существа, смоделированные через SDF.", "body": "Этюд для будущих фигурок: каждый персонаж собран из скруглённых коробок и капель, освещён как в фотостудии и потом напечатан.", "images": ["assets/works/soft-1.jpg", "assets/works/soft-2.jpg"], "demo": true}'::jsonb),
  ('w-zine', 30, false, '{"title": "Зин «Сетка» №3", "category": "graphic", "year": "2025", "summary": "Двенадцать страниц о колонках, полях и о том, как их ломать.", "body": "Маленький зин, сделанный на кухонном столе. Каждый разворот берёт одно правило вёрстки и играет с ним, пока оно не сломается.", "images": ["assets/works/zine-1.jpg", "assets/works/zine-2.jpg"], "demo": true}'::jsonb),
  ('w-weather', 40, false, '{"title": "Розовая погода", "category": "posters", "year": "2025", "summary": "Растровый прогноз на мягкий тёплый день.", "body": "Точки растра растут к центру, как солнце, которое никак не выберет свой цвет.", "images": ["assets/works/weather-1.jpg"], "demo": true}'::jsonb),
  ('w-sounds', 50, false, '{"title": "Звуки стола", "category": "personal", "year": "2025", "summary": "46 записей с моего стола, нарисованные одной линией.", "body": "Клавиатуры, кружки, ножницы и степлер — записывала неделю и превратила в столбики. Красные — это степлер.", "images": ["assets/works/sounds-1.jpg"], "demo": true}'::jsonb),
  ('w-coffee', 60, false, '{"title": "26 утр", "category": "random", "year": "2024", "summary": "Один лист бумаги под одной кружкой целый месяц.", "body": "Разное. Каждое утро кружка вставала на новое место.", "images": ["assets/works/coffee-1.jpg"], "demo": true}'::jsonb)
) as v(id, sort, draft, data) where not exists (select 1 from public.works);
