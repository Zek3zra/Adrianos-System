import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const DAILY_EXPENSES_TABLE = 'daily_expenses';
const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

const state = {
    branches: [],
    rows: [],
    selectedWeekStart: '',
    selectedBranchKey: 'all',
    search: '',
    busy: false,
    selectedDailyDate: ''
};

const elements = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    bindElements();
    protectAdminPage();
    bindEvents();

    state.selectedWeekStart = getPHWeekStartKey();
    elements.weekPicker.value = state.selectedWeekStart;
    updateWeekRangeText();

    try {
        await fetchBranches();
        await loadExpenseReport();
    } catch (error) {
        console.error('Admin expense page failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        elements.pageLoader.classList.add('hidden');
    }
}

function bindElements() {
    const ids = [
        'pageLoader', 'backBtn', 'logoutBtn', 'weekPicker', 'weekRangeText', 'branchSelect',
        'refreshBtn', 'exportPdfBtn', 'weeklyTotalText', 'weeklyEntriesText', 'todayTotalText',
        'todayDateText', 'branchCountText', 'topExpenseText', 'topExpenseAmountText',
        'dailyBreakdownList', 'expenseBreakdownList', 'branchBreakdownList', 'searchInput',
        'recordsBody', 'recordsCards', 'recordsCountText', 'reportScopeText', 'heroWeekText',
        'mobileWeeklyTotalText', 'mobileExportPdfBtn', 'toast'
    ];
    ids.forEach(id => { elements[id] = document.getElementById(id); });
}

function bindEvents() {
    elements.backBtn.addEventListener('click', () => window.location.assign('admin-dashboard.html'));
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', async () => {
        closeDailyBreakdown();
        await loadExpenseReport();
    });
    elements.exportPdfBtn.addEventListener('click', exportWeeklyPdf);
    elements.mobileExportPdfBtn?.addEventListener('click', exportWeeklyPdf);

    elements.weekPicker.addEventListener('change', async () => {
        closeDailyBreakdown();
        state.selectedWeekStart = getPHWeekStartKey(elements.weekPicker.value || getPHDateKey());
        elements.weekPicker.value = state.selectedWeekStart;
        updateWeekRangeText();
        await loadExpenseReport();
    });

    elements.branchSelect.addEventListener('change', async () => {
        closeDailyBreakdown();
        state.selectedBranchKey = elements.branchSelect.value || 'all';
        await loadExpenseReport();
    });

    elements.dailyBreakdownList.addEventListener('click', event => {
        const button = event.target.closest('.daily-breakdown-button[data-date]');
        if (!button) return;

        event.preventDefault();
        toggleDailyBreakdown(button.dataset.date);
    });

    elements.searchInput.addEventListener('input', event => {
        state.search = event.target.value.trim().toLowerCase();
        renderRecordsTable();
    });
}

function protectAdminPage() {
    const isLoggedIn = sessionStorage.getItem('adrianosAdminAuth') === 'true';
    const loginTime = Number(sessionStorage.getItem('adrianosAdminLoginTime') || 0);
    const expired = !loginTime || Date.now() - loginTime > ADMIN_SESSION_MAX_AGE;

    if (!isLoggedIn || expired) {
        clearAdminSession();
        window.location.replace('tl-login.html');
        throw new Error('Admin session expired.');
    }
}

async function fetchBranches() {
    const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('name', { ascending: true });

    if (error) throw error;
    state.branches = data || [];
    elements.branchSelect.innerHTML = '<option value="all">All Branches</option>' + state.branches.map(branch => (
        `<option value="branch_${escapeHTML(branch.id)}">${escapeHTML(branch.name)}</option>`
    )).join('');
}

