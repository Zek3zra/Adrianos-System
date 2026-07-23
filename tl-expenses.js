import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const EXPENSE_NAMES_TABLE = 'expense_names';
const DAILY_EXPENSES_TABLE = 'daily_expenses';

const state = {
    currentUser: null,
    currentBranch: null,
    currentDate: '',
    selectedWeekStart: '',
    expenseNames: [],
    todayRows: [],
    weekRows: [],
    busy: false
};

const elements = {};

document.addEventListener('DOMContentLoaded', init);

async function init() {
    bindElements();
    bindEvents();

    try {
        await loadCurrentUser();
        await loadCurrentBranch();
        state.currentDate = getPHDateKey();
        state.selectedWeekStart = getPHWeekStartKey(state.currentDate);
        elements.weekPicker.value = state.selectedWeekStart;
        updateStaticHeader();
        await loadAllExpenseData();
        startDateChangeWatcher();
    } catch (error) {
        console.error('Daily expenses page failed:', error);
        alert(error.message || 'Could not load the daily expense page.');
        clearTlSession();
        window.location.replace('tl-login.html');
    } finally {
        elements.pageLoader.classList.add('hidden');
    }
}

function bindElements() {
    const ids = [
        'pageLoader', 'headerMeta', 'backBtn', 'logoutBtn', 'weekPicker', 'weekRangeText',
        'refreshBtn', 'exportWeeklyPdfBtn', 'todayTotalText', 'todayDateText', 'weekTotalText',
        'weekEntriesText', 'todayEntriesText', 'expenseNamesCountText', 'dailyReportTitle',
        'saveStatusText', 'addExpenseForm', 'newExpenseNameInput', 'expenseList',
        'liveTodayTotalText', 'submitDailyReportBtn', 'dailySummaryList', 'expenseSummaryList',
        'weeklyDetailsBody', 'weeklyDetailsCards', 'toast'
    ];

    ids.forEach(id => { elements[id] = document.getElementById(id); });
}

function bindEvents() {
    elements.backBtn.addEventListener('click', () => window.location.assign('tl-dashboard.html'));
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', loadAllExpenseData);
    elements.exportWeeklyPdfBtn.addEventListener('click', exportSelectedWeekPdf);
    elements.submitDailyReportBtn.addEventListener('click', submitTodayReport);
    elements.addExpenseForm.addEventListener('submit', addExpenseName);

    elements.weekPicker.addEventListener('change', async () => {
        state.selectedWeekStart = getPHWeekStartKey(elements.weekPicker.value || getPHDateKey());
        elements.weekPicker.value = state.selectedWeekStart;
        updateWeekRangeText();
        await loadWeekRows();
        renderWeeklySummary();
    });

    elements.expenseList.addEventListener('input', event => {
        const input = event.target.closest('.expense-amount-input');
        if (!input) return;
        input.value = sanitizeMoneyInput(input.value);
        updateLiveTodayTotal();
        setSaveStatus('Unsaved changes');
    });

    elements.expenseList.addEventListener('blur', event => {
        const input = event.target.closest('.expense-amount-input');
        if (!input || !input.value) return;
        input.value = Number(input.value).toFixed(2).replace(/\.00$/, '');
        updateLiveTodayTotal();
    }, true);

    elements.expenseList.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-expense-id]');
        if (!button) return;
        removeExpenseName(button.dataset.removeExpenseId);
    });
}

async function loadCurrentUser() {
    const hasAuth = sessionStorage.getItem('adrianosTlAuth') === 'true';
    const userId = sessionStorage.getItem('adrianosTlUserId') || sessionStorage.getItem('adrianosLoggedUserId');

    if (!hasAuth || !userId) throw new Error('Session expired. Please log in again.');

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !data) throw new Error('Team leader account not found.');
    if (data.role !== 'team_leader') throw new Error('Access denied. Team Leader account only.');

    state.currentUser = data;
}

async function loadCurrentBranch() {
    if (!state.currentUser.branch_id) return;

    const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', state.currentUser.branch_id)
        .single();

    if (!error && data) state.currentBranch = data;
}

