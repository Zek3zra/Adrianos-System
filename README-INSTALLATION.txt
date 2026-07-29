ADRIANO'S PANINDA + BACKDATED EXPENSE UPDATE
================================================

FILES TO REPLACE
----------------
1. tl-expenses.html
2. tl-expenses.css
3. tl-expenses.js
4. admin-expenses.html
5. admin-expenses.css
6. admin-expenses.js

DATABASE FILE TO RUN
--------------------
7. supabase-paninda-daily-financials.sql

INSTALLATION ORDER
------------------
1. Open Supabase > SQL Editor.
2. Run supabase-paninda-daily-financials.sql once.
3. Replace the six website files listed above.
4. Redeploy the website.
5. Hard-refresh the mobile browser.

KEY BEHAVIOR
------------
- The Team Leader can choose today or an earlier date for expense entry.
- Future dates are blocked.
- General Expenses are deducted in:
  (Sales + Bilin sa Paninda) - General Expenses
- Paninda item amounts are included in total expense reports but are NOT
  deducted from the money-left formula.
- Paninda is a permanent section. Team Leaders add the purchased item names
  inside that section.
- Receipts remain separate and use the actual Philippine upload date.
- Searching now re-renders the matching expense names and shows the search
  term in the result count/empty state.
