-- Adrianos Paninda + Backdated Daily Expense + Daily Cash-Flow Migration
-- Run this once in Supabase SQL Editor.
-- This migration preserves all existing expense records.

BEGIN;

-- 1. Add expense categories.
ALTER TABLE public.expense_names
    ADD COLUMN IF NOT EXISTS expense_category text NOT NULL DEFAULT 'general';

ALTER TABLE public.daily_expenses
    ADD COLUMN IF NOT EXISTS expense_category text NOT NULL DEFAULT 'general';

UPDATE public.expense_names
SET expense_category = 'general'
WHERE expense_category IS NULL
   OR expense_category NOT IN ('general', 'paninda');

UPDATE public.daily_expenses
SET expense_category = 'general'
WHERE expense_category IS NULL
   OR expense_category NOT IN ('general', 'paninda');

-- Copy the template category to existing daily rows when possible.
UPDATE public.daily_expenses AS daily
SET expense_category = names.expense_category
FROM public.expense_names AS names
WHERE daily.expense_id = names.id
  AND names.expense_category IN ('general', 'paninda');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'expense_names_category_check'
          AND conrelid = 'public.expense_names'::regclass
    ) THEN
        ALTER TABLE public.expense_names
            ADD CONSTRAINT expense_names_category_check
            CHECK (expense_category IN ('general', 'paninda'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'daily_expenses_category_check'
          AND conrelid = 'public.daily_expenses'::regclass
    ) THEN
        ALTER TABLE public.daily_expenses
            ADD CONSTRAINT daily_expenses_category_check
            CHECK (expense_category IN ('general', 'paninda'));
    END IF;
END $$;

-- 2. Make current browser upserts reliable.
-- Keep the newest row if old duplicates exist.
DELETE FROM public.daily_expenses AS older
USING public.daily_expenses AS newer
WHERE older.expense_date = newer.expense_date
  AND older.branch_key = newer.branch_key
  AND older.expense_id = newer.expense_id
  AND (
        older.updated_at < newer.updated_at
        OR (older.updated_at = newer.updated_at AND older.id::text < newer.id::text)
      );

CREATE UNIQUE INDEX IF NOT EXISTS daily_expenses_date_branch_expense_uidx
    ON public.daily_expenses (expense_date, branch_key, expense_id);

CREATE UNIQUE INDEX IF NOT EXISTS expense_names_branch_key_expense_key_uidx
    ON public.expense_names (branch_key, expense_key);

CREATE INDEX IF NOT EXISTS expense_names_branch_category_active_idx
    ON public.expense_names (branch_key, expense_category, is_active);

CREATE INDEX IF NOT EXISTS daily_expenses_branch_date_category_idx
    ON public.daily_expenses (branch_key, expense_date, expense_category);

-- 3. Store Sales and Bilin sa Paninda separately for every branch and date.
CREATE TABLE IF NOT EXISTS public.daily_branch_financials (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    financial_date date NOT NULL,
    branch_key text NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    branch_name text NOT NULL DEFAULT 'Unassigned Branch',
    sales numeric(14,2) NOT NULL DEFAULT 0 CHECK (sales >= 0),
    bilin_sa_paninda numeric(14,2) NOT NULL DEFAULT 0 CHECK (bilin_sa_paninda >= 0),
    team_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_leader_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Remove duplicates before adding the unique index if the migration was partly run before.
DELETE FROM public.daily_branch_financials AS older
USING public.daily_branch_financials AS newer
WHERE older.financial_date = newer.financial_date
  AND older.branch_key = newer.branch_key
  AND (
        older.updated_at < newer.updated_at
        OR (older.updated_at = newer.updated_at AND older.id::text < newer.id::text)
      );

CREATE UNIQUE INDEX IF NOT EXISTS daily_branch_financials_date_branch_uidx
    ON public.daily_branch_financials (financial_date, branch_key);

CREATE INDEX IF NOT EXISTS daily_branch_financials_branch_date_idx
    ON public.daily_branch_financials (branch_key, financial_date);

-- 4. Browser access for the project's current custom session setup.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON public.expense_names,
       public.daily_expenses,
       public.daily_branch_financials
    TO anon, authenticated;

COMMIT;

-- Refresh the Supabase/PostgREST schema cache.
NOTIFY pgrst, 'reload schema';
