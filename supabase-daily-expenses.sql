-- Adriano's Daily Expense Logging with Weekly Reporting
-- Run once in Supabase SQL Editor before deploying the new expense pages.

CREATE TABLE IF NOT EXISTS public.expense_names (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_key text NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    expense_name text NOT NULL CHECK (char_length(trim(expense_name)) BETWEEN 1 AND 120),
    expense_key text NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by_name text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT expense_names_branch_key_name_unique UNIQUE (branch_key, expense_key)
);

CREATE TABLE IF NOT EXISTS public.daily_expenses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date date NOT NULL,
    branch_key text NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    branch_name text NOT NULL DEFAULT 'Unassigned Branch',
    expense_id uuid NOT NULL REFERENCES public.expense_names(id) ON DELETE RESTRICT,
    expense_name text NOT NULL,
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    team_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_leader_name text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT daily_expenses_date_branch_expense_unique
        UNIQUE (expense_date, branch_key, expense_id)
);

CREATE INDEX IF NOT EXISTS expense_names_branch_active_idx
    ON public.expense_names (branch_key, is_active, expense_name);

CREATE INDEX IF NOT EXISTS daily_expenses_branch_date_idx
    ON public.daily_expenses (branch_key, expense_date);

CREATE INDEX IF NOT EXISTS daily_expenses_expense_id_idx
    ON public.daily_expenses (expense_id);

CREATE OR REPLACE FUNCTION public.touch_expense_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS touch_expense_names_updated_at ON public.expense_names;
CREATE TRIGGER touch_expense_names_updated_at
BEFORE UPDATE ON public.expense_names
FOR EACH ROW EXECUTE FUNCTION public.touch_expense_updated_at();

DROP TRIGGER IF EXISTS touch_daily_expenses_updated_at ON public.daily_expenses;
CREATE TRIGGER touch_daily_expenses_updated_at
BEFORE UPDATE ON public.daily_expenses
FOR EACH ROW EXECUTE FUNCTION public.touch_expense_updated_at();

-- This project currently uses a custom browser session instead of Supabase Auth.
-- These grants match that architecture. Consider moving to Supabase Auth + RLS later.
GRANT SELECT, INSERT, UPDATE, DELETE
ON public.expense_names, public.daily_expenses
TO anon, authenticated;

COMMENT ON TABLE public.expense_names IS
'Persistent branch-level expense names. Set is_active=false to hide a name while preserving all historical daily expense records.';

COMMENT ON TABLE public.daily_expenses IS
'One running total per date, branch, and retained expense name. Re-submitting on the same date updates the same record. Weekly reports aggregate Monday through Sunday.';

NOTIFY pgrst, 'reload schema';
