import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const EXPENSE_NAMES_TABLE = 'expense_names';
const DAILY_EXPENSES_TABLE = 'daily_expenses';
const EXPENSE_RECEIPTS_TABLE = 'expense_receipts';
const RECEIPT_BUCKET = 'expense-receipts';
const MAX_RECEIPT_BYTES = 12 * 1024 * 1024;

const state = {
    currentUser: null,
    currentBranch: null,
    currentDate: '',
    selectedWeekStart: '',
    expenseNames: [],
    todayRows: [],
    weekRows: [],
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
        'weekEntriesText', 'todayEntriesText', 'receiptCountText', 'dailyReportTitle',
        'saveStatusText', 'addExpenseForm', 'newExpenseNameInput', 'expenseSearchInput',
        'expenseSearchCountText', 'expenseList', 'liveTodayTotalText', 'submitDailyReportBtn',
        'dailySummaryList', 'expenseSummaryList', 'weeklyDetailsBody', 'weeklyDetailsCards',
        'receiptStatusText', 'receiptUploadForm', 'receiptNameInput', 'receiptImageInput',
        'receiptPreviewWrap', 'receiptPreviewImage', 'clearReceiptImageBtn', 'uploadReceiptBtn',
        'receiptListCountText', 'receiptList', 'toast'
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
    elements.receiptUploadForm.addEventListener('submit', uploadReceipt);

    elements.weekPicker.addEventListener('change', async () => {
        state.selectedWeekStart = getPHWeekStartKey(elements.weekPicker.value || getPHDateKey());
        elements.weekPicker.value = state.selectedWeekStart;
        updateWeekRangeText();
        setBusy(true, 'Loading week...');
        try {
            await Promise.all([loadWeekRows(), loadWeekReceipts()]);
            renderTopSummary();
            renderWeeklySummary();
            renderReceipts();
        } catch (error) {
            console.error('Selected week load failed:', error);
            showToast(getFriendlyDataError(error), 'error');
        } finally {
            setBusy(false);
        }
    });

    elements.expenseSearchInput.addEventListener('input', event => {
        state.expenseSearch = event.target.value.trim().toLowerCase();
        applyExpenseSearch();
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

    elements.receiptImageInput.addEventListener('change', handleReceiptFileChange);
    elements.clearReceiptImageBtn.addEventListener('click', clearReceiptSelection);
    elements.receiptList.addEventListener('click', event => {
        const deleteButton = event.target.closest('[data-delete-receipt-id]');
        if (deleteButton) deleteReceipt(deleteButton.dataset.deleteReceiptId);
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
        await Promise.all([
            loadExpenseNames(),
            loadTodayRows(),
            loadWeekRows(),
            loadWeekReceipts()
        ]);
        updateStaticHeader();
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
    renderTopSummary();
    renderWeeklySummary();
    renderReceipts();
    updateWeekRangeText();
    updateLiveTodayTotal();
}

function renderExpenseInputs() {
    if (!state.expenseNames.length) {
        elements.expenseList.innerHTML = '<div class="empty-state">No saved expense names yet. Add your first expense above.</div>';
        elements.expenseSearchCountText.textContent = '0 saved expense names';
        return;
    }

    const amountByExpenseId = new Map(state.todayRows.map(row => [row.expense_id, getAmount(row)]));
    const updatedByExpenseId = new Map(state.todayRows.map(row => [row.expense_id, row.updated_at || row.created_at]));

    elements.expenseList.innerHTML = state.expenseNames.map(item => {
        const amount = amountByExpenseId.get(item.id) || '';
        const lastUpdated = updatedByExpenseId.get(item.id);
        return `
            <div class="expense-row" data-expense-id="${escapeHTML(item.id)}" data-expense-search="${escapeHTML(item.expense_name.toLowerCase())}">
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

    applyExpenseSearch();
}

function applyExpenseSearch() {
    const query = state.expenseSearch;
    let visible = 0;
    elements.expenseList.querySelectorAll('.expense-row[data-expense-search]').forEach(row => {
        const match = !query || row.dataset.expenseSearch.includes(query);
        row.classList.toggle('search-hidden', !match);
        if (match) visible += 1;
    });

    const total = state.expenseNames.length;
    elements.expenseSearchCountText.textContent = query
        ? `${visible} of ${total} expense names shown`
        : `${total} saved expense name${total === 1 ? '' : 's'}`;
}

function renderTopSummary() {
    const todayTotal = state.todayRows.reduce((sum, row) => sum + getAmount(row), 0);
    const weekTotal = state.weekRows.reduce((sum, row) => sum + getAmount(row), 0);

    elements.todayTotalText.textContent = formatPeso(todayTotal);
    elements.todayDateText.textContent = formatDateLong(state.currentDate);
    elements.weekTotalText.textContent = formatPeso(weekTotal);
    elements.weekEntriesText.textContent = `${state.weekRows.length} entr${state.weekRows.length === 1 ? 'y' : 'ies'}`;
    elements.todayEntriesText.textContent = String(state.todayRows.length);
    elements.receiptCountText.textContent = String(state.receipts.length);
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

    const expenseItems = [...expenseMap.values()]
        .filter(item => !state.expenseSearch || item.name.toLowerCase().includes(state.expenseSearch))
        .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

    elements.expenseSummaryList.innerHTML = expenseItems.length
        ? expenseItems.map(item => `
            <div class="summary-list-row">
                <div><strong>${escapeHTML(item.name)}</strong><br><span>${item.count} daily entr${item.count === 1 ? 'y' : 'ies'}</span></div>
                <strong>${escapeHTML(formatPeso(item.total))}</strong>
            </div>
        `).join('')
        : '<div class="empty-state">No matching positive expense values for this week.</div>';

    const rows = [...state.weekRows]
        .filter(row => !state.expenseSearch || String(row.expense_name || '').toLowerCase().includes(state.expenseSearch))
        .sort((a, b) => {
            const dateCompare = String(b.expense_date).localeCompare(String(a.expense_date));
            if (dateCompare !== 0) return dateCompare;
            return String(a.expense_name || '').localeCompare(String(b.expense_name || ''));
        });

    elements.weeklyDetailsBody.innerHTML = rows.length
        ? rows.map(row => `
            <tr>
                <td>${escapeHTML(formatDateWithWeekday(row.expense_date))}</td>
                <td><strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong></td>
                <td>${escapeHTML(formatPeso(getAmount(row)))}</td>
                <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="5" class="table-empty">No matching submitted expenses greater than zero for this week.</td></tr>';

    elements.weeklyDetailsCards.innerHTML = rows.length
        ? rows.map(row => `
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
        : '<div class="empty-state">No matching submitted expenses greater than zero for this week.</div>';
}

function renderReceipts() {
    elements.receiptCountText.textContent = String(state.receipts.length);
    elements.receiptListCountText.textContent = `${state.receipts.length} receipt${state.receipts.length === 1 ? '' : 's'}`;

    elements.receiptList.innerHTML = state.receipts.length
        ? state.receipts.map(receipt => `
            <article class="receipt-item">
                <a class="receipt-thumb-link" href="${escapeHTML(receipt.receipt_url)}" target="_blank" rel="noopener" aria-label="Open ${escapeHTML(receipt.receipt_name)} receipt image">
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

async function addExpenseName(event) {
    event.preventDefault();
    if (state.busy) return;

    const name = elements.newExpenseNameInput.value.trim();
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
            .maybeSingle();
        if (findError) throw findError;

        if (existing) {
            const { error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .update({ expense_name: name, is_active: true })
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
                    created_by: state.currentUser.id,
                    created_by_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader'
                });
            if (error) throw error;
        }

        elements.newExpenseNameInput.value = '';
        await loadExpenseNames();
        renderExpenseInputs();
        renderTopSummary();
        showToast(`"${name}" is now available in the daily expense form.`);
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

    const confirmed = window.confirm(`Remove "${item.expense_name}" from future expense forms? Historical daily records will be kept.`);
    if (!confirmed) return;

    setBusy(true, 'Removing expense name...');
    try {
        const { error } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .update({ is_active: false })
            .eq('id', expenseId);
        if (error) throw error;

        await loadExpenseNames();
        renderExpenseInputs();
        renderTopSummary();
        updateLiveTodayTotal();
        showToast('Expense name removed. Historical records remain available.');
    } catch (error) {
        console.error('Remove expense name failed:', error);
        showToast(getFriendlyDataError(error), 'error');
    } finally {
        setBusy(false);
        setSaveStatus('Ready');
    }
}

async function submitTodayReport() {
    if (state.busy) return;

    const latestDate = getPHDateKey();
    if (latestDate !== state.currentDate) {
        state.currentDate = latestDate;
        state.selectedWeekStart = getPHWeekStartKey(latestDate);
        elements.weekPicker.value = state.selectedWeekStart;
        await loadAllExpenseData();
        showToast('A new Philippine day started. Enter today’s amounts before submitting.', 'error');
        return;
    }

    const inputs = [...elements.expenseList.querySelectorAll('.expense-amount-input[data-expense-id]')];
    if (!inputs.length) {
        showToast('Add at least one expense name first.', 'error');
        return;
    }

    setBusy(true, 'Submitting...');
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
                    team_leader_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader'
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
        setSaveStatus('Submitted');
        showToast('Today’s expense report was submitted. Submitting again today updates the same records.');
    } catch (error) {
        console.error('Daily expense submit failed:', error);
        showToast(getFriendlyDataError(error), 'error');
        setSaveStatus('Submit failed');
    } finally {
        setBusy(false);
    }
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
    if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
    state.previewUrl = '';
    state.selectedReceiptFile = null;
    elements.receiptImageInput.value = '';
    elements.receiptPreviewImage.removeAttribute('src');
    elements.receiptPreviewWrap.classList.add('hidden');
    setReceiptStatus('Ready');
}

async function uploadReceipt(event) {
    event.preventDefault();
    if (state.busy) return;

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
        storagePath = `${getBranchKey()}/${state.currentDate}/${Date.now()}-${slugify(receiptName) || 'receipt'}.jpg`;

        setReceiptStatus('Uploading image...');
        const { error: uploadError } = await supabase.storage
            .from(RECEIPT_BUCKET)
            .upload(storagePath, imageBlob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
        if (uploadError) throw uploadError;

        const { data: publicData } = supabase.storage.from(RECEIPT_BUCKET).getPublicUrl(storagePath);
        const receiptUrl = publicData?.publicUrl;
        if (!receiptUrl) throw new Error('Could not create the receipt image URL.');

        const { error: insertError } = await supabase
            .from(EXPENSE_RECEIPTS_TABLE)
            .insert({
                expense_date: state.currentDate,
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
        await loadWeekReceipts();
        renderTopSummary();
        renderReceipts();
        setReceiptStatus('Uploaded');
        showToast('Receipt image uploaded successfully.');
    } catch (error) {
        console.error('Receipt upload failed:', error);
        if (storagePath) {
            await supabase.storage.from(RECEIPT_BUCKET).remove([storagePath]).catch(() => {});
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

    const confirmed = window.confirm(`Delete receipt "${receipt.receipt_name}"? This removes the image and receipt record.`);
    if (!confirmed) return;

    setBusy(true, 'Deleting receipt...');
    try {
        if (receipt.storage_path) {
            const { error: storageError } = await supabase.storage.from(RECEIPT_BUCKET).remove([receipt.storage_path]);
            if (storageError) console.warn('Receipt image removal warning:', storageError);
        }
        const { error } = await supabase.from(EXPENSE_RECEIPTS_TABLE).delete().eq('id', receiptId);
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
    const bitmap = await loadImageBitmap(file);
    const maxDimension = 1600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    if (typeof bitmap.close === 'function') bitmap.close();

    return new Promise((resolve, reject) => {
        canvas.toBlob(blob => {
            if (blob) resolve(blob);
            else reject(new Error('Could not prepare the receipt image.'));
        }, 'image/jpeg', 0.82);
    });
}

async function loadImageBitmap(file) {
    if ('createImageBitmap' in window) return window.createImageBitmap(file);
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
    if (!state.weekRows.length && !state.receipts.length) {
        showToast('There are no expenses or receipts to export for the selected week.', 'error');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        showToast('The PDF library is not ready. Check your internet connection and reload.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        showToast('The PDF table library is not ready. Reload and try again.', 'error');
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
            ['Receipt Attachments', String(state.receipts.length)],
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

    if (state.weekRows.length) {
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
    }

    if (state.receipts.length) {
        y = doc.lastAutoTable.finalY + 7;
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
            styles: { fontSize: 7.4, cellPadding: 2 },
            headStyles: { fillColor: [118, 81, 54] }
        });
    }

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
        showToast('A new Philippine day started. Today’s amounts are blank; saved names and old receipts remain available.');
    }, 60_000);
}

function setBusy(isBusy, label = '') {
    state.busy = isBusy;
    [elements.refreshBtn, elements.exportWeeklyPdfBtn, elements.submitDailyReportBtn, elements.uploadReceiptBtn]
        .filter(Boolean)
        .forEach(button => { button.disabled = isBusy; });
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
    if (code === '42P01' || code === 'PGRST205' || message.includes('daily_expenses') || message.includes('expense_receipts')) {
        return 'The new expense tables are not installed yet. Run supabase-receipts-cash-advances.sql in Supabase.';
    }
    if (message.includes('bucket') || message.includes('storage')) {
        return 'Receipt storage is not ready. Run the included Supabase SQL migration, then reload the page.';
    }
    if (message.includes('row-level security') || code === '42501') {
        return 'Supabase permissions blocked the request. Run the included SQL migration and reload the schema.';
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
