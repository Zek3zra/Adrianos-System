ADRIANO'S RECEIPTS, INVENTORY CATEGORIES, AND CASH ADVANCE UPDATE
================================================================

1. RUN THE SQL FIRST
--------------------
Open Supabase > SQL Editor and run:
    supabase-receipts-cash-advances.sql

This creates:
- expense_receipts table
- weekly_cash_advances table
- expense-receipts Storage bucket and required policies

2. REPLACE EXISTING FILES
-------------------------
Replace these files in the project:
- tl-dashboard.html
- tl-dashboard.css
- tl-dashboard.js
- tl-expenses.html
- tl-expenses.css
- tl-expenses.js
- admin-dashboard.html
- admin-dashboard.css
- admin-dashboard.js
- admin-expenses.html
- admin-expenses.css
- admin-expenses.js
- admin-product-report.js

The existing admin-product-report.html and admin-product-report.css do not require functional changes,
but matching copies are included in this package for convenience.

3. ADD NEW FILES
----------------
Upload these new pages beside the other dashboard files:
- tl-cash-advance.html
- tl-cash-advance.css
- tl-cash-advance.js
- admin-cash-advances.html
- admin-cash-advances.css
- admin-cash-advances.js

4. DEPLOY AND REFRESH
---------------------
Deploy to Vercel and perform a hard refresh on each phone/browser.

FEATURE BEHAVIOR
----------------
EXPENSE SEARCH
- Team Leaders can search retained expense names.
- The weekly expense details and top-expense list also follow the search.
- Hidden expense inputs are still preserved when submitting.

RECEIPTS
- Receipt upload is separate from expense names/categories.
- The Team Leader enters a receipt name and selects/takes one image.
- Images are compressed before upload for mobile use.
- Receipts are stored by branch and date and shown in the selected week.
- Admins can view receipt thumbnails and open full images in Expense Reports.

INVENTORY CATEGORY CHANGES
- Shawarma Wrap -> Starters
- Lasagna -> Starters
- Bun Intended -> Burgers
- More To Enjoy -> Drinks Add Ons/Other Drinks
- New Pastries category:
  Biscoff Cheesecake 190
  Blueberry Cheesecake 190
  Choco Caramel 180
  Cookies 75
  Cream Cheese Flan 180
  Garlic Cheesy Bun 80
  Muffins 70

Old product keys are preserved for renamed/moved products so historical product totals do not split.

CASH ADVANCES
- Team Leaders see staff assigned to their branch.
- Tap a staff card/name, enter the weekly amount, and submit.
- Re-submitting updates the same employee/week record.
- Blank or zero removes that employee's record for the selected week.
- Every Monday starts a blank form automatically; previous weeks remain stored.
- Admin Dashboard shows the current-week cash advance summary.
- Admin Cash Advance Reports supports week, branch, search, summary, and PDF export.

SECURITY NOTE
-------------
The current project uses a custom browser session and anon Supabase access. The included Storage
policies match that design. For stronger security later, migrate login to Supabase Auth and add RLS
policies restricted by authenticated user and branch.