async function loadAllExpenseData() {
    setBusy(true, 'Loading...');
    try {
        state.currentDate = getPHDateKey();
        if (!state.selectedWeekStart) state.selectedWeekStart = getPHWeekStartKey(state.currentDate);
        await Promise.all([loadExpenseNames(), loadTodayRows(), loadWeekRows()]);
        updateStaticHeader();
        renderAll();
        setSaveStatus('Ready');
    } catch (error) {
        console.error('Expense data load failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function loadExpenseNames() {
    const { data, error } = await supabase
        .from(EXPENSE_NAMES_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('is_active', true)
        .order('expense_name', { ascending: true });

    if (error) throw error;
    state.expenseNames = data || [];
}

async function loadTodayRows() {
    const { data, error } = await supabase
        .from(DAILY_EXPENSES_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('expense_date', state.currentDate)
        .order('expense_name', { ascending: true });

    if (error) throw error;
    state.todayRows = (data || []).filter(row => getAmount(row) > 0);
}

async function loadWeekRows() {
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const { data, error } = await supabase
        .from(DAILY_EXPENSES_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .gte('expense_date', state.selectedWeekStart)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: true })
        .order('expense_name', { ascending: true });

    if (error) throw error;
    state.weekRows = (data || []).filter(row => getAmount(row) > 0);
}

function renderAll() {
    renderExpenseInputs();
    renderTopSummary();
    renderWeeklySummary();
    updateWeekRangeText();
    updateLiveTodayTotal();
}

function renderExpenseInputs() {
    if (!state.expenseNames.length) {
        elements.expenseList.innerHTML = '<div class="empty-state">No saved expense names yet. Add your first expense above.</div>';
        return;
    }

    const amountByExpenseId = new Map(state.todayRows.map(row => [row.expense_id, getAmount(row)]));
    const updatedByExpenseId = new Map(state.todayRows.map(row => [row.expense_id, row.updated_at || row.created_at]));

    elements.expenseList.innerHTML = state.expenseNames.map(item => {
        const amount = amountByExpenseId.get(item.id) || '';
        const lastUpdated = updatedByExpenseId.get(item.id);
        return `
            <div class="expense-row" data-expense-id="${escapeHTML(item.id)}">
                <div class="expense-name">
                    <strong>${escapeHTML(item.expense_name)}</strong>
                    <span>${lastUpdated ? `Last submitted ${escapeHTML(formatPHDateTime(lastUpdated))}` : 'No value submitted today'}</span>
                </div>
                <div class="amount-wrap">
                    <input
                        class="expense-amount-input"
                        type="number"
                        inputmode="decimal"
                        min="0"
                        step="0.01"
                        data-expense-id="${escapeHTML(item.id)}"
                        value="${amount ? escapeHTML(String(amount)) : ''}"
                        placeholder="0.00"
                        aria-label="Today's total for ${escapeHTML(item.expense_name)}"
                    >
                </div>
                <button type="button" class="btn btn-link-danger remove-expense-btn" data-remove-expense-id="${escapeHTML(item.id)}">Remove Name</button>
            </div>
        `;
    }).join('');
}

function renderTopSummary() {
    const todayTotal = state.todayRows.reduce((sum, row) => sum + getAmount(row), 0);
    const weekTotal = state.weekRows.reduce((sum, row) => sum + getAmount(row), 0);

    elements.todayTotalText.textContent = formatPeso(todayTotal);
    elements.todayDateText.textContent = formatDateLong(state.currentDate);
    elements.weekTotalText.textContent = formatPeso(weekTotal);
    elements.weekEntriesText.textContent = `${state.weekRows.length} entr${state.weekRows.length === 1 ? 'y' : 'ies'}`;
    elements.todayEntriesText.textContent = String(state.todayRows.length);
    elements.expenseNamesCountText.textContent = String(state.expenseNames.length);
    elements.dailyReportTitle.textContent = `Enter expenses for ${formatDateLong(state.currentDate)}`;
}

function renderWeeklySummary() {
    const dailyMap = new Map();
    for (let i = 0; i < 7; i += 1) {
        const dateKey = addDaysToDateKey(state.selectedWeekStart, i);
        dailyMap.set(dateKey, { dateKey, total: 0, count: 0 });
    }

    const expenseMap = new Map();
    state.weekRows.forEach(row => {
        const amount = getAmount(row);
        const day = dailyMap.get(row.expense_date);
        if (day) {
            day.total += amount;
            day.count += 1;
        }

        const key = row.expense_id || row.expense_name;
        if (!expenseMap.has(key)) expenseMap.set(key, { name: row.expense_name || 'Unnamed Expense', total: 0, count: 0 });
        const item = expenseMap.get(key);
        item.total += amount;
        item.count += 1;
    });

    elements.dailySummaryList.innerHTML = [...dailyMap.values()].map(item => `
        <div class="summary-list-row">
            <div><strong>${escapeHTML(formatDateWithWeekday(item.dateKey))}</strong><br><span>${item.count} entr${item.count === 1 ? 'y' : 'ies'}</span></div>
            <strong>${escapeHTML(formatPeso(item.total))}</strong>
        </div>
    `).join('');

    const expenseItems = [...expenseMap.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    elements.expenseSummaryList.innerHTML = expenseItems.length
        ? expenseItems.map(item => `
            <div class="summary-list-row">
                <div><strong>${escapeHTML(item.name)}</strong><br><span>${item.count} day entr${item.count === 1 ? 'y' : 'ies'}</span></div>
                <strong>${escapeHTML(formatPeso(item.total))}</strong>
            </div>
        `).join('')
        : '<div class="empty-state">No positive expense values for this week.</div>';

    const sortedRows = [...state.weekRows].sort((a, b) => {
        const dateCompare = String(b.expense_date).localeCompare(String(a.expense_date));
        if (dateCompare !== 0) return dateCompare;
        return String(a.expense_name || '').localeCompare(String(b.expense_name || ''));
    });

    elements.weeklyDetailsBody.innerHTML = sortedRows.length
        ? sortedRows.map(row => `
            <tr>
                <td>${escapeHTML(formatDateWithWeekday(row.expense_date))}</td>
                <td><strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong></td>
                <td>${escapeHTML(formatPeso(getAmount(row)))}</td>
                <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="5" class="table-empty">No submitted expenses greater than zero for this week.</td></tr>';

    if (elements.weeklyDetailsCards) {
        elements.weeklyDetailsCards.innerHTML = sortedRows.length
            ? sortedRows.map(row => `
                <article class="mobile-record-card">
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
            : '<div class="empty-state">No submitted expenses greater than zero for this week.</div>';
    }

    renderTopSummary();
}

async function addExpenseName(event) {
    event.preventDefault();
    const name = elements.newExpenseNameInput.value.trim().replace(/\s+/g, ' ');
    if (!name) return;

    const expenseKey = slugify(name);
    if (!expenseKey) {
        showToast('Please enter a valid expense name.', 'error');
        return;
    }

    setBusy(true, 'Adding expense...');
    try {
        const { data: existing, error: findError } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .select('*')
            .eq('branch_key', getBranchKey())
            .eq('expense_key', expenseKey)
            .limit(1);

        if (findError) throw findError;

        if (existing?.length) {
            const { error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .update({ expense_name: name, is_active: true })
                .eq('id', existing[0].id);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .insert({
                    branch_key: getBranchKey(),
                    branch_id: state.currentUser.branch_id || null,
                    expense_name: name,
                    expense_key: expenseKey,
                    created_by: state.currentUser.id,
                    created_by_name: state.currentUser.full_name
                });
            if (error) throw error;
        }

        elements.newExpenseNameInput.value = '';
        await loadExpenseNames();
        renderExpenseInputs();
        renderTopSummary();
        updateLiveTodayTotal();
        showToast('Expense name saved. It will remain available on future dates.');
    } catch (error) {
        console.error('Add expense name failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function removeExpenseName(expenseId) {
    const item = state.expenseNames.find(expense => expense.id === expenseId);
    if (!item) return;

    const confirmed = window.confirm(`Remove "${item.expense_name}" from future expense forms? Historical daily records will be kept.`);
    if (!confirmed) return;

    setBusy(true, 'Removing expense name...');
    try {
        const { error } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .update({ is_active: false })
            .eq('id', expenseId)
            .eq('branch_key', getBranchKey());
        if (error) throw error;

        await loadExpenseNames();
        renderExpenseInputs();
        renderTopSummary();
        updateLiveTodayTotal();
        showToast('Expense name removed from future forms. Historical records were preserved.');
    } catch (error) {
        console.error('Remove expense name failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function submitTodayReport() {
    const latestDate = getPHDateKey();
    if (latestDate !== state.currentDate) {
        state.currentDate = latestDate;
        showToast('A new Philippine date has started. The form was refreshed before saving.', 'error');
        await loadAllExpenseData();
        return;
    }

    const inputs = [...elements.expenseList.querySelectorAll('.expense-amount-input[data-expense-id]')];
    if (!inputs.length) {
        showToast('Add at least one expense name first.', 'error');
        return;
    }

    setBusy(true, 'Submitting today’s report...');
    setSaveStatus('Saving...');

    try {
        for (const input of inputs) {
            const expenseId = input.dataset.expenseId;
            const template = state.expenseNames.find(item => item.id === expenseId);
            if (!template) continue;

            const amount = Math.max(0, Number(input.value) || 0);
            if (amount > 0) {
                const payload = {
                    expense_date: state.currentDate,
                    branch_key: getBranchKey(),
                    branch_id: state.currentUser.branch_id || null,
                    branch_name: getBranchName(),
                    expense_id: template.id,
                    expense_name: template.expense_name,
                    amount,
                    team_leader_id: state.currentUser.id,
                    team_leader_name: state.currentUser.full_name
                };

                const { error } = await supabase
                    .from(DAILY_EXPENSES_TABLE)
                    .upsert(payload, { onConflict: 'expense_date,branch_key,expense_id' });
                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from(DAILY_EXPENSES_TABLE)
                    .delete()
                    .eq('expense_date', state.currentDate)
                    .eq('branch_key', getBranchKey())
                    .eq('expense_id', template.id);
                if (error) throw error;
            }
        }

        await Promise.all([loadTodayRows(), loadWeekRows()]);
        renderAll();
        setSaveStatus(`Submitted ${getPHTimeText()}`);
        showToast('Today’s expense report was submitted. Submitting again today will update these same records.');
    } catch (error) {
        console.error('Daily expense submit failed:', error);
        setSaveStatus('Save failed');
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function exportSelectedWeekPdf() {
    if (!state.weekRows.length) {
        showToast('There are no positive expense values to export for the selected week.', 'error');
        return;
    }

    if (!window.jspdf?.jsPDF) {
        showToast('The PDF library is not ready. Check your internet connection and reload.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        showToast('The PDF table library is not ready. Reload the page and try again.', 'error');
        return;
    }

    const weekEnd = addDaysToDateKey(state.selectedWeekStart, 6);
    const total = state.weekRows.reduce((sum, row) => sum + getAmount(row), 0);
    const daySummary = buildDaySummary(state.weekRows);

    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, 210, 31, 'F');
    doc.setTextColor(44, 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("ADRIANO'S WEEKLY EXPENSE REPORT", 105, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(weekEnd)}`, 105, 20, { align: 'center' });
    doc.text(`${getBranchName()} | Prepared by ${state.currentUser.full_name}`, 105, 25, { align: 'center' });

    doc.autoTable({
        startY: 36,
        head: [['Report Detail', 'Value']],
        body: [
            ['Week', `${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(weekEnd)}`],
            ['Branch', getBranchName()],
            ['Expense Entries', String(state.weekRows.length)],
            ['Weekly Total', formatPesoForPdf(total)]
        ],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [76, 52, 37] }
    });

    let y = doc.lastAutoTable.finalY + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Daily Totals', 14, y);
    doc.autoTable({
        startY: y + 3,
        head: [['Date', 'Entries', 'Daily Total']],
        body: daySummary.map(item => [formatDateWithWeekday(item.date), String(item.count), formatPesoForPdf(item.total)]),
        theme: 'striped',
        styles: { fontSize: 8, cellPadding: 2.3 },
        headStyles: { fillColor: [118, 81, 54] }
    });

    y = doc.lastAutoTable.finalY + 7;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Detailed Expenses', 14, y);
    doc.autoTable({
        startY: y + 3,
        head: [['Date', 'Expense', 'Amount', 'Submitted By', 'Updated']],
        body: [...state.weekRows]
            .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)) || String(a.expense_name).localeCompare(String(b.expense_name)))
            .map(row => [
                formatDateWithWeekday(row.expense_date),
                row.expense_name || 'Unnamed Expense',
                formatPesoForPdf(getAmount(row)),
                row.team_leader_name || 'Team Leader',
                formatPHDateTime(row.updated_at || row.created_at)
            ]),
        theme: 'grid',
        styles: { fontSize: 7.4, cellPadding: 2 },
        headStyles: { fillColor: [76, 52, 37] },
        columnStyles: { 2: { halign: 'right' } }
    });

    addPdfPageNumbers(doc);
    doc.save(`Adrianos_Expenses_${getSafeFileName(getBranchName())}_${state.selectedWeekStart}_to_${weekEnd}.pdf`);
}

function buildDaySummary(rows) {
    const map = new Map();
    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        map.set(date, { date, total: 0, count: 0 });
    }
    rows.forEach(row => {
        const item = map.get(row.expense_date);
        if (!item) return;
        item.total += getAmount(row);
        item.count += 1;
    });
    return [...map.values()];
}

function addPdfPageNumbers(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Generated ${formatPHDateTime(new Date().toISOString())} | Page ${page} of ${pageCount}`, 105, 291, { align: 'center' });
    }
}

function updateStaticHeader() {
    const branch = getBranchName();
    elements.headerMeta.textContent = `${branch} • ${state.currentUser?.full_name || 'Team Leader'} • Philippine Time`;
    elements.todayDateText.textContent = formatDateLong(state.currentDate || getPHDateKey());
    elements.dailyReportTitle.textContent = `Enter expenses for ${formatDateLong(state.currentDate || getPHDateKey())}`;
    updateWeekRangeText();
}

function updateWeekRangeText() {
    const start = state.selectedWeekStart || getPHWeekStartKey();
    const end = addDaysToDateKey(start, 6);
    elements.weekRangeText.textContent = `${formatDateLong(start)} to ${formatDateLong(end)}`;
}

function updateLiveTodayTotal() {
    const total = [...elements.expenseList.querySelectorAll('.expense-amount-input')]
        .reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
    elements.liveTodayTotalText.textContent = `Today's running total: ${formatPeso(total)}`;
}

function startDateChangeWatcher() {
    window.setInterval(async () => {
        const latestDate = getPHDateKey();
        if (latestDate === state.currentDate) return;

        state.currentDate = latestDate;
        state.selectedWeekStart = getPHWeekStartKey(latestDate);
        elements.weekPicker.value = state.selectedWeekStart;
        await loadAllExpenseData();
        showToast('A new Philippine day has started. Today’s values are now blank; saved expense names remain available.');
    }, 60_000);
}

function setBusy(isBusy, label = '') {
    state.busy = isBusy;
    [elements.refreshBtn, elements.exportWeeklyPdfBtn, elements.submitDailyReportBtn]
        .filter(Boolean)
        .forEach(button => { button.disabled = isBusy; });
    if (label) setSaveStatus(label);
}

function setSaveStatus(text) {
    elements.saveStatusText.textContent = text;
}

function getFriendlyDataError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || message.includes('daily_expenses')) {
        return 'The daily expense tables are not installed yet. Run supabase-daily-expenses.sql in Supabase.';
    }
    if (message.includes('row-level security') || code === '42501') {
        return 'Supabase permissions blocked the expense request. Run the included SQL migration and reload the schema.';
    }
    return error?.message || 'The expense request failed. Please try again.';
}

function getBranchName() {
    return state.currentBranch?.name || state.currentUser?.branch_name || 'Unassigned Branch';
}

function getBranchKey() {
    if (state.currentUser?.branch_id) return `branch_${state.currentUser.branch_id}`;
    return `unassigned_${state.currentUser?.id || 'unknown'}`;
}

function getAmount(row) {
    return Math.max(0, Number(row?.amount) || 0);
}

function sanitizeMoneyInput(value) {
    const cleaned = String(value || '').replace(/[^0-9.]/g, '');
    const [whole = '', ...decimals] = cleaned.split('.');
    return decimals.length ? `${whole}.${decimals.join('').slice(0, 2)}` : whole;
}

function getPHDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: PH_TIMEZONE,
        year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date());
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
            month: 'short', day: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(new Date(value));
    } catch {
        return String(value);
    }
}

function getPHTimeText() {
    return new Intl.DateTimeFormat('en-PH', { timeZone: PH_TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(new Date());
}

function formatPeso(value) {
    return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPesoForPdf(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function slugify(value) {
    return String(value).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function getSafeFileName(value) {
    return String(value || 'Branch').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
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
    clearTlSession();
    window.location.replace('tl-login.html');
}

function clearTlSession() {
    sessionStorage.removeItem('adrianosTlAuth');
    sessionStorage.removeItem('adrianosTlUserId');
    sessionStorage.removeItem('adrianosLoggedUserId');
}
