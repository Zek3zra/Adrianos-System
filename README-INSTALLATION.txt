ADRIANOS MOBILE-FIRST DAILY EXPENSES UPDATE
=============================================

WHAT CHANGED
- Daily Expenses is now a fixed button beside Logout in the Team Leader header.
- The old JavaScript-injected expense button near Product List was removed.
- Team Leader and Admin expense pages now use the uploaded dashboard coffee/cream UI.
- Mobile records use cards instead of wide tables.
- Summary cards use a compact 2-column phone layout.
- Inputs and buttons have larger touch targets.
- Team Leader Submit Today's Report stays visible near the bottom while entering values.
- Admin main dashboard includes an Expense Report shortcut and current-week expense summary.

FILES TO REPLACE
1. tl-dashboard.html
2. tl-dashboard.css
3. tl-dashboard.js
4. admin-dashboard.html
5. admin-dashboard.css
6. admin-dashboard.js
7. admin-product-report.js

NEW/EXPENSE PAGE FILES
8. tl-expenses.html
9. tl-expenses.css
10. tl-expenses.js
11. admin-expenses.html
12. admin-expenses.css
13. admin-expenses.js

DATABASE
- Run supabase-daily-expenses.sql once if it has not already been run.
- If the tables already exist from the previous expense update, do not rerun unless needed.

BEHAVIOR
- Expense amounts are daily and date-based in Asia/Manila.
- At 12:00 AM PH time, the new date loads blank values while saved expense names remain.
- Re-submitting on the same day updates that day's values.
- Weekly reports and PDFs cover Monday through Sunday.
- Blank/zero values are not included in exports.

DEPLOYMENT
- Upload all files in this package to the same folder as supabaseClient.js and logo.png.
- Hard-refresh the browser after deployment (Ctrl+F5 on desktop or clear site cache on mobile).
