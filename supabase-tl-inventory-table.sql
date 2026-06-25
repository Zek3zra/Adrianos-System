-- Run this in Supabase SQL Editor before using tl-dashboard.html.
-- This table stores one row per product, branch, and PH date.
-- IDs are saved as text to avoid errors if your existing profiles/branches IDs are uuid, bigint, or text.

create extension if not exists pgcrypto;

create table if not exists public.daily_product_orders (
    id uuid primary key default gen_random_uuid(),
    report_date date not null,
    branch_key text not null,
    branch_id text,
    branch_name text not null default 'Unassigned Branch',
    team_leader_id text not null,
    team_leader_name text,
    product_key text not null,
    product_name text not null,
    product_variant text,
    category text not null,
    price numeric(10, 2),
    quantity integer not null default 0 check (quantity >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (report_date, branch_key, product_key)
);

create index if not exists daily_product_orders_report_date_idx
on public.daily_product_orders (report_date);

create index if not exists daily_product_orders_branch_key_idx
on public.daily_product_orders (branch_key);

create index if not exists daily_product_orders_team_leader_id_idx
on public.daily_product_orders (team_leader_id);

create or replace function public.set_daily_product_orders_updated_at()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

drop trigger if exists set_daily_product_orders_updated_at on public.daily_product_orders;

create trigger set_daily_product_orders_updated_at
before update on public.daily_product_orders
for each row
execute function public.set_daily_product_orders_updated_at();

-- Important:
-- If Row Level Security is ON for this table, create policies that allow your logged-in app to select, insert, update, and delete.
-- For your current simple username/password project, the easiest setup is to keep RLS disabled on this table.
