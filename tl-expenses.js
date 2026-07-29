import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const EXPENSE_NAMES_TABLE = 'expense_names';
const DAILY_EXPENSES_TABLE = 'daily_expenses';
const DAILY_FINANCIALS_TABLE = 'daily_branch_financials';
const EXPENSE_RECEIPTS_TABLE = 'expense_receipts';
const RECEIPT_BUCKET = 'expense-receipts';
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

const state = {
    currentUser: null,
    currentBranch: null,
    currentDate: '',
    entryDate: '',
    selectedWeekStart: '',
    expenseNames: [],
    dateRows: [],
    weekRows: [],
    dateFinancial: null,
    weekFinancials: [],
    receipts: [],
    expenseSearch: '',
    draftAmounts: new Map(),
    selectedReceiptFile: null,
    previewUrl: '',
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
        state.entryDate = state.currentDate;
        state.selectedWeekStart = getPHWeekStartKey(state.entryDate);

        elements.reportDatePicker.max = state.currentDate;
        elements.reportDatePicker.value = state.entryDate;
        elements.weekPicker.value = state.selectedWeekStart;

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
        'pageLoader', 'headerMeta', 'backBtn', 'logoutBtn', 'reportDatePicker', 'reportDateHelp',
        'salesInput', 'bilinInput', 'generalExpensesText', 'panindaExpensesText', 'moneyLeftText',
        'weekPicker', 'weekRangeText', 'refreshBtn', 'exportWeeklyPdfBtn', 'todayTotalText',
        'todayDateText', 'weekTotalText', 'weekEntriesText', 'todayEntriesText', 'receiptCountText',
        'dailyReportTitle', 'saveStatusText', 'expenseSearchInput', 'expenseSearchCountText',
        'generalNamesCountText', 'panindaNamesCountText', 'addExpenseForm', 'newExpenseNameInput',
        'addPanindaForm', 'newPanindaNameInput', 'generalExpenseList', 'panindaExpenseList',
        'liveTodayTotalText', 'submitHintText', 'submitDailyReportBtn', 'dailySummaryList',
        'expenseSummaryList', 'weeklyDetailsBody', 'weeklyDetailsCards', 'receiptStatusText',
        'receiptUploadForm', 'receiptNameInput', 'receiptImageInput', 'receiptPreviewWrap',
        'receiptPreviewImage', 'clearReceiptImageBtn', 'uploadReceiptBtn', 'receiptListCountText',
        'receiptList', 'toast'
    ];

    ids.forEach(id => {
        elements[id] = document.getElementById(id);
    });
}

function bindEvents() {
    elements.backBtn.addEventListener('click', () => window.location.assign('tl-dashboard.html'));
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', loadAllExpenseData);
    elements.exportWeeklyPdfBtn.addEventListener('click', exportSelectedWeekPdf);
    elements.submitDailyReportBtn.addEventListener('click', submitSelectedDateReport);
    elements.addExpenseForm.addEventListener('submit', event => addExpenseName(event, 'general'));
    elements.addPanindaForm.addEventListener('submit', event => addExpenseName(event, 'paninda'));
    elements.receiptUploadForm.addEventListener('submit', uploadReceipt);

    elements.reportDatePicker.addEventListener('change', handleEntryDateChange);
    elements.weekPicker.addEventListener('change', handleWeekChange);

    elements.expenseSearchInput.addEventListener('input', event => {
        state.expenseSearch = event.target.value.trim().toLowerCase();
        renderExpenseInputs();
        renderWeeklySummary();
    });

    [elements.generalExpenseList, elements.panindaExpenseList].forEach(list => {
        list.addEventListener('input', handleExpenseAmountInput);
        list.addEventListener('blur', handleExpenseAmountBlur, true);
        list.addEventListener('click', handleExpenseListClick);
    });

    [elements.salesInput, elements.bilinInput].forEach(input => {
        input.addEventListener('input', () => {
            input.value = sanitizeMoneyInput(input.value);
            updateLiveCashFlow();
            setSaveStatus('Unsaved changes');
        });
        input.addEventListener('blur', () => {
            if (input.value) input.value = Number(input.value).toFixed(2).replace(/\.00$/, '');
            updateLiveCashFlow();
        });
    });

    elements.receiptImageInput.addEventListener('change', handleReceiptFileChange);
    elements.clearReceiptImageBtn.addEventListener('click', clearReceiptSelection);
    elements.receiptList.addEventListener('click', event => {
        const deleteButton = event.target.closest('[data-delete-receipt-id]');
        if (deleteButton) deleteReceipt(deleteButton.dataset.deleteReceiptId);
    });
}

