create extension if not exists pgcrypto;

create table if not exists public.leaderboard (
  id uuid primary key default gen_random_uuid(),
  player_name text not null check (char_length(player_name) between 1 and 16),
  score numeric not null,
  rarest_word_found text not null,
  client_id uuid not null,
  created_at timestamptz not null default now()
);

alter table public.leaderboard enable row level security;

create policy "anonymous players can submit scores"
  on public.leaderboard for insert to anon
  with check (char_length(player_name) between 1 and 16 and score >= 0);

create policy "anonymous players can read scores"
  on public.leaderboard for select to anon
  using (true);

create or replace function public.get_leaderboard(
  requested_client_id uuid,
  result_limit integer default 100
)
returns table (
  rank bigint,
  player_name text,
  score numeric,
  rarest_word_found text,
  is_me boolean
)
language sql
security definer
set search_path = public
as $$
  with ranked as (
    select
      row_number() over (order by l.score desc, l.created_at asc, l.id asc) as rank,
      l.player_name,
      l.score,
      l.rarest_word_found,
      l.client_id = requested_client_id as is_me
    from public.leaderboard l
  )
  select r.rank, r.player_name, r.score, r.rarest_word_found, r.is_me
  from ranked r
  where r.rank <= greatest(result_limit, 1) or r.is_me
  order by r.rank;
$$;

grant execute on function public.get_leaderboard(uuid, integer) to anon;