async function loadExpenseReport() {
    setBusy(true);
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);

    try {
        let query = supabase
            .from(DAILY_EXPENSES_TABLE)
            .select('*')
            .gte('expense_date', state.selectedWeekStart)
            .lte('expense_date', endDate)
            .order('expense_date', { ascending: true })
            .order('branch_name', { ascending: true })
            .order('expense_name', { ascending: true });

        if (state.selectedBranchKey !== 'all') {
            query = query.eq('branch_key', state.selectedBranchKey);
        }

        const { data, error } = await query;
        if (error) throw error;

        state.rows = (data || []).filter(row => getAmount(row) > 0);
        renderAll();
    } catch (error) {
        console.error('Admin expense report load failed:', error);
        state.rows = [];
        renderAll();
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

function renderAll() {
    renderSummaryCards();
    renderBreakdowns();
    renderRecordsTable();
    updateWeekRangeText();
}

function renderSummaryCards() {
    const weeklyTotal = state.rows.reduce((sum, row) => sum + getAmount(row), 0);
    const todayKey = getPHDateKey();
    const todayRows = state.rows.filter(row => row.expense_date === todayKey);
    const todayTotal = todayRows.reduce((sum, row) => sum + getAmount(row), 0);
    const branchCount = new Set(state.rows.map(row => row.branch_key || row.branch_name)).size;
    const expenseTotals = buildGroupedTotals(state.rows, row => row.expense_id || row.expense_name, row => row.expense_name || 'Unnamed Expense');
    const topExpense = expenseTotals[0];

    elements.weeklyTotalText.textContent = formatPeso(weeklyTotal);
    elements.weeklyEntriesText.textContent = `${state.rows.length} entr${state.rows.length === 1 ? 'y' : 'ies'}`;
    elements.todayTotalText.textContent = formatPeso(todayTotal);
    elements.todayDateText.textContent = formatDateLong(todayKey);
    elements.branchCountText.textContent = String(branchCount);
    elements.topExpenseText.textContent = topExpense?.label || 'None';
    elements.topExpenseAmountText.textContent = formatPeso(topExpense?.total || 0);
    if (elements.mobileWeeklyTotalText) elements.mobileWeeklyTotalText.textContent = formatPeso(weeklyTotal);
}

function renderBreakdowns() {
    const dailyItems = [];
    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        const rows = state.rows.filter(row => row.expense_date === date);
        dailyItems.push({ date, label: formatDateWithWeekday(date), total: rows.reduce((sum, row) => sum + getAmount(row), 0), count: rows.length });
    }

    const expenseItems = buildGroupedTotals(state.rows, row => row.expense_id || row.expense_name, row => row.expense_name || 'Unnamed Expense');
    const branchItems = buildGroupedTotals(state.rows, row => row.branch_key || row.branch_name, row => row.branch_name || 'Unassigned Branch');

    elements.dailyBreakdownList.innerHTML = renderDailyRankItems(dailyItems);
    elements.expenseBreakdownList.innerHTML = renderRankItems(expenseItems, 'daily entries');
    elements.branchBreakdownList.innerHTML = renderRankItems(branchItems, 'entries');
}

