-- ADRIANO'S EXPENSE UPDATE
-- Adds named Other Funds and non-cash Taken Food Logs.
-- Run this after the existing Paninda / daily_branch_financials migration.

create extension if not exists pgcrypto;

create table if not exists public.daily_other_funds (
    id uuid primary key default gen_random_uuid(),
    fund_date date not null,
    branch_key text not null,
    branch_id uuid references public.branches(id) on delete set null,
    branch_name text not null default 'Unassigned Branch',
    fund_name text not null
        check (
            char_length(trim(fund_name)) >= 1
            and char_length(trim(fund_name)) <= 120
        ),
    amount numeric(14,2) not null
        check (amount > 0),
    team_leader_id uuid references public.profiles(id) on delete set null,
    team_leader_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists daily_other_funds_date_branch_idx
    on public.daily_other_funds (fund_date, branch_key);

create index if not exists daily_other_funds_branch_name_idx
    on public.daily_other_funds (branch_key, fund_name);

create table if not exists public.taken_food_logs (
    id uuid primary key default gen_random_uuid(),
    log_date date not null,
    branch_key text not null,
    branch_id uuid references public.branches(id) on delete set null,
    branch_name text not null default 'Unassigned Branch',
    person_group_name text not null
        check (
            char_length(trim(person_group_name)) >= 1
            and char_length(trim(person_group_name)) <= 160
        ),
    menu_items text not null
        check (
            char_length(trim(menu_items)) >= 1
            and char_length(trim(menu_items)) <= 1200
        ),
    team_leader_id uuid references public.profiles(id) on delete set null,
    team_leader_name text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists taken_food_logs_date_branch_idx
    on public.taken_food_logs (log_date, branch_key);

create index if not exists taken_food_logs_person_idx
    on public.taken_food_logs (branch_key, person_group_name);

create or replace function public.set_expense_record_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists set_daily_other_funds_updated_at
    on public.daily_other_funds;

create trigger set_daily_other_funds_updated_at
before update on public.daily_other_funds
for each row execute function public.set_expense_record_updated_at();

drop trigger if exists set_taken_food_logs_updated_at
    on public.taken_food_logs;

create trigger set_taken_food_logs_updated_at
before update on public.taken_food_logs
for each row execute function public.set_expense_record_updated_at();

grant select, insert, update, delete
    on public.daily_other_funds
    to anon, authenticated;

grant select, insert, update, delete
    on public.taken_food_logs
    to anon, authenticated;

notify pgrst, 'reload schema';
