-- Adriano's Expense Receipts and Weekly Cash Advances
-- Run this once in the Supabase SQL Editor before deploying the updated files.
-- This migration matches the project's current custom browser-session / anon-access design.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Reusable updated_at trigger function.
CREATE OR REPLACE FUNCTION public.touch_adrianos_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- Core expense tables are included for a self-contained, idempotent installation.
CREATE TABLE IF NOT EXISTS public.expense_names (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    branch_key text NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    expense_name text NOT NULL CHECK (char_length(trim(expense_name)) BETWEEN 1 AND 120),
    expense_key text NOT NULL,
    created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_by_name text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
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
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT daily_expenses_date_branch_expense_unique UNIQUE (expense_date, branch_key, expense_id)
);

CREATE INDEX IF NOT EXISTS expense_names_branch_active_idx ON public.expense_names (branch_key, is_active, expense_name);
CREATE INDEX IF NOT EXISTS daily_expenses_branch_date_idx ON public.daily_expenses (branch_key, expense_date);

DROP TRIGGER IF EXISTS touch_expense_names_updated_at ON public.expense_names;
CREATE TRIGGER touch_expense_names_updated_at BEFORE UPDATE ON public.expense_names
FOR EACH ROW EXECUTE FUNCTION public.touch_adrianos_updated_at();

DROP TRIGGER IF EXISTS touch_daily_expenses_updated_at ON public.daily_expenses;
CREATE TRIGGER touch_daily_expenses_updated_at BEFORE UPDATE ON public.daily_expenses
FOR EACH ROW EXECUTE FUNCTION public.touch_adrianos_updated_at();

-- Standalone receipt images. A receipt is not tied to an individual expense name/category.
CREATE TABLE IF NOT EXISTS public.expense_receipts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_date date NOT NULL,
    branch_key text NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    branch_name text NOT NULL DEFAULT 'Unassigned Branch',
    receipt_name text NOT NULL CHECK (char_length(trim(receipt_name)) BETWEEN 1 AND 120),
    receipt_url text NOT NULL,
    storage_path text NOT NULL UNIQUE,
    team_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_leader_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS expense_receipts_branch_date_idx
    ON public.expense_receipts (branch_key, expense_date DESC);

DROP TRIGGER IF EXISTS touch_expense_receipts_updated_at ON public.expense_receipts;
CREATE TRIGGER touch_expense_receipts_updated_at
BEFORE UPDATE ON public.expense_receipts
FOR EACH ROW EXECUTE FUNCTION public.touch_adrianos_updated_at();

-- One cash-advance record per employee, branch, and Monday-start week.
CREATE TABLE IF NOT EXISTS public.weekly_cash_advances (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    week_start date NOT NULL,
    branch_key text NOT NULL,
    branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
    branch_name text NOT NULL DEFAULT 'Unassigned Branch',
    employee_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    employee_name text NOT NULL,
    amount numeric(12, 2) NOT NULL CHECK (amount > 0),
    team_leader_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    team_leader_name text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT weekly_cash_advances_week_branch_employee_unique
        UNIQUE (week_start, branch_key, employee_id)
);

CREATE INDEX IF NOT EXISTS weekly_cash_advances_week_branch_idx
    ON public.weekly_cash_advances (week_start DESC, branch_key);

CREATE INDEX IF NOT EXISTS weekly_cash_advances_employee_idx
    ON public.weekly_cash_advances (employee_id, week_start DESC);

DROP TRIGGER IF EXISTS touch_weekly_cash_advances_updated_at ON public.weekly_cash_advances;
CREATE TRIGGER touch_weekly_cash_advances_updated_at
BEFORE UPDATE ON public.weekly_cash_advances
FOR EACH ROW EXECUTE FUNCTION public.touch_adrianos_updated_at();

-- Public receipt-image bucket for the current custom-session architecture.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'expense-receipts',
    'expense-receipts',
    true,
    12582912,
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Adrianos receipt public read" ON storage.objects;
CREATE POLICY "Adrianos receipt public read"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "Adrianos receipt upload" ON storage.objects;
CREATE POLICY "Adrianos receipt upload"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "Adrianos receipt update" ON storage.objects;
CREATE POLICY "Adrianos receipt update"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'expense-receipts')
WITH CHECK (bucket_id = 'expense-receipts');

DROP POLICY IF EXISTS "Adrianos receipt delete" ON storage.objects;
CREATE POLICY "Adrianos receipt delete"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'expense-receipts');

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.expense_names, public.daily_expenses, public.expense_receipts, public.weekly_cash_advances
TO anon, authenticated;

COMMENT ON TABLE public.expense_receipts IS
'Standalone receipt images uploaded by Team Leaders. Receipts are named and dated but are not assigned to individual expense categories.';

COMMENT ON TABLE public.weekly_cash_advances IS
'One positive cash advance total per employee, branch, and Monday-start week. A new week appears blank while historical weeks remain stored.';

NOTIFY pgrst, 'reload schema';