function buildGroupedTotals(rows, keyGetter, labelGetter) {
    const map = new Map();
    rows.forEach(row => {
        const key = keyGetter(row);
        if (!map.has(key)) map.set(key, { label: labelGetter(row), total: 0, count: 0 });
        const item = map.get(key);
        item.total += getAmount(row);
        item.count += 1;
    });
    return [...map.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function renderRankItems(items, countLabel) {
    if (!items.length) return '<div class="empty-state">No positive expense values for this selection.</div>';
    return items.map(item => `
        <div class="rank-row">
            <div><strong>${escapeHTML(item.label)}</strong><br><span>${item.count} ${escapeHTML(countLabel)}</span></div>
            <strong>${escapeHTML(formatPeso(item.total))}</strong>
        </div>
    `).join('');
}

function renderDailyRankItems(items) {
    return items.map(item => {
        const isOpen = state.selectedDailyDate === item.date;
        const detailId = `daily-expense-detail-${item.date}`;

        return `
            <div class="daily-accordion-item ${isOpen ? 'is-open' : ''}">
                <button
                    type="button"
                    class="rank-row daily-breakdown-button"
                    data-date="${escapeHTML(item.date)}"
                    aria-expanded="${isOpen ? 'true' : 'false'}"
                    aria-controls="${escapeHTML(detailId)}"
                    aria-label="${isOpen ? 'Hide' : 'View'} expense breakdown for ${escapeHTML(item.label)}"
                >
                    <div>
                        <strong>${escapeHTML(item.label)}</strong><br>
                        <span>${item.count} entr${item.count === 1 ? 'y' : 'ies'} • ${isOpen ? 'Tap to close' : 'Tap to view breakdown'}</span>
                    </div>
                    <div class="daily-rank-value">
                        <strong>${escapeHTML(formatPeso(item.total))}</strong>
                        <span class="daily-chevron" aria-hidden="true">⌄</span>
                    </div>
                </button>
                <div id="${escapeHTML(detailId)}" class="daily-inline-detail ${isOpen ? '' : 'hidden'}">
                    ${isOpen ? renderInlineDailyBreakdown(item.date) : ''}
                </div>
            </div>
        `;
    }).join('');
}

function toggleDailyBreakdown(dateKey) {
    if (!dateKey) return;

    state.selectedDailyDate = state.selectedDailyDate === dateKey ? '' : dateKey;
    renderBreakdowns();

    if (!state.selectedDailyDate) return;

    window.requestAnimationFrame(() => {
        const selectedButton = elements.dailyBreakdownList.querySelector(
            `.daily-breakdown-button[data-date="${CSS.escape(state.selectedDailyDate)}"]`
        );
        selectedButton?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
}

function renderInlineDailyBreakdown(dateKey) {
    const rows = state.rows
        .filter(row => row.expense_date === dateKey)
        .sort((a, b) =>
            String(a.branch_name || '').localeCompare(String(b.branch_name || '')) ||
            String(a.expense_name || '').localeCompare(String(b.expense_name || ''))
        );

    if (!rows.length) {
        return `
            <div class="daily-inline-empty">
                <strong>No expenses logged.</strong>
                <span>This date has no positive expense values for the selected branch filter.</span>
            </div>
        `;
    }

    const groups = buildDailyBranchGroups(rows);
    const total = rows.reduce((sum, row) => sum + getAmount(row), 0);

    return `
        <div class="daily-inline-summary">
            <div>
                <span>Daily Total</span>
                <strong>${escapeHTML(formatPeso(total))}</strong>
            </div>
            <div>
                <span>Branches</span>
                <strong>${groups.length}</strong>
            </div>
            <div>
                <span>Entries</span>
                <strong>${rows.length}</strong>
            </div>
        </div>

        <div class="daily-inline-branches">
            ${groups.map(group => `
                <section class="daily-inline-branch-card">
                    <header>
                        <div>
                            <span>Branch</span>
                            <strong>${escapeHTML(group.branchName)}</strong>
                        </div>
                        <strong>${escapeHTML(formatPeso(group.total))}</strong>
                    </header>

                    <div class="daily-inline-expense-list">
                        ${group.rows.map(row => `
                            <article class="daily-inline-expense-row">
                                <div>
                                    <strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong>
                                    <span>Submitted by ${escapeHTML(row.team_leader_name || 'Team Leader')}</span>
                                    <small>Updated ${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</small>
                                </div>
                                <strong>${escapeHTML(formatPeso(getAmount(row)))}</strong>
                            </article>
                        `).join('')}
                    </div>
                </section>
            `).join('')}
        </div>
    `;
}

function buildDailyBranchGroups(rows) {
    const map = new Map();

    rows.forEach(row => {
        const key = row.branch_key || row.branch_name || 'unassigned';

        if (!map.has(key)) {
            map.set(key, {
                branchName: row.branch_name || 'Unassigned Branch',
                total: 0,
                rows: []
            });
        }

        const group = map.get(key);
        group.total += getAmount(row);
        group.rows.push(row);
    });

    return [...map.values()].sort((a, b) =>
        b.total - a.total || a.branchName.localeCompare(b.branchName)
    );
}

function closeDailyBreakdown() {
    state.selectedDailyDate = '';
}

function renderRecordsTable() {
    const rows = [...state.rows]
        .filter(row => {
            if (!state.search) return true;
            const text = `${row.expense_date || ''} ${row.branch_name || ''} ${row.expense_name || ''} ${row.team_leader_name || ''} ${row.amount || ''}`.toLowerCase();
            return text.includes(state.search);
        })
        .sort((a, b) => String(b.expense_date).localeCompare(String(a.expense_date)) || String(a.branch_name).localeCompare(String(b.branch_name)) || String(a.expense_name).localeCompare(String(b.expense_name)));

    if (elements.recordsCountText) {
        elements.recordsCountText.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} shown`;
    }

    elements.recordsBody.innerHTML = rows.length
        ? rows.map(row => `
            <tr>
                <td>${escapeHTML(formatDateWithWeekday(row.expense_date))}</td>
                <td><strong>${escapeHTML(row.branch_name || 'Unassigned Branch')}</strong></td>
                <td>${escapeHTML(row.expense_name || 'Unnamed Expense')}</td>
                <td>${escapeHTML(formatPeso(getAmount(row)))}</td>
                <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="6" class="table-empty">No matching positive-value expense records.</td></tr>';


    if (elements.recordsCards) {
        elements.recordsCards.innerHTML = rows.length
            ? rows.map(row => `
                <article class="mobile-record-card">
                    <span class="record-branch">${escapeHTML(row.branch_name || 'Unassigned Branch')}</span>
                    <div class="mobile-record-head">
                        <div><strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong></div>
                        <div class="mobile-record-amount">${escapeHTML(formatPeso(getAmount(row)))}</div>
                    </div>
                    <div class="mobile-record-meta">
                        <span>${escapeHTML(formatDateWithWeekday(row.expense_date))}</span>
                        <span>Submitted by ${escapeHTML(row.team_leader_name || 'Team Leader')}</span>
                        <span>Updated ${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</span>
                    </div>
                </article>
            `).join('')
            : '<div class="empty-state">No matching positive-value expense records.</div>';
    }
}

function exportWeeklyPdf() {
    if (!state.rows.length) {
        showToast('There are no positive expense values to export for this week.', 'error');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        showToast('The PDF library is not ready. Check your internet connection and reload.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        showToast('The PDF table library is not ready. Reload the page and try again.', 'error');
        return;
    }

    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const total = state.rows.reduce((sum, row) => sum + getAmount(row), 0);
    const branchLabel = elements.branchSelect.options[elements.branchSelect.selectedIndex]?.textContent || 'All Branches';
    const dailyItems = [];
    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        const rows = state.rows.filter(row => row.expense_date === date);
        dailyItems.push({ date, count: rows.length, total: rows.reduce((sum, row) => sum + getAmount(row), 0) });
    }

    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setTextColor(44, 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("ADRIANO'S ADMIN WEEKLY EXPENSE REPORT", 148.5, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(endDate)} | ${branchLabel}`, 148.5, 19, { align: 'center' });
    doc.text(`Generated ${formatPHDateTime(new Date().toISOString())}`, 148.5, 24, { align: 'center' });

    doc.autoTable({
        startY: 34,
        head: [['Summary', 'Value', 'Summary', 'Value']],
        body: [
            ['Week', `${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(endDate)}`, 'Branch Filter', branchLabel],
            ['Expense Entries', String(state.rows.length), 'Branches Reporting', String(new Set(state.rows.map(row => row.branch_key || row.branch_name)).size)],
            ['Weekly Total', formatPesoForPdf(total), 'Daily Reports', String(new Set(state.rows.map(row => `${row.expense_date}|${row.branch_key}`)).size)]
        ],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.4 },
        headStyles: { fillColor: [76, 52, 37] }
    });

    let y = doc.lastAutoTable.finalY + 6;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Daily Totals', 14, y);
    doc.autoTable({
        startY: y + 3,
        head: [['Date', 'Entries', 'Total']],
        body: dailyItems.map(item => [formatDateWithWeekday(item.date), String(item.count), formatPesoForPdf(item.total)]),
        theme: 'striped',
        tableWidth: 90,
        styles: { fontSize: 8, cellPadding: 2.2 },
        headStyles: { fillColor: [118, 81, 54] }
    });

    y = doc.lastAutoTable.finalY + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Detailed Daily Expenses', 14, y);
    doc.autoTable({
        startY: y + 3,
        head: [['Date', 'Branch', 'Expense', 'Amount', 'Submitted By', 'Last Updated']],
        body: [...state.rows]
            .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)) || String(a.branch_name).localeCompare(String(b.branch_name)) || String(a.expense_name).localeCompare(String(b.expense_name)))
            .map(row => [
                formatDateWithWeekday(row.expense_date),
                row.branch_name || 'Unassigned Branch',
                row.expense_name || 'Unnamed Expense',
                formatPesoForPdf(getAmount(row)),
                row.team_leader_name || 'Team Leader',
                formatPHDateTime(row.updated_at || row.created_at)
            ]),
        theme: 'grid',
        styles: { fontSize: 7.2, cellPadding: 1.9 },
        headStyles: { fillColor: [76, 52, 37] },
        columnStyles: { 3: { halign: 'right' } }
    });

    addPdfPageNumbers(doc);
    doc.save(`Adrianos_Admin_Expenses_${state.selectedWeekStart}_to_${endDate}.pdf`);
}

function addPdfPageNumbers(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Page ${page} of ${pageCount}`, 283, 202, { align: 'right' });
    }
}

function setBusy(isBusy) {
    state.busy = isBusy;
    elements.refreshBtn.disabled = isBusy;
    elements.exportPdfBtn.disabled = isBusy;
    if (elements.mobileExportPdfBtn) elements.mobileExportPdfBtn.disabled = isBusy;
    elements.refreshBtn.textContent = isBusy ? 'Loading...' : 'Refresh';
}

function updateWeekRangeText() {
    const end = addDaysToDateKey(state.selectedWeekStart, 6);
    const rangeLabel = `${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(end)}`;
    elements.weekRangeText.textContent = rangeLabel;
    if (elements.heroWeekText) elements.heroWeekText.textContent = rangeLabel;

    const branchLabel = elements.branchSelect?.options[elements.branchSelect.selectedIndex]?.textContent || 'All Branches';
    if (elements.reportScopeText) {
        elements.reportScopeText.textContent = `${rangeLabel} • ${branchLabel}`;
    }
}

function getFriendlyDataError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || message.includes('daily_expenses')) {
        return 'The daily expense tables are not installed. Run supabase-daily-expenses.sql in Supabase.';
    }
    if (code === '42501' || message.includes('row-level security')) {
        return 'Supabase permissions blocked the expense report. Run the included SQL migration and reload the schema.';
    }
    return error?.message || 'The expense report request failed.';
}

function getAmount(row) {
    return Math.max(0, Number(row?.amount) || 0);
}

function getPHDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: PH_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const year = parts.find(part => part.type === 'year').value;
    const month = parts.find(part => part.type === 'month').value;
    const day = parts.find(part => part.type === 'day').value;
    return `${year}-${month}-${day}`;
}