async function handleEntryDateChange() {
    let selectedDate = elements.reportDatePicker.value || getPHDateKey();
    const today = getPHDateKey();

    if (selectedDate > today) {
        selectedDate = today;
        elements.reportDatePicker.value = today;
        showToast('Future expense dates are not allowed.', 'error');
    }

    state.entryDate = selectedDate;
    state.selectedWeekStart = getPHWeekStartKey(selectedDate);
    elements.weekPicker.value = state.selectedWeekStart;

    setBusy(true, 'Loading selected date...');
    try {
        await Promise.all([
            loadDateRows(),
            loadDateFinancial(),
            loadWeekRows(),
            loadWeekFinancials(),
            loadWeekReceipts()
        ]);
        renderAll();
    } catch (error) {
        console.error('Selected date load failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function handleWeekChange() {
    state.selectedWeekStart = getPHWeekStartKey(elements.weekPicker.value || getPHDateKey());
    elements.weekPicker.value = state.selectedWeekStart;

    setBusy(true, 'Loading selected week...');
    try {
        await Promise.all([loadWeekRows(), loadWeekFinancials(), loadWeekReceipts()]);
        renderTopSummary();
        renderWeeklySummary();
        renderReceipts();
        updateWeekRangeText();
    } catch (error) {
        console.error('Selected week load failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

function handleExpenseAmountInput(event) {
    const input = event.target.closest('.expense-amount-input[data-expense-id]');
    if (!input) return;

    input.value = sanitizeMoneyInput(input.value);
    state.draftAmounts.set(input.dataset.expenseId, Math.max(0, Number(input.value) || 0));
    updateLiveCashFlow();
    setSaveStatus('Unsaved changes');
}

function handleExpenseAmountBlur(event) {
    const input = event.target.closest('.expense-amount-input[data-expense-id]');
    if (!input || !input.value) return;

    input.value = Number(input.value).toFixed(2).replace(/\.00$/, '');
    state.draftAmounts.set(input.dataset.expenseId, Math.max(0, Number(input.value) || 0));
    updateLiveCashFlow();
}

function handleExpenseListClick(event) {
    const button = event.target.closest('[data-remove-expense-id]');
    if (!button) return;
    removeExpenseName(button.dataset.removeExpenseId);
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
        elements.reportDatePicker.max = state.currentDate;

        if (!state.entryDate || state.entryDate > state.currentDate) {
            state.entryDate = state.currentDate;
            elements.reportDatePicker.value = state.entryDate;
        }
        if (!state.selectedWeekStart) {
            state.selectedWeekStart = getPHWeekStartKey(state.entryDate);
            elements.weekPicker.value = state.selectedWeekStart;
        }

        await Promise.all([
            loadExpenseNames(),
            loadDateRows(),
            loadDateFinancial(),
            loadWeekRows(),
            loadWeekFinancials(),
            loadWeekReceipts()
        ]);

        renderAll();
        setSaveStatus('Ready');
        setReceiptStatus('Ready');
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
        .order('expense_category', { ascending: true })
        .order('expense_name', { ascending: true });

    if (error) throw error;

    state.expenseNames = (data || []).map(item => ({
        ...item,
        expense_category: normalizeExpenseCategory(item.expense_category)
    }));
}

async function loadDateRows() {
    const { data, error } = await supabase
        .from(DAILY_EXPENSES_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('expense_date', state.entryDate)
        .order('expense_name', { ascending: true });

    if (error) throw error;

    state.dateRows = (data || [])
        .filter(row => getAmount(row) > 0)
        .map(row => ({ ...row, expense_category: normalizeExpenseCategory(row.expense_category) }));

    state.draftAmounts = new Map(state.dateRows.map(row => [row.expense_id, getAmount(row)]));
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

    state.weekRows = (data || [])
        .filter(row => getAmount(row) > 0)
        .map(row => ({ ...row, expense_category: normalizeExpenseCategory(row.expense_category) }));
}

async function loadDateFinancial() {
    const { data, error } = await supabase
        .from(DAILY_FINANCIALS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('financial_date', state.entryDate)
        .maybeSingle();

    if (error) throw error;

    state.dateFinancial = data || null;
}

async function loadWeekFinancials() {
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const { data, error } = await supabase
        .from(DAILY_FINANCIALS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .gte('financial_date', state.selectedWeekStart)
        .lte('financial_date', endDate)
        .order('financial_date', { ascending: true });

    if (error) throw error;

    state.weekFinancials = data || [];
}

async function loadWeekReceipts() {
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const { data, error } = await supabase
        .from(EXPENSE_RECEIPTS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .gte('expense_date', state.selectedWeekStart)
        .lte('expense_date', endDate)
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;

    state.receipts = data || [];
}

function renderAll() {
    renderExpenseInputs();
    renderFinancialInputs();
    renderTopSummary();
    renderWeeklySummary();
    renderReceipts();
    updateStaticHeader();
    updateWeekRangeText();
    updateLiveCashFlow();
}

function renderFinancialInputs() {
    elements.salesInput.value = formatInputAmount(state.dateFinancial?.sales);
    elements.bilinInput.value = formatInputAmount(state.dateFinancial?.bilin_sa_paninda);
}

function renderExpenseInputs() {
    const query = state.expenseSearch;
    const matchingNames = state.expenseNames.filter(item =>
        !query || String(item.expense_name || '').toLowerCase().includes(query)
    );

    const generalItems = matchingNames.filter(item => item.expense_category === 'general');
    const panindaItems = matchingNames.filter(item => item.expense_category === 'paninda');

    elements.generalExpenseList.innerHTML = generalItems.length
        ? generalItems.map(renderExpenseRow).join('')
        : `<div class="empty-state">${query ? `No general expense matches “${escapeHTML(elements.expenseSearchInput.value.trim())}”.` : 'No general expense names yet.'}</div>`;

    elements.panindaExpenseList.innerHTML = panindaItems.length
        ? panindaItems.map(renderExpenseRow).join('')
        : `<div class="empty-state">${query ? `No Paninda item matches “${escapeHTML(elements.expenseSearchInput.value.trim())}”.` : 'No Paninda items yet. Add the first item above.'}</div>`;

    const totalGeneral = state.expenseNames.filter(item => item.expense_category === 'general').length;
    const totalPaninda = state.expenseNames.filter(item => item.expense_category === 'paninda').length;

    elements.generalNamesCountText.textContent = `${totalGeneral} name${totalGeneral === 1 ? '' : 's'}`;
    elements.panindaNamesCountText.textContent = `${totalPaninda} item${totalPaninda === 1 ? '' : 's'} • Permanent`;
    elements.expenseSearchCountText.textContent = query
        ? `${matchingNames.length} of ${state.expenseNames.length} names shown for “${elements.expenseSearchInput.value.trim()}”`
        : `${state.expenseNames.length} saved expense name${state.expenseNames.length === 1 ? '' : 's'}`;
}

function renderExpenseRow(item) {
    const amount = state.draftAmounts.get(item.id) || '';
    const existingRow = state.dateRows.find(row => row.expense_id === item.id);
    const categoryLabel = item.expense_category === 'paninda' ? 'Paninda item' : 'General expense';

    return `
        <div class="expense-row ${item.expense_category === 'paninda' ? 'paninda-row' : ''}" data-expense-id="${escapeHTML(item.id)}">
            <div class="expense-name">
                <span class="expense-type-label">${escapeHTML(categoryLabel)}</span>
                <strong>${escapeHTML(item.expense_name)}</strong>
                <span>${existingRow ? `Last submitted ${escapeHTML(formatPHDateTime(existingRow.updated_at || existingRow.created_at))}` : `No value submitted for ${escapeHTML(formatDateLong(state.entryDate))}`}</span>
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
                    aria-label="Amount for ${escapeHTML(item.expense_name)} on ${escapeHTML(formatDateLong(state.entryDate))}"
                >
            </div>
            <button type="button" class="btn btn-link-danger remove-expense-btn" data-remove-expense-id="${escapeHTML(item.id)}">Remove Name</button>
        </div>
    `;
}

function renderTopSummary() {
    const selectedTotal = state.dateRows.reduce((sum, row) => sum + getAmount(row), 0);
    const weekTotal = state.weekRows.reduce((sum, row) => sum + getAmount(row), 0);

    elements.todayTotalText.textContent = formatPeso(selectedTotal);
    elements.todayDateText.textContent = formatDateLong(state.entryDate);
    elements.weekTotalText.textContent = formatPeso(weekTotal);
    elements.weekEntriesText.textContent = `${state.weekRows.length} entr${state.weekRows.length === 1 ? 'y' : 'ies'}`;
    elements.todayEntriesText.textContent = String(state.dateRows.length);
    elements.receiptCountText.textContent = String(state.receipts.length);
}

function renderWeeklySummary() {
    const dailyMap = new Map();

    for (let i = 0; i < 7; i += 1) {
        const dateKey = addDaysToDateKey(state.selectedWeekStart, i);
        dailyMap.set(dateKey, {
            dateKey,
            general: 0,
            paninda: 0,
            count: 0,
            sales: 0,
            bilin: 0
        });
    }

    state.weekRows.forEach(row => {
        const day = dailyMap.get(row.expense_date);
        if (!day) return;

        if (normalizeExpenseCategory(row.expense_category) === 'paninda') day.paninda += getAmount(row);
        else day.general += getAmount(row);

        day.count += 1;
    });

    state.weekFinancials.forEach(row => {
        const day = dailyMap.get(row.financial_date);
        if (!day) return;
        day.sales += getFinancialAmount(row.sales);
        day.bilin += getFinancialAmount(row.bilin_sa_paninda);
    });

    elements.dailySummaryList.innerHTML = [...dailyMap.values()].map(item => {
        const allExpenses = item.general + item.paninda;
        const moneyLeft = item.sales + item.bilin - item.general;

        return `
            <div class="daily-financial-summary-row">
                <div class="daily-financial-date">
                    <strong>${escapeHTML(formatDateWithWeekday(item.dateKey))}</strong>
                    <span>${item.count} expense entr${item.count === 1 ? 'y' : 'ies'}</span>
                </div>
                <div class="daily-financial-values">
                    <span>Sales + Bilin <strong>${escapeHTML(formatPeso(item.sales + item.bilin))}</strong></span>
                    <span>General <strong>${escapeHTML(formatPeso(item.general))}</strong></span>
                    <span>Paninda <strong>${escapeHTML(formatPeso(item.paninda))}</strong></span>
                    <span>All expenses <strong>${escapeHTML(formatPeso(allExpenses))}</strong></span>
                    <span class="money-left-line">Money left <strong>${escapeHTML(formatPeso(moneyLeft))}</strong></span>
                </div>
            </div>
        `;
    }).join('');

    const expenseMap = new Map();
    state.weekRows.forEach(row => {
        const key = row.expense_id || `${row.expense_category}|${row.expense_name}`;
        if (!expenseMap.has(key)) {
            expenseMap.set(key, {
                name: row.expense_name || 'Unnamed Expense',
                category: normalizeExpenseCategory(row.expense_category),
                total: 0,
                count: 0
            });
        }
        const item = expenseMap.get(key);
        item.total += getAmount(row);
        item.count += 1;
    });

    const expenseItems = [...expenseMap.values()]
        .filter(item => !state.expenseSearch || item.name.toLowerCase().includes(state.expenseSearch))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    elements.expenseSummaryList.innerHTML = expenseItems.length
        ? expenseItems.map(item => `
            <div class="summary-list-row">
                <div>
                    <span class="category-mini-badge ${item.category === 'paninda' ? 'paninda-mini-badge' : ''}">${escapeHTML(getCategoryLabel(item.category))}</span>
                    <strong>${escapeHTML(item.name)}</strong><br>
                    <span>${item.count} daily entr${item.count === 1 ? 'y' : 'ies'}</span>
                </div>
                <strong>${escapeHTML(formatPeso(item.total))}</strong>
            </div>
        `).join('')
        : `<div class="empty-state">${state.expenseSearch ? `No weekly expense matches “${escapeHTML(elements.expenseSearchInput.value.trim())}”.` : 'No positive expense values for this week.'}</div>`;

    const rows = [...state.weekRows]
        .filter(row => !state.expenseSearch || String(row.expense_name || '').toLowerCase().includes(state.expenseSearch))
        .sort((a, b) =>
            String(b.expense_date).localeCompare(String(a.expense_date)) ||
            String(a.expense_category).localeCompare(String(b.expense_category)) ||
            String(a.expense_name || '').localeCompare(String(b.expense_name || ''))
        );

    elements.weeklyDetailsBody.innerHTML = rows.length
        ? rows.map(row => `
            <tr>
                <td>${escapeHTML(formatDateWithWeekday(row.expense_date))}</td>
                <td>${escapeHTML(getCategoryLabel(row.expense_category))}</td>
                <td><strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong></td>
                <td>${escapeHTML(formatPeso(getAmount(row)))}</td>
                <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="6" class="table-empty">No matching submitted expenses greater than zero for this week.</td></tr>';

    elements.weeklyDetailsCards.innerHTML = rows.length
        ? rows.map(row => `
            <article class="mobile-record-card">
                <span class="category-mini-badge ${normalizeExpenseCategory(row.expense_category) === 'paninda' ? 'paninda-mini-badge' : ''}">${escapeHTML(getCategoryLabel(row.expense_category))}</span>
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
        : '<div class="empty-state">No matching submitted expenses greater than zero for this week.</div>';
}

function renderReceipts() {
    elements.receiptCountText.textContent = String(state.receipts.length);
    elements.receiptListCountText.textContent = `${state.receipts.length} receipt${state.receipts.length === 1 ? '' : 's'}`;

    elements.receiptList.innerHTML = state.receipts.length
        ? state.receipts.map(receipt => `
            <article class="receipt-item">
                <a class="receipt-thumb-link" href="${escapeHTML(receipt.receipt_url)}" target="_blank" rel="noopener">
                    <img src="${escapeHTML(receipt.receipt_url)}" alt="${escapeHTML(receipt.receipt_name)} receipt" loading="lazy">
                </a>
                <div class="receipt-item-body">
                    <strong>${escapeHTML(receipt.receipt_name || 'Receipt')}</strong>
                    <span>${escapeHTML(formatDateWithWeekday(receipt.expense_date))}<br>Uploaded ${escapeHTML(formatPHDateTime(receipt.created_at))}</span>
                    <div class="receipt-item-actions">
                        <a class="btn outline-btn" href="${escapeHTML(receipt.receipt_url)}" target="_blank" rel="noopener">View</a>
                        <button type="button" class="btn danger-btn" data-delete-receipt-id="${escapeHTML(receipt.id)}">Delete</button>
                    </div>
                </div>
            </article>
        `).join('')
        : '<div class="empty-state">No receipt images uploaded for this week.</div>';
}

async function addExpenseName(event, category) {
    event.preventDefault();
    if (state.busy) return;

    const isPaninda = category === 'paninda';
    const input = isPaninda ? elements.newPanindaNameInput : elements.newExpenseNameInput;
    const name = input.value.trim();
    const baseKey = slugify(name);
    const expenseKey = isPaninda ? `paninda-${baseKey}` : baseKey;

    if (!baseKey) {
        showToast(`Please enter a valid ${isPaninda ? 'Paninda item' : 'expense'} name.`, 'error');
        return;
    }

    setBusy(true, `Adding ${isPaninda ? 'Paninda item' : 'expense'}...`);

    try {
        const { data: existing, error: findError } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .select('*')
            .eq('branch_key', getBranchKey())
            .eq('expense_key', expenseKey)
            .maybeSingle();

        if (findError) throw findError;

        const payload = {
            expense_name: name,
            expense_category: isPaninda ? 'paninda' : 'general',
            is_active: true,
            updated_at: new Date().toISOString()
        };

        if (existing) {
            const { error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .update(payload)
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            const { error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .insert({
                    branch_key: getBranchKey(),
                    branch_id: state.currentUser.branch_id || null,
                    expense_name: name,
                    expense_key: expenseKey,
                    expense_category: isPaninda ? 'paninda' : 'general',
                    created_by: state.currentUser.id,
                    created_by_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader',
                    is_active: true
                });
            if (error) throw error;
        }

        input.value = '';
        await loadExpenseNames();
        renderExpenseInputs();
        showToast(`“${name}” was added under ${isPaninda ? 'Paninda' : 'General Expenses'}.`);
    } catch (error) {
        console.error('Add expense name failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
        setSaveStatus('Ready');
    }
}

async function removeExpenseName(expenseId) {
    const item = state.expenseNames.find(expense => expense.id === expenseId);
    if (!item || state.busy) return;

    const confirmed = window.confirm(`Remove “${item.expense_name}” from future forms? Historical records will remain.`);
    if (!confirmed) return;

    setBusy(true, 'Removing name...');

    try {
        const { error } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .update({ is_active: false, updated_at: new Date().toISOString() })
            .eq('id', expenseId);

        if (error) throw error;

        state.draftAmounts.delete(expenseId);
        await loadExpenseNames();
        renderExpenseInputs();
        updateLiveCashFlow();
        showToast('Expense name removed. Historical records remain available.');
    } catch (error) {
        console.error('Remove expense name failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
        setSaveStatus('Ready');
    }
}

async function submitSelectedDateReport() {
    if (state.busy) return;

    const today = getPHDateKey();
    if (!state.entryDate || state.entryDate > today) {
        showToast('Choose today or an earlier Philippine date.', 'error');
        return;
    }

    setBusy(true, 'Submitting selected date...');

    try {
        const nowIso = new Date().toISOString();

        for (const template of state.expenseNames) {
            const amount = Math.max(0, Number(state.draftAmounts.get(template.id)) || 0);

            if (amount > 0) {
                const payload = {
                    expense_date: state.entryDate,
                    branch_key: getBranchKey(),
                    branch_id: state.currentUser.branch_id || null,
                    branch_name: getBranchName(),
                    expense_id: template.id,
                    expense_name: template.expense_name,
                    expense_category: normalizeExpenseCategory(template.expense_category),
                    amount,
                    team_leader_id: state.currentUser.id,
                    team_leader_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader',
                    updated_at: nowIso
                };

                const { error } = await supabase
                    .from(DAILY_EXPENSES_TABLE)
                    .upsert(payload, { onConflict: 'expense_date,branch_key,expense_id' });

                if (error) throw error;
            } else {
                const { error } = await supabase
                    .from(DAILY_EXPENSES_TABLE)
                    .delete()
                    .eq('expense_date', state.entryDate)
                    .eq('branch_key', getBranchKey())
                    .eq('expense_id', template.id);

                if (error) throw error;
            }
        }

        const financialPayload = {
            financial_date: state.entryDate,
            branch_key: getBranchKey(),
            branch_id: state.currentUser.branch_id || null,
            branch_name: getBranchName(),
            sales: Math.max(0, Number(elements.salesInput.value) || 0),
            bilin_sa_paninda: Math.max(0, Number(elements.bilinInput.value) || 0),
            team_leader_id: state.currentUser.id,
            team_leader_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader',
            updated_at: nowIso
        };

        const { error: financialError } = await supabase
            .from(DAILY_FINANCIALS_TABLE)
            .upsert(financialPayload, { onConflict: 'financial_date,branch_key' });

        if (financialError) throw financialError;

        await Promise.all([
            loadDateRows(),
            loadDateFinancial(),
            loadWeekRows(),
            loadWeekFinancials()
        ]);

        renderAll();
        setSaveStatus('Submitted');
        showToast(`Expense report saved for ${formatDateWithWeekday(state.entryDate)}.`);
    } catch (error) {
        console.error('Expense submit failed:', error);
        setSaveStatus('Submit failed');
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

function updateLiveCashFlow() {
    let generalExpenses = 0;
    let panindaExpenses = 0;

    state.expenseNames.forEach(item => {
        const amount = Math.max(0, Number(state.draftAmounts.get(item.id)) || 0);
        if (normalizeExpenseCategory(item.expense_category) === 'paninda') panindaExpenses += amount;
        else generalExpenses += amount;
    });

    const sales = Math.max(0, Number(elements.salesInput.value) || 0);
    const bilin = Math.max(0, Number(elements.bilinInput.value) || 0);
    const allExpenses = generalExpenses + panindaExpenses;
    const moneyLeft = sales + bilin - generalExpenses;

    elements.generalExpensesText.textContent = formatPeso(generalExpenses);
    elements.panindaExpensesText.textContent = formatPeso(panindaExpenses);
    elements.moneyLeftText.textContent = formatPeso(moneyLeft);
    elements.moneyLeftText.classList.toggle('negative-money', moneyLeft < 0);
    elements.liveTodayTotalText.textContent = `Selected date total: ${formatPeso(allExpenses)}`;
}

function handleReceiptFileChange() {
    const file = elements.receiptImageInput.files?.[0] || null;

    if (!file) {
        clearReceiptSelection();
        return;
    }
    if (!file.type.startsWith('image/')) {
        showToast('Please choose an image file for the receipt.', 'error');
        clearReceiptSelection();
        return;
    }
    if (file.size > MAX_RECEIPT_BYTES) {
        showToast('Receipt image is too large. Choose an image smaller than 12 MB.', 'error');
        clearReceiptSelection();
        return;
    }

    state.selectedReceiptFile = file;

    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = URL.createObjectURL(file);
    elements.receiptPreviewImage.src = state.previewUrl;
    elements.receiptPreviewWrap.classList.remove('hidden');
    setReceiptStatus('Image selected');
}

function clearReceiptSelection() {
    state.selectedReceiptFile = null;
    elements.receiptImageInput.value = '';

    if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = '';
    }

    elements.receiptPreviewImage.removeAttribute('src');
    elements.receiptPreviewWrap.classList.add('hidden');
}

async function uploadReceipt(event) {
    event.preventDefault();
    if (state.busy) return;

    const receiptDate = getPHDateKey();
    const receiptName = elements.receiptNameInput.value.trim();
    const file = state.selectedReceiptFile || elements.receiptImageInput.files?.[0];

    if (!receiptName) {
        showToast('Enter a name for the receipt.', 'error');
        return;
    }
    if (!file) {
        showToast('Choose or take a receipt image first.', 'error');
        return;
    }

    setBusy(true, 'Uploading receipt...');
    setReceiptStatus('Compressing image...');

    let storagePath = '';

    try {
        const imageBlob = await compressReceiptImage(file);
        storagePath = `${getBranchKey()}/${receiptDate}/${Date.now()}-${slugify(receiptName) || 'receipt'}.jpg`;

        setReceiptStatus('Uploading image...');

        const { error: uploadError } = await supabase.storage
            .from(RECEIPT_BUCKET)
            .upload(storagePath, imageBlob, {
                contentType: 'image/jpeg',
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage
            .from(RECEIPT_BUCKET)
            .getPublicUrl(storagePath);

        const receiptUrl = publicData?.publicUrl;
        if (!receiptUrl) throw new Error('Could not create the receipt image URL.');

        const { error: insertError } = await supabase
            .from(EXPENSE_RECEIPTS_TABLE)
            .insert({
                expense_date: receiptDate,
                branch_key: getBranchKey(),
                branch_id: state.currentUser.branch_id || null,
                branch_name: getBranchName(),
                receipt_name: receiptName,
                receipt_url: receiptUrl,
                storage_path: storagePath,
                team_leader_id: state.currentUser.id,
                team_leader_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader'
            });

        if (insertError) throw insertError;

        elements.receiptNameInput.value = '';
        clearReceiptSelection();

        const uploadWeek = getPHWeekStartKey(receiptDate);
        if (uploadWeek === state.selectedWeekStart) {
            await loadWeekReceipts();
            renderTopSummary();
            renderReceipts();
        }

        setReceiptStatus('Uploaded');
        showToast(`Receipt uploaded for ${formatDateWithWeekday(receiptDate)}.`);
    } catch (error) {
        console.error('Receipt upload failed:', error);

        if (storagePath) {
            try {
                await supabase.storage.from(RECEIPT_BUCKET).remove([storagePath]);
            } catch (cleanupError) {
                console.warn('Receipt cleanup failed:', cleanupError);
            }
        }

        setReceiptStatus('Upload failed');
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function deleteReceipt(receiptId) {
    if (state.busy) return;

    const receipt = state.receipts.find(item => item.id === receiptId);
    if (!receipt) return;

    const confirmed = window.confirm(`Delete receipt “${receipt.receipt_name}”?`);
    if (!confirmed) return;

    setBusy(true, 'Deleting receipt...');

    try {
        if (receipt.storage_path) {
            const { error: storageError } = await supabase.storage
                .from(RECEIPT_BUCKET)
                .remove([receipt.storage_path]);

            if (storageError) console.warn('Receipt image removal warning:', storageError);
        }

        const { error } = await supabase
            .from(EXPENSE_RECEIPTS_TABLE)
            .delete()
            .eq('id', receiptId);

        if (error) throw error;

        await loadWeekReceipts();
        renderTopSummary();
        renderReceipts();
        showToast('Receipt deleted.');
    } catch (error) {
        console.error('Receipt delete failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
        setReceiptStatus('Ready');
    }
}

async function compressReceiptImage(file) {
    const image = await loadImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement('canvas');

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(image, 0, 0, width, height);

    if (typeof image.close === 'function') image.close();

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Could not prepare the receipt image.'));
        }, 'image/jpeg', 0.82);
    });
}

async function loadImageBitmap(file) {
    if ('createImageBitmap' in window) return createImageBitmap(file);

    return new Promise((resolve, reject) => {
        const image = new Image();
        const url = URL.createObjectURL(file);

        image.onload = () => {
            URL.revokeObjectURL(url);
            resolve(image);
        };
        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Could not read the receipt image.'));
        };
        image.src = url;
    });
}

function exportSelectedWeekPdf() {
    if (!state.weekRows.length && !state.weekFinancials.length && !state.receipts.length) {
        showToast('There are no expenses, cash-flow values, or receipts to export for this week.', 'error');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        showToast('The PDF library is not ready. Check your internet connection and reload.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

    if (typeof doc.autoTable !== 'function') {
        showToast('The PDF table library is not ready. Reload and try again.', 'error');
        return;
    }

    const weekEnd = addDaysToDateKey(state.selectedWeekStart, 6);
    const generalTotal = sumRowsByCategory(state.weekRows, 'general');
    const panindaTotal = sumRowsByCategory(state.weekRows, 'paninda');
    const allExpenses = generalTotal + panindaTotal;
    const salesTotal = state.weekFinancials.reduce((sum, row) => sum + getFinancialAmount(row.sales), 0);
    const bilinTotal = state.weekFinancials.reduce((sum, row) => sum + getFinancialAmount(row.bilin_sa_paninda), 0);
    const moneyLeft = salesTotal + bilinTotal - generalTotal;
    const dailySummary = buildWeeklyCashFlowSummary();

    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, 297, 31, 'F');
    doc.setTextColor(44, 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("ADRIANO'S WEEKLY EXPENSE AND CASH-FLOW REPORT", 148.5, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(weekEnd)}`, 148.5, 20, { align: 'center' });
    doc.text(`${getBranchName()} | Prepared by ${state.currentUser.full_name}`, 148.5, 25, { align: 'center' });

    doc.autoTable({
        startY: 36,
        head: [['Summary', 'Value', 'Summary', 'Value']],
        body: [
            ['Sales', formatPesoForPdf(salesTotal), 'Bilin sa Paninda', formatPesoForPdf(bilinTotal)],
            ['General Expenses', formatPesoForPdf(generalTotal), 'Paninda Purchases', formatPesoForPdf(panindaTotal)],
            ['All Expenses', formatPesoForPdf(allExpenses), 'Total Money Left', formatPesoForPdf(moneyLeft)],
            ['Expense Entries', String(state.weekRows.length), 'Receipt Attachments', String(state.receipts.length)]
        ],
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.4 },
        headStyles: { fillColor: [76, 52, 37] }
    });

    let y = doc.lastAutoTable.finalY + 6;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Daily Cash Flow', 14, y);

    doc.autoTable({
        startY: y + 3,
        head: [['Date', 'Sales', 'Bilin', 'General', 'Paninda', 'All Expenses', 'Money Left']],
        body: dailySummary.map(item => [
            formatDateWithWeekday(item.date),
            formatPesoForPdf(item.sales),
            formatPesoForPdf(item.bilin),
            formatPesoForPdf(item.general),
            formatPesoForPdf(item.paninda),
            formatPesoForPdf(item.general + item.paninda),
            formatPesoForPdf(item.sales + item.bilin - item.general)
        ]),
        theme: 'striped',
        styles: { fontSize: 7.2, cellPadding: 1.9 },
        headStyles: { fillColor: [118, 81, 54] }
    });

    if (state.weekRows.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Detailed Expenses', 14, y);

        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Category', 'Expense', 'Amount', 'Submitted By', 'Updated']],
            body: [...state.weekRows]
                .sort((a, b) =>
                    String(a.expense_date).localeCompare(String(b.expense_date)) ||
                    String(a.expense_category).localeCompare(String(b.expense_category)) ||
                    String(a.expense_name).localeCompare(String(b.expense_name))
                )
                .map(row => [
                    formatDateWithWeekday(row.expense_date),
                    getCategoryLabel(row.expense_category),
                    row.expense_name || 'Unnamed Expense',
                    formatPesoForPdf(getAmount(row)),
                    row.team_leader_name || 'Team Leader',
                    formatPHDateTime(row.updated_at || row.created_at)
                ]),
            theme: 'grid',
            styles: { fontSize: 7.1, cellPadding: 1.9 },
            headStyles: { fillColor: [76, 52, 37] },
            columnStyles: { 3: { halign: 'right' } }
        });
    }

    if (state.receipts.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Receipt Attachments', 14, y);

        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Receipt Name', 'Uploaded By', 'Uploaded']],
            body: state.receipts.map(receipt => [
                formatDateWithWeekday(receipt.expense_date),
                receipt.receipt_name || 'Receipt',
                receipt.team_leader_name || 'Team Leader',
                formatPHDateTime(receipt.created_at)
            ]),
            theme: 'grid',
            styles: { fontSize: 7.2, cellPadding: 1.9 },
            headStyles: { fillColor: [118, 81, 54] }
        });
    }

    addPdfPageNumbers(doc);
    doc.save(`Adrianos_Expenses_${getSafeFileName(getBranchName())}_${state.selectedWeekStart}_to_${weekEnd}.pdf`);
}

function buildWeeklyCashFlowSummary() {
    const result = [];

    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        const rows = state.weekRows.filter(row => row.expense_date === date);
        const financial = state.weekFinancials.find(row => row.financial_date === date);

        result.push({
            date,
            general: sumRowsByCategory(rows, 'general'),
            paninda: sumRowsByCategory(rows, 'paninda'),
            sales: getFinancialAmount(financial?.sales),
            bilin: getFinancialAmount(financial?.bilin_sa_paninda)
        });
    }

    return result;
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

function updateStaticHeader() {
    const branch = getBranchName();
    const selectedLabel = formatDateLong(state.entryDate || getPHDateKey());

    elements.headerMeta.textContent = `${branch} • ${state.currentUser?.full_name || 'Team Leader'} • Philippine Time`;
    elements.todayDateText.textContent = selectedLabel;
    elements.dailyReportTitle.textContent = `Enter expenses for ${selectedLabel}`;
    elements.reportDateHelp.textContent = state.entryDate === state.currentDate
        ? 'Today in Philippine time.'
        : `Backdated report for ${selectedLabel}.`;
    elements.submitDailyReportBtn.textContent = state.entryDate === state.currentDate
        ? "Submit Today's Report"
        : 'Submit Backdated Report';
    elements.submitHintText.textContent = `Submitting updates the report for ${selectedLabel}.`;
}

function updateWeekRangeText() {
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    elements.weekRangeText.textContent = `${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(endDate)}`;
}

function startDateChangeWatcher() {
    window.setInterval(async () => {
        const latestDate = getPHDateKey();

        if (latestDate === state.currentDate) return;

        const wasEditingToday = state.entryDate === state.currentDate;
        state.currentDate = latestDate;
        elements.reportDatePicker.max = latestDate;

        if (wasEditingToday) {
            state.entryDate = latestDate;
            state.selectedWeekStart = getPHWeekStartKey(latestDate);
            elements.reportDatePicker.value = latestDate;
            elements.weekPicker.value = state.selectedWeekStart;
            await loadAllExpenseData();
            showToast('A new Philippine day started. The page moved to today’s blank report.');
        } else {
            updateStaticHeader();
            showToast('A new Philippine day started. Your selected backdated report remains open.');
        }
    }, 60_000);
}

function setBusy(isBusy, label = '') {
    state.busy = isBusy;

    [
        elements.refreshBtn,
        elements.exportWeeklyPdfBtn,
        elements.submitDailyReportBtn,
        elements.uploadReceiptBtn,
        elements.reportDatePicker,
        elements.weekPicker
    ].filter(Boolean).forEach(element => {
        element.disabled = isBusy;
    });

    if (label) setSaveStatus(label);
}

function setSaveStatus(text) {
    elements.saveStatusText.textContent = text;
}

function setReceiptStatus(text) {
    elements.receiptStatusText.textContent = text;
}

function getFriendlyDataError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();

    if (
        code === '42P01' ||
        code === 'PGRST205' ||
        message.includes('daily_branch_financials') ||
        message.includes('expense_category')
    ) {
        return 'The Paninda and daily financial migration is not installed. Run supabase-paninda-daily-financials.sql in Supabase.';
    }
    if (message.includes('bucket') || message.includes('storage')) {
        return 'Receipt storage is not ready. Run the receipt storage migration and reload the page.';
    }
    if (message.includes('row-level security') || code === '42501') {
        return 'Supabase permissions blocked the request. Run the included SQL migration and reload the schema.';
    }

    return error?.message || 'The expense request failed. Please try again.';
}

function getBranchName() {
    return state.currentBranch?.name || 'Unassigned Branch';
}

function getBranchKey() {
    return state.currentUser?.branch_id ? `branch_${state.currentUser.branch_id}` : 'unassigned';
}

function normalizeExpenseCategory(value) {
    return String(value || '').toLowerCase() === 'paninda' ? 'paninda' : 'general';
}

function getCategoryLabel(value) {
    return normalizeExpenseCategory(value) === 'paninda' ? 'Paninda' : 'General';
}

function sumRowsByCategory(rows, category) {
    return rows
        .filter(row => normalizeExpenseCategory(row.expense_category) === category)
        .reduce((sum, row) => sum + getAmount(row), 0);
}

function getAmount(row) {
    return Math.max(0, Number(row?.amount) || 0);
}

function getFinancialAmount(value) {
    return Math.max(0, Number(value) || 0);
}

function formatInputAmount(value) {
    const amount = getFinancialAmount(value);
    return amount ? String(amount) : '';
}

function sanitizeMoneyInput(value) {
    const text = String(value || '').replace(/[^\d.]/g, '');
    const parts = text.split('.');
    return parts.length <= 1 ? parts[0] : `${parts.shift()}.${parts.join('').slice(0, 2)}`;
}

function getPHDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: PH_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
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
    return new Intl.DateTimeFormat('en-PH', {
        year: 'numeric',
        month: 'long',
        day: '2-digit'
    }).format(dateKeyToUTC(dateKey));
}

function formatDateWithWeekday(dateKey) {
    return new Intl.DateTimeFormat('en-PH', {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
        year: 'numeric'
    }).format(dateKeyToUTC(dateKey));
}

function formatPHDateTime(value) {
    if (!value) return 'N/A';

    try {
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: PH_TIMEZONE,
            month: 'short',
            day: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(value));
    } catch {
        return String(value);
    }
}

function formatPeso(value) {
    return Number(value || 0).toLocaleString('en-PH', {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatPesoForPdf(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function slugify(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 100);
}

function getSafeFileName(value) {
    return String(value || 'branch')
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '');
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
    sessionStorage.removeItem('adrianosTlLoginTime');
}
