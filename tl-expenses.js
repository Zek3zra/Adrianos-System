import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const EXPENSE_NAMES_TABLE = 'expense_names';
const DAILY_EXPENSES_TABLE = 'daily_expenses';
const DAILY_FINANCIALS_TABLE = 'daily_branch_financials';
const DAILY_OTHER_FUNDS_TABLE = 'daily_other_funds';
const TAKEN_FOOD_LOGS_TABLE = 'taken_food_logs';
const EXPENSE_RECEIPTS_TABLE = 'expense_receipts';
const RECEIPT_BUCKET = 'expense-receipts';
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

const state = {
    currentUser: null,
    currentBranch: null,
    currentDate: '',
    entryDate: '',
    selectedWeekStart: '',
    draftItems: [],
    dateRows: [],
    weekRows: [],
    dateFinancial: null,
    weekFinancials: [],
    draftOtherFunds: [],
    dateOtherFunds: [],
    weekOtherFunds: [],
    draftTakenFoods: [],
    dateTakenFoods: [],
    weekTakenFoods: [],
    receipts: [],
    expenseSearch: '',
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
        'salesInput', 'bilinInput', 'generalExpensesText', 'panindaExpensesText', 'otherFundsTotalText',
        'moneyLeftText', 'addOtherFundForm', 'newOtherFundNameInput', 'newOtherFundAmountInput',
        'otherFundsList', 'otherFundsCountText', 'selectedOtherFundsText', 'weekPicker', 'weekRangeText',
        'refreshBtn', 'exportWeeklyPdfBtn', 'todayTotalText', 'todayDateText', 'weekTotalText',
        'weekEntriesText', 'todayEntriesText', 'takenFoodCountText', 'receiptCountText',
        'dailyReportTitle', 'saveStatusText', 'expenseSearchInput', 'expenseSearchCountText',
        'generalNamesCountText', 'panindaNamesCountText', 'addExpenseForm', 'newExpenseNameInput',
        'addPanindaForm', 'newPanindaNameInput', 'generalExpenseList', 'panindaExpenseList',
        'addTakenFoodForm', 'personGroupNameInput', 'menuItemsInput', 'takenFoodList',
        'takenFoodStatusText', 'weeklyOtherFundsList', 'weeklyTakenFoodList', 'liveTodayTotalText',
        'submitHintText', 'submitDailyReportBtn', 'dailySummaryList', 'expenseSummaryList',
        'weeklyDetailsBody', 'weeklyDetailsCards', 'receiptStatusText',
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
    elements.addExpenseForm.addEventListener('submit', event => addDailyDraftItem(event, 'general'));
    elements.addPanindaForm.addEventListener('submit', event => addDailyDraftItem(event, 'paninda'));
    elements.addOtherFundForm.addEventListener('submit', addOtherFundDraft);
    elements.addTakenFoodForm.addEventListener('submit', addTakenFoodDraft);
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

    elements.otherFundsList.addEventListener('input', handleOtherFundInput);
    elements.otherFundsList.addEventListener('blur', handleOtherFundBlur, true);
    elements.otherFundsList.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-other-fund-id]');
        if (button) removeOtherFundDraft(button.dataset.removeOtherFundId);
    });

    elements.takenFoodList.addEventListener('input', handleTakenFoodInput);
    elements.takenFoodList.addEventListener('click', event => {
        const button = event.target.closest('[data-remove-taken-food-id]');
        if (button) removeTakenFoodDraft(button.dataset.removeTakenFoodId);
    });

    [elements.salesInput, elements.bilinInput].forEach(input => {
        input.addEventListener('input', () => {
            input.value = sanitizeMoneyInput(input.value);
            updateLiveCashFlow();
            setSaveStatus('Unsaved changes');
        });
        input.addEventListener('blur', () => {
            input.value = formatEditableMoney(input.value);
            updateLiveCashFlow();
        });
    });

    elements.newOtherFundAmountInput.addEventListener('input', event => {
        event.target.value = sanitizeMoneyInput(event.target.value);
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
    state.expenseSearch = '';
    elements.expenseSearchInput.value = '';
    state.selectedWeekStart = getPHWeekStartKey(selectedDate);
    elements.weekPicker.value = state.selectedWeekStart;

    setBusy(true, 'Loading selected date...');
    try {
        await Promise.all([
            loadDateRows(),
            loadDateFinancial(),
            loadDateOtherFunds(),
            loadDateTakenFoods(),
            loadWeekRows(),
            loadWeekFinancials(),
            loadWeekOtherFunds(),
            loadWeekTakenFoods(),
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
        await Promise.all([
            loadWeekRows(),
            loadWeekFinancials(),
            loadWeekOtherFunds(),
            loadWeekTakenFoods(),
            loadWeekReceipts()
        ]);
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
    const amountInput = event.target.closest('.expense-amount-input[data-draft-id]');
    if (amountInput) {
        amountInput.value = sanitizeMoneyInput(amountInput.value);
        const item = findDraftItem(amountInput.dataset.draftId);
        if (item) item.amount = Math.max(0, Number(amountInput.value) || 0);
        updateLiveCashFlow();
        setSaveStatus('Unsaved changes');
        return;
    }

    const nameInput = event.target.closest('.expense-item-name-input[data-draft-id]');
    if (!nameInput) return;

    const item = findDraftItem(nameInput.dataset.draftId);
    if (item) item.name = nameInput.value;
    setSaveStatus('Unsaved changes');
}

function handleExpenseAmountBlur(event) {
    const amountInput = event.target.closest('.expense-amount-input[data-draft-id]');
    if (amountInput && amountInput.value) {
        amountInput.value = Number(amountInput.value).toFixed(2).replace(/\.00$/, '');
        const item = findDraftItem(amountInput.dataset.draftId);
        if (item) item.amount = Math.max(0, Number(amountInput.value) || 0);
        updateLiveCashFlow();
        return;
    }

    const nameInput = event.target.closest('.expense-item-name-input[data-draft-id]');
    if (!nameInput) return;

    const item = findDraftItem(nameInput.dataset.draftId);
    if (item) item.name = nameInput.value.trim();
    nameInput.value = item?.name || '';
    renderExpenseInputs();
}

function handleExpenseListClick(event) {
    const button = event.target.closest('[data-remove-draft-id]');
    if (!button) return;
    removeDailyDraftItem(button.dataset.removeDraftId);
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
            loadDateRows(),
            loadDateFinancial(),
            loadDateOtherFunds(),
            loadDateTakenFoods(),
            loadWeekRows(),
            loadWeekFinancials(),
            loadWeekOtherFunds(),
            loadWeekTakenFoods(),
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

    state.draftItems = state.dateRows.map(row => ({
        localId: `saved-${row.id}`,
        rowId: row.id,
        originalExpenseId: row.expense_id,
        name: row.expense_name || '',
        category: normalizeExpenseCategory(row.expense_category),
        amount: getAmount(row)
    }));
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


async function loadDateOtherFunds() {
    const { data, error } = await supabase
        .from(DAILY_OTHER_FUNDS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('fund_date', state.entryDate)
        .order('created_at', { ascending: true });

    if (error) throw error;

    state.dateOtherFunds = (data || []).filter(row => getFinancialAmount(row.amount) > 0);
    state.draftOtherFunds = state.dateOtherFunds.map(row => ({
        localId: `saved-other-${row.id}`,
        rowId: row.id,
        name: row.fund_name || '',
        amount: getFinancialAmount(row.amount)
    }));
}

async function loadWeekOtherFunds() {
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const { data, error } = await supabase
        .from(DAILY_OTHER_FUNDS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .gte('fund_date', state.selectedWeekStart)
        .lte('fund_date', endDate)
        .order('fund_date', { ascending: true })
        .order('created_at', { ascending: true });

    if (error) throw error;
    state.weekOtherFunds = (data || []).filter(row => getFinancialAmount(row.amount) > 0);
}

async function loadDateTakenFoods() {
    const { data, error } = await supabase
        .from(TAKEN_FOOD_LOGS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('log_date', state.entryDate)
        .order('created_at', { ascending: true });

    if (error) throw error;

    state.dateTakenFoods = data || [];
    state.draftTakenFoods = state.dateTakenFoods.map(row => ({
        localId: `saved-food-${row.id}`,
        rowId: row.id,
        personGroupName: row.person_group_name || '',
        menuItems: row.menu_items || ''
    }));
}

async function loadWeekTakenFoods() {
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const { data, error } = await supabase
        .from(TAKEN_FOOD_LOGS_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .gte('log_date', state.selectedWeekStart)
        .lte('log_date', endDate)
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });

    if (error) throw error;
    state.weekTakenFoods = data || [];
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
    renderOtherFunds();
    renderTakenFoods();
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
    const matchingItems = state.draftItems.filter(item =>
        !query || String(item.name || '').toLowerCase().includes(query)
    );

    const generalItems = matchingItems.filter(item => item.category === 'general');
    const panindaItems = matchingItems.filter(item => item.category === 'paninda');

    elements.generalExpenseList.innerHTML = generalItems.length
        ? generalItems.map(renderExpenseRow).join('')
        : `<div class="empty-state">${query ? `No general expense on ${escapeHTML(formatDateLong(state.entryDate))} matches “${escapeHTML(elements.expenseSearchInput.value.trim())}”.` : `No general expenses entered for ${escapeHTML(formatDateLong(state.entryDate))}.`}</div>`;

    elements.panindaExpenseList.innerHTML = panindaItems.length
        ? panindaItems.map(renderExpenseRow).join('')
        : `<div class="empty-state">${query ? `No Paninda item on ${escapeHTML(formatDateLong(state.entryDate))} matches “${escapeHTML(elements.expenseSearchInput.value.trim())}”.` : `No Paninda items entered for ${escapeHTML(formatDateLong(state.entryDate))}.`}</div>`;

    const totalGeneral = state.draftItems.filter(item => item.category === 'general').length;
    const totalPaninda = state.draftItems.filter(item => item.category === 'paninda').length;

    elements.generalNamesCountText.textContent = `${totalGeneral} item${totalGeneral === 1 ? '' : 's'} this date`;
    elements.panindaNamesCountText.textContent = `${totalPaninda} item${totalPaninda === 1 ? '' : 's'} this date`;
    elements.expenseSearchCountText.textContent = query
        ? `${matchingItems.length} of ${state.draftItems.length} selected-date items shown for “${elements.expenseSearchInput.value.trim()}”`
        : `${state.draftItems.length} item${state.draftItems.length === 1 ? '' : 's'} entered for ${formatDateLong(state.entryDate)}`;
}

function renderExpenseRow(item) {
    const categoryLabel = item.category === 'paninda' ? 'Paninda item' : 'General expense';
    const savedLabel = item.rowId
        ? `Previously logged for ${formatDateLong(state.entryDate)}. Edit the name or amount, then submit again.`
        : `New item for ${formatDateLong(state.entryDate)}. It will not appear on other dates.`;

    return `
        <div class="expense-row ${item.category === 'paninda' ? 'paninda-row' : ''}" data-draft-id="${escapeHTML(item.localId)}">
            <div class="expense-name daily-item-name-wrap">
                <span class="expense-type-label">${escapeHTML(categoryLabel)}</span>
                <input
                    class="expense-item-name-input"
                    type="text"
                    maxlength="120"
                    autocomplete="off"
                    data-draft-id="${escapeHTML(item.localId)}"
                    value="${escapeHTML(item.name)}"
                    placeholder="Specific item or expense"
                    aria-label="Expense item name for ${escapeHTML(formatDateLong(state.entryDate))}"
                >
                <span>${escapeHTML(savedLabel)}</span>
            </div>
            <div class="amount-wrap">
                <input
                    class="expense-amount-input"
                    type="text"
                    inputmode="decimal"
                    autocomplete="off"
                    data-draft-id="${escapeHTML(item.localId)}"
                    value="${item.amount ? escapeHTML(String(item.amount)) : ''}"
                    placeholder="0.00"
                    aria-label="Amount for ${escapeHTML(item.name || categoryLabel)} on ${escapeHTML(formatDateLong(state.entryDate))}"
                >
            </div>
            <button type="button" class="btn btn-link-danger remove-expense-btn" data-remove-draft-id="${escapeHTML(item.localId)}">Remove from Date</button>
        </div>
    `;
}

function renderTopSummary() {
    const selectedTotal = state.dateRows.reduce((sum, row) => sum + getAmount(row), 0);
    const selectedOtherFunds = state.dateOtherFunds.reduce((sum, row) => sum + getFinancialAmount(row.amount), 0);
    const weekTotal = state.weekRows.reduce((sum, row) => sum + getAmount(row), 0);

    elements.todayTotalText.textContent = formatPeso(selectedTotal);
    elements.todayDateText.textContent = formatDateLong(state.entryDate);
    elements.selectedOtherFundsText.textContent = formatPeso(selectedOtherFunds);
    elements.weekTotalText.textContent = formatPeso(weekTotal);
    elements.weekEntriesText.textContent = `${state.weekRows.length} entr${state.weekRows.length === 1 ? 'y' : 'ies'}`;
    elements.todayEntriesText.textContent = String(state.dateRows.length);
    elements.takenFoodCountText.textContent = String(state.dateTakenFoods.length);
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
            bilin: 0,
            others: 0,
            foodLogs: 0
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

    state.weekOtherFunds.forEach(row => {
        const day = dailyMap.get(row.fund_date);
        if (day) day.others += getFinancialAmount(row.amount);
    });

    state.weekTakenFoods.forEach(row => {
        const day = dailyMap.get(row.log_date);
        if (day) day.foodLogs += 1;
    });

    elements.dailySummaryList.innerHTML = [...dailyMap.values()].map(item => {
        const allExpenses = item.general + item.paninda;
        const availableFunds = item.sales + item.bilin + item.others;
        const moneyLeft = availableFunds - item.general;

        return `
            <div class="daily-financial-summary-row">
                <div class="daily-financial-date">
                    <strong>${escapeHTML(formatDateWithWeekday(item.dateKey))}</strong>
                    <span>${item.count} expense entr${item.count === 1 ? 'y' : 'ies'} • ${item.foodLogs} food log${item.foodLogs === 1 ? '' : 's'}</span>
                </div>
                <div class="daily-financial-values">
                    <span>Sales + Bilin + Others <strong>${escapeHTML(formatPeso(availableFunds))}</strong></span>
                    <span>Others <strong>${escapeHTML(formatPeso(item.others))}</strong></span>
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
                    <span class="expense-type-label">${escapeHTML(getCategoryLabel(item.category))}</span>
                    <strong>${escapeHTML(item.name)}</strong><br>
                    <span>${item.count} daily entr${item.count === 1 ? 'y' : 'ies'}</span>
                </div>
                <strong>${escapeHTML(formatPeso(item.total))}</strong>
            </div>
        `).join('')
        : '<div class="empty-state">No matching positive expense values for this week.</div>';

    const rows = [...state.weekRows]
        .filter(row => !state.expenseSearch || String(row.expense_name || '').toLowerCase().includes(state.expenseSearch))
        .sort((a, b) =>
            String(b.expense_date).localeCompare(String(a.expense_date)) ||
            String(a.expense_category).localeCompare(String(b.expense_category)) ||
            String(a.expense_name).localeCompare(String(b.expense_name))
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
                <div class="mobile-record-head">
                    <div>
                        <span class="expense-type-label">${escapeHTML(getCategoryLabel(row.expense_category))}</span>
                        <strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong>
                    </div>
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

    elements.weeklyOtherFundsList.innerHTML = state.weekOtherFunds.length
        ? [...state.weekOtherFunds]
            .sort((a, b) => String(b.fund_date).localeCompare(String(a.fund_date)) || String(a.fund_name).localeCompare(String(b.fund_name)))
            .map(row => `
                <div class="summary-list-row">
                    <div><strong>${escapeHTML(row.fund_name || 'Other fund')}</strong><br><span>${escapeHTML(formatDateWithWeekday(row.fund_date))}</span></div>
                    <strong>${escapeHTML(formatPeso(getFinancialAmount(row.amount)))}</strong>
                </div>
            `).join('')
        : '<div class="empty-state">No Other funds logged for this week.</div>';

    elements.weeklyTakenFoodList.innerHTML = state.weekTakenFoods.length
        ? state.weekTakenFoods.map(row => `
            <article class="taken-food-week-card">
                <div class="taken-food-week-head">
                    <div><strong>${escapeHTML(row.person_group_name || 'Unnamed person/group')}</strong><small>${escapeHTML(formatDateWithWeekday(row.log_date))}</small></div>
                </div>
                <div class="taken-food-menu-text">${escapeHTML(row.menu_items || 'No menu items recorded')}</div>
                <small>Logged by ${escapeHTML(row.team_leader_name || 'Team Leader')} • No cash or inventory effect</small>
            </article>
        `).join('')
        : '<div class="empty-state">No taken-food records for this week.</div>';
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


function renderOtherFunds() {
    const total = state.draftOtherFunds.reduce((sum, item) => sum + getFinancialAmount(item.amount), 0);
    elements.otherFundsCountText.textContent = `${state.draftOtherFunds.length} item${state.draftOtherFunds.length === 1 ? '' : 's'} this date`;
    elements.otherFundsTotalText.textContent = formatPeso(total);
    elements.selectedOtherFundsText.textContent = formatPeso(total);

    elements.otherFundsList.innerHTML = state.draftOtherFunds.length
        ? state.draftOtherFunds.map(item => `
            <article class="other-fund-row" data-other-fund-id="${escapeHTML(item.localId)}">
                <div class="input-group">
                    <label>Other fund name</label>
                    <input class="other-fund-name-input" type="text" maxlength="120" autocomplete="off"
                        data-other-fund-id="${escapeHTML(item.localId)}" value="${escapeHTML(item.name)}"
                        placeholder="Name of additional money">
                    <span class="other-fund-meta">${item.rowId ? `Previously logged for ${escapeHTML(formatDateLong(state.entryDate))}.` : 'New item for selected date.'}</span>
                </div>
                <div class="input-group">
                    <label>Value</label>
                    <div class="money-input-wrap">
                        <input class="other-fund-amount-input" type="text" inputmode="decimal" autocomplete="off"
                            data-other-fund-id="${escapeHTML(item.localId)}"
                            value="${item.amount ? escapeHTML(formatPlainDecimal(item.amount)) : ''}" placeholder="0.00">
                    </div>
                </div>
                <button type="button" class="btn other-fund-remove-btn" data-remove-other-fund-id="${escapeHTML(item.localId)}">Remove</button>
            </article>
        `).join('')
        : '<div class="empty-state">No Other funds entered for this date.</div>';
}

function addOtherFundDraft(event) {
    event.preventDefault();
    if (state.busy) return;

    const name = elements.newOtherFundNameInput.value.trim();
    const amount = parseMoneyInput(elements.newOtherFundAmountInput.value);

    if (!slugify(name)) {
        showToast('Enter a specific name for the Other fund.', 'error');
        return;
    }
    if (amount <= 0) {
        showToast('Enter an Other fund value greater than zero. Decimals such as 109.23 are accepted.', 'error');
        return;
    }
    if (state.draftOtherFunds.some(item => String(item.name).trim().toLowerCase() === name.toLowerCase())) {
        showToast(`“${name}” is already entered under Others for this date.`, 'error');
        return;
    }

    state.draftOtherFunds.push({
        localId: `other-${makeDraftId()}`,
        rowId: null,
        name,
        amount
    });
    elements.newOtherFundNameInput.value = '';
    elements.newOtherFundAmountInput.value = '';
    renderOtherFunds();
    updateLiveCashFlow();
    setSaveStatus('Unsaved changes');
}

function handleOtherFundInput(event) {
    const id = event.target.dataset.otherFundId;
    if (!id) return;
    const item = state.draftOtherFunds.find(entry => entry.localId === id);
    if (!item) return;

    if (event.target.classList.contains('other-fund-name-input')) {
        item.name = event.target.value;
    } else if (event.target.classList.contains('other-fund-amount-input')) {
        event.target.value = sanitizeMoneyInput(event.target.value);
        item.amount = parseMoneyInput(event.target.value);
        renderOtherFundTotalsOnly();
    }
    setSaveStatus('Unsaved changes');
}

function handleOtherFundBlur(event) {
    if (!event.target.classList.contains('other-fund-amount-input')) return;
    event.target.value = formatEditableMoney(event.target.value);
    const item = state.draftOtherFunds.find(entry => entry.localId === event.target.dataset.otherFundId);
    if (item) item.amount = parseMoneyInput(event.target.value);
    renderOtherFundTotalsOnly();
}

function renderOtherFundTotalsOnly() {
    const total = state.draftOtherFunds.reduce((sum, item) => sum + getFinancialAmount(item.amount), 0);
    elements.otherFundsTotalText.textContent = formatPeso(total);
    elements.selectedOtherFundsText.textContent = formatPeso(total);
    updateLiveCashFlow();
}

function removeOtherFundDraft(localId) {
    const item = state.draftOtherFunds.find(entry => entry.localId === localId);
    if (!item || state.busy) return;
    if (!window.confirm(`Remove “${item.name || 'Other fund'}” from ${formatDateLong(state.entryDate)}?`)) return;
    state.draftOtherFunds = state.draftOtherFunds.filter(entry => entry.localId !== localId);
    renderOtherFunds();
    updateLiveCashFlow();
    setSaveStatus('Unsaved changes');
}

function renderTakenFoods() {
    elements.takenFoodStatusText.textContent = `${state.draftTakenFoods.length} log${state.draftTakenFoods.length === 1 ? '' : 's'} this date`;
    elements.takenFoodCountText.textContent = String(state.draftTakenFoods.length);

    elements.takenFoodList.innerHTML = state.draftTakenFoods.length
        ? state.draftTakenFoods.map(item => `
            <article class="taken-food-item" data-taken-food-id="${escapeHTML(item.localId)}">
                <div class="input-group">
                    <label>Person or group</label>
                    <input class="taken-food-person-input" type="text" maxlength="160" autocomplete="off"
                        data-taken-food-id="${escapeHTML(item.localId)}"
                        value="${escapeHTML(item.personGroupName)}" placeholder="Person or group name">
                    <small>${item.rowId ? 'Previously logged for this date.' : 'New selected-date record.'}</small>
                </div>
                <div class="input-group">
                    <label>Menu items taken</label>
                    <textarea class="taken-food-menu-input" maxlength="1200" rows="3"
                        data-taken-food-id="${escapeHTML(item.localId)}"
                        placeholder="Enter menu names only">${escapeHTML(item.menuItems)}</textarea>
                </div>
                <button type="button" class="btn taken-food-remove-btn" data-remove-taken-food-id="${escapeHTML(item.localId)}">Remove Log</button>
            </article>
        `).join('')
        : '<div class="empty-state">No taken-food records entered for this date.</div>';
}

function addTakenFoodDraft(event) {
    event.preventDefault();
    if (state.busy) return;

    const personGroupName = elements.personGroupNameInput.value.trim();
    const menuItems = elements.menuItemsInput.value.trim();

    if (!personGroupName || !menuItems) {
        showToast('Enter both the person/group name and the menu items taken.', 'error');
        return;
    }

    state.draftTakenFoods.push({
        localId: `food-${makeDraftId()}`,
        rowId: null,
        personGroupName,
        menuItems
    });

    elements.personGroupNameInput.value = '';
    elements.menuItemsInput.value = '';
    renderTakenFoods();
    setSaveStatus('Unsaved changes');
}

function handleTakenFoodInput(event) {
    const id = event.target.dataset.takenFoodId;
    if (!id) return;
    const item = state.draftTakenFoods.find(entry => entry.localId === id);
    if (!item) return;

    if (event.target.classList.contains('taken-food-person-input')) item.personGroupName = event.target.value;
    if (event.target.classList.contains('taken-food-menu-input')) item.menuItems = event.target.value;
    setSaveStatus('Unsaved changes');
}

function removeTakenFoodDraft(localId) {
    const item = state.draftTakenFoods.find(entry => entry.localId === localId);
    if (!item || state.busy) return;
    if (!window.confirm(`Remove the food log for “${item.personGroupName || 'this person/group'}” from ${formatDateLong(state.entryDate)}?`)) return;
    state.draftTakenFoods = state.draftTakenFoods.filter(entry => entry.localId !== localId);
    renderTakenFoods();
    setSaveStatus('Unsaved changes');
}

function addDailyDraftItem(event, category) {
    event.preventDefault();
    if (state.busy) return;

    const isPaninda = category === 'paninda';
    const input = isPaninda ? elements.newPanindaNameInput : elements.newExpenseNameInput;
    const name = input.value.trim();

    if (!slugify(name)) {
        showToast(`Please enter a valid ${isPaninda ? 'Paninda item' : 'expense'} name.`, 'error');
        return;
    }

    const duplicate = state.draftItems.some(item =>
        item.category === category &&
        String(item.name || '').trim().toLowerCase() === name.toLowerCase()
    );

    if (duplicate) {
        showToast(`“${name}” is already entered under ${isPaninda ? 'Paninda' : 'General Expenses'} for this date.`, 'error');
        return;
    }

    const localId = makeDraftId();
    state.draftItems.push({
        localId,
        rowId: null,
        originalExpenseId: null,
        name,
        category: isPaninda ? 'paninda' : 'general',
        amount: 0
    });

    input.value = '';
    state.expenseSearch = '';
    elements.expenseSearchInput.value = '';
    renderExpenseInputs();
    updateLiveCashFlow();
    setSaveStatus('Unsaved changes');

    window.requestAnimationFrame(() => {
        const amountInput = document.querySelector(`.expense-amount-input[data-draft-id="${CSS.escape(localId)}"]`);
        amountInput?.focus();
    });
}

function removeDailyDraftItem(localId) {
    const item = findDraftItem(localId);
    if (!item || state.busy) return;

    const message = item.rowId
        ? `Remove “${item.name}” from ${formatDateLong(state.entryDate)}? Submit the report to permanently delete it from that date.`
        : `Remove “${item.name}” from this date?`;

    if (!window.confirm(message)) return;

    state.draftItems = state.draftItems.filter(draft => draft.localId !== localId);
    renderExpenseInputs();
    updateLiveCashFlow();
    setSaveStatus('Unsaved changes');
}

async function resolveExpenseTemplate(name, category) {
    const cleanName = String(name || '').trim();
    const baseKey = slugify(cleanName);
    const expenseKey = category === 'paninda' ? `paninda-${baseKey}` : baseKey;

    const { data: existing, error: findError } = await supabase
        .from(EXPENSE_NAMES_TABLE)
        .select('id')
        .eq('branch_key', getBranchKey())
        .eq('expense_key', expenseKey)
        .maybeSingle();

    if (findError) throw findError;

    if (existing?.id) {
        const { error: updateError } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .update({
                expense_name: cleanName,
                expense_category: category,
                is_active: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', existing.id);
        if (updateError) throw updateError;
        return existing.id;
    }

    const { data: inserted, error: insertError } = await supabase
        .from(EXPENSE_NAMES_TABLE)
        .insert({
            branch_key: getBranchKey(),
            branch_id: state.currentUser.branch_id || null,
            expense_name: cleanName,
            expense_key: expenseKey,
            expense_category: category,
            created_by: state.currentUser.id,
            created_by_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader',
            is_active: false
        })
        .select('id')
        .single();

    if (insertError) throw insertError;
    return inserted.id;
}

async function submitSelectedDateReport() {
    if (state.busy) return;

    const today = getPHDateKey();
    if (!state.entryDate || state.entryDate > today) {
        showToast('Choose today or an earlier Philippine date.', 'error');
        return;
    }

    const normalizedItems = state.draftItems.map(item => ({
        ...item,
        name: String(item.name || '').trim(),
        category: normalizeExpenseCategory(item.category),
        amount: getFinancialAmount(item.amount)
    }));

    const invalidItem = normalizedItems.find(item => item.amount > 0 && !slugify(item.name));
    if (invalidItem) {
        showToast('Every expense with an amount must have a specific item name.', 'error');
        return;
    }

    const seen = new Set();
    for (const item of normalizedItems.filter(item => item.amount > 0)) {
        const key = `${item.category}:${item.name.toLowerCase()}`;
        if (seen.has(key)) {
            showToast(`Duplicate item found: “${item.name}”. Keep one entry and combine the amount.`, 'error');
            return;
        }
        seen.add(key);
    }

    const normalizedOthers = state.draftOtherFunds
        .map(item => ({
            ...item,
            name: String(item.name || '').trim(),
            amount: getFinancialAmount(item.amount)
        }))
        .filter(item => item.name || item.amount > 0);

    if (normalizedOthers.some(item => !slugify(item.name) || item.amount <= 0)) {
        showToast('Each Other fund must have a name and a value greater than zero.', 'error');
        return;
    }

    const otherNames = new Set();
    for (const item of normalizedOthers) {
        const key = item.name.toLowerCase();
        if (otherNames.has(key)) {
            showToast(`Duplicate Other fund found: “${item.name}”.`, 'error');
            return;
        }
        otherNames.add(key);
    }

    const normalizedTakenFoods = state.draftTakenFoods
        .map(item => ({
            ...item,
            personGroupName: String(item.personGroupName || '').trim(),
            menuItems: String(item.menuItems || '').trim()
        }))
        .filter(item => item.personGroupName || item.menuItems);

    if (normalizedTakenFoods.some(item => !item.personGroupName || !item.menuItems)) {
        showToast('Each taken-food log must include both a person/group and the menu items taken.', 'error');
        return;
    }

    setBusy(true, 'Submitting selected date...');

    try {
        const nowIso = new Date().toISOString();
        const leaderName = state.currentUser.full_name || state.currentUser.username || 'Team Leader';
        const baseBranch = {
            branch_key: getBranchKey(),
            branch_id: state.currentUser.branch_id || null,
            branch_name: getBranchName(),
            team_leader_id: state.currentUser.id,
            team_leader_name: leaderName,
            updated_at: nowIso
        };

        const keptExpenseIds = new Set();

        for (const item of normalizedItems.filter(item => item.amount > 0)) {
            const expenseId = await resolveExpenseTemplate(item.name, item.category);
            keptExpenseIds.add(expenseId);

            const { error } = await supabase
                .from(DAILY_EXPENSES_TABLE)
                .upsert({
                    expense_date: state.entryDate,
                    ...baseBranch,
                    expense_id: expenseId,
                    expense_name: item.name,
                    expense_category: item.category,
                    amount: item.amount
                }, { onConflict: 'expense_date,branch_key,expense_id' });

            if (error) throw error;
        }

        for (const staleRow of state.dateRows.filter(row => !keptExpenseIds.has(row.expense_id))) {
            const { error } = await supabase.from(DAILY_EXPENSES_TABLE).delete().eq('id', staleRow.id);
            if (error) throw error;
        }

        const { error: financialError } = await supabase
            .from(DAILY_FINANCIALS_TABLE)
            .upsert({
                financial_date: state.entryDate,
                ...baseBranch,
                sales: parseMoneyInput(elements.salesInput.value),
                bilin_sa_paninda: parseMoneyInput(elements.bilinInput.value)
            }, { onConflict: 'financial_date,branch_key' });

        if (financialError) throw financialError;

        const keptOtherIds = new Set();
        for (const item of normalizedOthers) {
            const payload = {
                fund_date: state.entryDate,
                ...baseBranch,
                fund_name: item.name,
                amount: item.amount
            };

            if (item.rowId) {
                keptOtherIds.add(item.rowId);
                const { error } = await supabase.from(DAILY_OTHER_FUNDS_TABLE).update(payload).eq('id', item.rowId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from(DAILY_OTHER_FUNDS_TABLE).insert(payload).select('id').single();
                if (error) throw error;
                keptOtherIds.add(data.id);
            }
        }
        for (const staleRow of state.dateOtherFunds.filter(row => !keptOtherIds.has(row.id))) {
            const { error } = await supabase.from(DAILY_OTHER_FUNDS_TABLE).delete().eq('id', staleRow.id);
            if (error) throw error;
        }

        const keptFoodIds = new Set();
        for (const item of normalizedTakenFoods) {
            const payload = {
                log_date: state.entryDate,
                ...baseBranch,
                person_group_name: item.personGroupName,
                menu_items: item.menuItems
            };

            if (item.rowId) {
                keptFoodIds.add(item.rowId);
                const { error } = await supabase.from(TAKEN_FOOD_LOGS_TABLE).update(payload).eq('id', item.rowId);
                if (error) throw error;
            } else {
                const { data, error } = await supabase.from(TAKEN_FOOD_LOGS_TABLE).insert(payload).select('id').single();
                if (error) throw error;
                keptFoodIds.add(data.id);
            }
        }
        for (const staleRow of state.dateTakenFoods.filter(row => !keptFoodIds.has(row.id))) {
            const { error } = await supabase.from(TAKEN_FOOD_LOGS_TABLE).delete().eq('id', staleRow.id);
            if (error) throw error;
        }

        await Promise.all([
            loadDateRows(),
            loadDateFinancial(),
            loadDateOtherFunds(),
            loadDateTakenFoods(),
            loadWeekRows(),
            loadWeekFinancials(),
            loadWeekOtherFunds(),
            loadWeekTakenFoods()
        ]);

        renderAll();
        setSaveStatus('Submitted');
        showToast(`Daily report saved for ${formatDateWithWeekday(state.entryDate)}.`);
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

    state.draftItems.forEach(item => {
        const amount = getFinancialAmount(item.amount);
        if (normalizeExpenseCategory(item.category) === 'paninda') panindaExpenses += amount;
        else generalExpenses += amount;
    });

    const sales = parseMoneyInput(elements.salesInput.value);
    const bilin = parseMoneyInput(elements.bilinInput.value);
    const others = state.draftOtherFunds.reduce((sum, item) => sum + getFinancialAmount(item.amount), 0);
    const allExpenses = generalExpenses + panindaExpenses;
    const moneyLeft = sales + bilin + others - generalExpenses;

    elements.generalExpensesText.textContent = formatPeso(generalExpenses);
    elements.panindaExpensesText.textContent = formatPeso(panindaExpenses);
    elements.otherFundsTotalText.textContent = formatPeso(others);
    elements.selectedOtherFundsText.textContent = formatPeso(others);
    elements.moneyLeftText.textContent = formatPeso(moneyLeft);
    elements.moneyLeftText.classList.toggle('negative-money', moneyLeft < 0);
    elements.liveTodayTotalText.textContent = `Selected date total expenses: ${formatPeso(allExpenses)}`;
}

function findDraftItem(localId) {
    return state.draftItems.find(item => item.localId === localId) || null;
}

function makeDraftId() {
    if (globalThis.crypto?.randomUUID) return `draft-${globalThis.crypto.randomUUID()}`;
    return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
    if (!state.weekRows.length && !state.weekFinancials.length && !state.weekOtherFunds.length && !state.weekTakenFoods.length && !state.receipts.length) {
        showToast('There are no weekly records to export.', 'error');
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
    const othersTotal = state.weekOtherFunds.reduce((sum, row) => sum + getFinancialAmount(row.amount), 0);
    const moneyLeft = salesTotal + bilinTotal + othersTotal - generalTotal;
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
            ['Other Funds', formatPesoForPdf(othersTotal), 'General Expenses', formatPesoForPdf(generalTotal)],
            ['Paninda Purchases', formatPesoForPdf(panindaTotal), 'All Expenses', formatPesoForPdf(allExpenses)],
            ['Total Money Left', formatPesoForPdf(moneyLeft), 'Taken Food Logs', String(state.weekTakenFoods.length)]
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
        head: [['Date', 'Sales', 'Bilin', 'Others', 'General', 'Paninda', 'Money Left']],
        body: dailySummary.map(item => [
            formatDateWithWeekday(item.date),
            formatPesoForPdf(item.sales),
            formatPesoForPdf(item.bilin),
            formatPesoForPdf(item.others),
            formatPesoForPdf(item.general),
            formatPesoForPdf(item.paninda),
            formatPesoForPdf(item.sales + item.bilin + item.others - item.general)
        ]),
        theme: 'striped',
        styles: { fontSize: 7.2, cellPadding: 1.9 },
        headStyles: { fillColor: [118, 81, 54] }
    });

    if (state.weekRows.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Detailed Daily Expenses', 14, y);
        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Category', 'Expense', 'Amount', 'Updated']],
            body: [...state.weekRows].map(row => [
                formatDateWithWeekday(row.expense_date),
                getCategoryLabel(row.expense_category),
                row.expense_name || 'Unnamed Expense',
                formatPesoForPdf(getAmount(row)),
                formatPHDateTime(row.updated_at || row.created_at)
            ]),
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.8 },
            headStyles: { fillColor: [76, 52, 37] },
            columnStyles: { 3: { halign: 'right' } }
        });
    }

    if (state.weekOtherFunds.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Other Funds', 14, y);
        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Name', 'Value', 'Updated']],
            body: state.weekOtherFunds.map(row => [
                formatDateWithWeekday(row.fund_date),
                row.fund_name || 'Other fund',
                formatPesoForPdf(row.amount),
                formatPHDateTime(row.updated_at || row.created_at)
            ]),
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.8 },
            headStyles: { fillColor: [54, 95, 61] }
        });
    }

    if (state.weekTakenFoods.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Taken Food Logs (Non-Cash / No Inventory Effect)', 14, y);
        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Person or Group', 'Menu Items', 'Logged By']],
            body: state.weekTakenFoods.map(row => [
                formatDateWithWeekday(row.log_date),
                row.person_group_name || 'Unnamed',
                row.menu_items || '',
                row.team_leader_name || 'Team Leader'
            ]),
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [81, 69, 111] },
            columnStyles: { 2: { cellWidth: 120 } }
        });
    }

    if (state.receipts.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.text('Receipt Attachments', 14, y);
        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Receipt Name', 'Uploaded']],
            body: state.receipts.map(receipt => [
                formatDateWithWeekday(receipt.expense_date),
                receipt.receipt_name || 'Receipt',
                formatPHDateTime(receipt.created_at)
            ]),
            theme: 'grid',
            styles: { fontSize: 7.2, cellPadding: 1.9 },
            headStyles: { fillColor: [118, 81, 54] }
        });
    }

    addPdfPageNumbers(doc);
    doc.save(`Adrianos_Expenses_${state.selectedWeekStart}_to_${weekEnd}.pdf`);
}

function buildWeeklyCashFlowSummary() {
    const result = [];

    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        const rows = state.weekRows.filter(row => row.expense_date === date);
        const financial = state.weekFinancials.find(row => row.financial_date === date);
        const others = state.weekOtherFunds
            .filter(row => row.fund_date === date)
            .reduce((sum, row) => sum + getFinancialAmount(row.amount), 0);

        result.push({
            date,
            general: sumRowsByCategory(rows, 'general'),
            paninda: sumRowsByCategory(rows, 'paninda'),
            sales: getFinancialAmount(financial?.sales),
            bilin: getFinancialAmount(financial?.bilin_sa_paninda),
            others
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
        message.includes('daily_other_funds') ||
        message.includes('taken_food_logs') ||
        message.includes('expense_category')
    ) {
        return 'The updated expense migration is not installed. Run supabase-others-taken-food.sql in Supabase, then reload the schema.';
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


function parseMoneyInput(value) {
    const clean = sanitizeMoneyInput(value);
    return Math.max(0, Number(clean) || 0);
}

function formatEditableMoney(value) {
    const amount = parseMoneyInput(value);
    if (!String(value || '').trim()) return '';
    return amount.toFixed(2).replace(/\.00$/, '');
}

function formatPlainDecimal(value) {
    const amount = getFinancialAmount(value);
    return amount.toFixed(2).replace(/\.00$/, '');
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