function getPHWeekStartKey(dateKey = getPHDateKey()) {
    const date = dateKeyToUTC(dateKey);
    const daysFromMonday = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - daysFromMonday);
    return formatUTCDateKey(date);
}

function addDaysToDateKey(dateKey, amount) {
    const date = dateKeyToUTC(dateKey);
    date.setUTCDate(date.getUTCDate() + amount);
    return formatUTCDateKey(date);
}

function dateKeyToUTC(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function formatUTCDateKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function formatDateLong(dateKey) {
    return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: '2-digit' }).format(dateKeyToUTC(dateKey));
}

function formatDateWithWeekday(dateKey) {
    return new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: '2-digit', year: 'numeric' }).format(dateKeyToUTC(dateKey));
}

function formatPHDateTime(value) {
    if (!value) return 'N/A';
    try {
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: PH_TIMEZONE,
            month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(new Date(value));
    } catch {
        return String(value);
    }
}

function formatPeso(value) {
    return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPesoForPdf(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    window.setTimeout(() => elements.toast.classList.add('hidden'), 3600);
}

function logout() {
    clearAdminSession();
    window.location.replace('tl-login.html');
}

function clearAdminSession() {
    sessionStorage.removeItem('adrianosAdminAuth');
    sessionStorage.removeItem('adrianosAdminLoginTime');
    sessionStorage.removeItem('adrianosAdminUsername');
}
