ADRIANO'S EXPENSE UPDATE
=========================

INSTALLATION ORDER

1. Open Supabase > SQL Editor.
2. Run:
   supabase-others-taken-food.sql
3. Replace these deployed files:
   - tl-expenses.html
   - tl-expenses.css
   - tl-expenses.js
   - admin-expenses.html
   - admin-expenses.css
   - admin-expenses.js
4. Redeploy the project.
5. Hard refresh the mobile browser or clear the installed PWA/site cache.

WHAT CHANGED

TEAM LEADER
- Added named Other Funds with decimal values.
- Decimal entries such as 109.23 are accepted.
- Formula:
  (Sales + Bilin sa Paninda + Other Funds) - General Expenses
- Paninda remains logged but excluded from the deduction.
- Added date-specific Taken Food Logs:
  person/group name + menu items as text.
- Taken Food Logs do not affect cash or inventory.
- Past dates reload their own Other Funds and Taken Food Logs for editing.
- Weekly PDF includes Other Funds and Taken Food Logs.

ADMIN
- Added Other Funds total and records.
- Added Taken Food Logs total and detailed review.
- Daily accordion shows cash flow, Other Funds, expenses, and food logs by branch.
- Unified search includes expenses, Other Funds, person/group names, and menu items.
- Weekly PDF includes the new records.

DATABASE TABLES ADDED
- daily_other_funds
- taken_food_logs

IMPORTANT
The existing Paninda/daily financial migration must already be installed because
these pages continue to use daily_branch_financials and expense_category.
