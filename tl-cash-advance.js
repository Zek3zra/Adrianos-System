import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const CASH_ADVANCES_TABLE = 'weekly_cash_advances';

const state = {
    currentUser: null,
    currentBranch: null,
    employees: [],
    advances: [],
    selectedWeekStart: '',
    search: '',
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
        state.selectedWeekStart = getPHWeekStartKey();
        elements.weekPicker.value = state.selectedWeekStart;
        updateHeader();
        await loadAllData();
        startWeekWatcher();
    } catch (error) {
        console.error('Cash advance page failed:', error);
        alert(error.message || 'Could not load cash advances.');
        clearTlSession();
        window.location.replace('tl-login.html');
    } finally {
        elements.pageLoader.classList.add('hidden');
    }
}

function bindElements() {
    const ids = [
        'pageLoader', 'headerMeta', 'backBtn', 'logoutBtn', 'weekPicker', 'weekRangeText',
        'refreshBtn', 'exportPdfBtn', 'weekTotalText', 'weekLabelText', 'employeeCountText',
        'advanceCountText', 'branchNameText', 'saveStatusText', 'employeeSearchInput',
        'employeeSearchCountText', 'employeeList', 'liveTotalText', 'submitBtn',
        'savedSummaryText', 'clearWeekBtn', 'savedAdvanceList', 'toast'
    ];
    ids.forEach(id => { elements[id] = document.getElementById(id); });
}

function bindEvents() {
    elements.backBtn.addEventListener('click', () => window.location.assign('tl-dashboard.html'));
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', loadAllData);
    elements.exportPdfBtn.addEventListener('click', exportWeeklyPdf);
    elements.submitBtn.addEventListener('click', submitWeeklyAdvances);
    elements.clearWeekBtn.addEventListener('click', clearWeek);

    elements.weekPicker.addEventListener('change', async () => {
        state.selectedWeekStart = getPHWeekStartKey(elements.weekPicker.value || getPHDateKey());
        elements.weekPicker.value = state.selectedWeekStart;
        updateWeekText();
        await loadAdvances();
        renderAll();
    });

    elements.employeeSearchInput.addEventListener('input', event => {
        state.search = event.target.value.trim().toLowerCase();
        applySearch();
    });

    elements.employeeList.addEventListener('click', event => {
        const row = event.target.closest('.employee-row[data-employee-id]');
        if (!row || event.target.closest('input')) return;
        row.querySelector('.advance-input')?.focus();
    });

    elements.employeeList.addEventListener('input', event => {
        const input = event.target.closest('.advance-input');
        if (!input) return;
        input.value = sanitizeMoneyInput(input.value);
        const row = input.closest('.employee-row');
        row?.classList.toggle('has-amount', Number(input.value) > 0);
        updateLiveTotal();
        setStatus('Unsaved changes');
    });

    elements.employeeList.addEventListener('blur', event => {
        const input = event.target.closest('.advance-input');
        if (!input || !input.value) return;
        input.value = Number(input.value).toFixed(2).replace(/\.00$/, '');
        updateLiveTotal();
    }, true);
}

async function loadCurrentUser() {
    const hasAuth = sessionStorage.getItem('adrianosTlAuth') === 'true';
    const userId = sessionStorage.getItem('adrianosTlUserId') || sessionStorage.getItem('adrianosLoggedUserId');
    if (!hasAuth || !userId) throw new Error('Session expired. Please log in again.');

    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (error || !data) throw new Error('Team Leader account not found.');
    if (data.role !== 'team_leader') throw new Error('Access denied. Team Leader account only.');
    state.currentUser = data;
}

async function loadCurrentBranch() {
    if (!state.currentUser.branch_id) throw new Error('Your Team Leader account has no assigned branch.');
    const { data, error } = await supabase.from('branches').select('*').eq('id', state.currentUser.branch_id).single();
    if (error || !data) throw new Error('Assigned branch could not be loaded.');
    state.currentBranch = data;
}

async function loadAllData() {
    setBusy(true, 'Loading...');
    try {
        await Promise.all([loadEmployees(), loadAdvances()]);
        renderAll();
        setStatus('Ready');
    } catch (error) {
        console.error('Cash advance data load failed:', error);
        showToast(getFriendlyError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function loadEmployees() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, username, role, branch_id')
        .eq('branch_id', state.currentUser.branch_id)
        .neq('role', 'admin')
        .order('full_name', { ascending: true });
    if (error) throw error;
    state.employees = data || [];
}

async function loadAdvances() {
    const { data, error } = await supabase
        .from(CASH_ADVANCES_TABLE)
        .select('*')
        .eq('branch_key', getBranchKey())
        .eq('week_start', state.selectedWeekStart)
        .order('employee_name', { ascending: true });
    if (error) throw error;
    state.advances = (data || []).filter(row => getAmount(row) > 0);
}

function renderAll() {
    renderEmployeeList();
    renderSummary();
    renderSavedList();
    updateHeader();
    updateLiveTotal();
}

function renderEmployeeList() {
    if (!state.employees.length) {
        elements.employeeList.innerHTML = '<div class="empty-state">No employees are assigned to this branch.</div>';
        elements.employeeSearchCountText.textContent = '0 employees';
        return;
    }

    const advanceByEmployee = new Map(state.advances.map(row => [String(row.employee_id), row]));
    elements.employeeList.innerHTML = state.employees.map(employee => {
        const saved = advanceByEmployee.get(String(employee.id));
        const amount = saved ? getAmount(saved) : '';
        return `
            <article class="employee-row ${amount ? 'has-amount' : ''}" data-employee-id="${escapeHTML(employee.id)}" data-search="${escapeHTML(`${employee.full_name || ''} ${employee.username || ''}`.toLowerCase())}">
                <div class="employee-main">
                    <div>
                        <strong>${escapeHTML(employee.full_name || employee.username || 'Unnamed Employee')}</strong>
                        <span>${escapeHTML(employee.username || 'No username')}</span>
                    </div>
                    <span class="role-chip">${employee.role === 'team_leader' ? 'Team Leader' : 'Employee'}</span>
                </div>
                <div class="amount-field">
                    <input class="advance-input" type="number" inputmode="decimal" min="0" step="0.01" data-employee-id="${escapeHTML(employee.id)}" value="${amount ? escapeHTML(String(amount)) : ''}" placeholder="0.00" aria-label="Cash advance for ${escapeHTML(employee.full_name || 'employee')}">
                </div>
                <span class="employee-updated">${saved ? `Last saved ${escapeHTML(formatPHDateTime(saved.updated_at || saved.created_at))}` : 'No cash advance saved for this week'}</span>
            </article>
        `;
    }).join('');
    applySearch();
}

function applySearch() {
    let visible = 0;
    elements.employeeList.querySelectorAll('.employee-row[data-search]').forEach(row => {
        const matches = !state.search || row.dataset.search.includes(state.search);
        row.classList.toggle('search-hidden', !matches);
        if (matches) visible += 1;
    });
    elements.employeeSearchCountText.textContent = state.search
        ? `${visible} of ${state.employees.length} employees shown`
        : `${state.employees.length} employee${state.employees.length === 1 ? '' : 's'}`;
}

function renderSummary() {
    const total = state.advances.reduce((sum, row) => sum + getAmount(row), 0);
    elements.weekTotalText.textContent = formatPeso(total);
    elements.employeeCountText.textContent = String(state.employees.length);
    elements.advanceCountText.textContent = String(state.advances.length);
    elements.branchNameText.textContent = state.currentBranch?.name || 'Unassigned';
    elements.weekLabelText.textContent = getWeekRangeLabel(state.selectedWeekStart);
}

function renderSavedList() {
    const rows = [...state.advances].sort((a, b) => getAmount(b) - getAmount(a) || String(a.employee_name).localeCompare(String(b.employee_name)));
    elements.savedSummaryText.textContent = `${rows.length} saved entr${rows.length === 1 ? 'y' : 'ies'}`;
    elements.savedAdvanceList.innerHTML = rows.length
        ? rows.map(row => `
            <div class="saved-row">
                <div><strong>${escapeHTML(row.employee_name || 'Employee')}</strong><span>Updated ${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</span></div>
                <strong>${escapeHTML(formatPeso(getAmount(row)))}</strong>
            </div>
        `).join('')
        : '<div class="empty-state">No cash advances saved for this week.</div>';
    elements.clearWeekBtn.disabled = !rows.length || state.busy;
}

function updateLiveTotal() {
    const total = [...elements.employeeList.querySelectorAll('.advance-input')]
        .reduce((sum, input) => sum + Math.max(0, Number(input.value) || 0), 0);
    elements.liveTotalText.textContent = `Weekly running total: ${formatPeso(total)}`;
}

async function submitWeeklyAdvances() {
    if (state.busy) return;
    const inputs = [...elements.employeeList.querySelectorAll('.advance-input[data-employee-id]')];
    if (!inputs.length) {
        showToast('No employees are available for this branch.', 'error');
        return;
    }

    setBusy(true, 'Submitting...');
    try {
        for (const input of inputs) {
            const employee = state.employees.find(item => String(item.id) === String(input.dataset.employeeId));
            if (!employee) continue;
            const amount = Math.max(0, Number(input.value) || 0);

            if (amount > 0) {
                const { error } = await supabase.from(CASH_ADVANCES_TABLE).upsert({
                    week_start: state.selectedWeekStart,
                    branch_key: getBranchKey(),
                    branch_id: state.currentUser.branch_id,
                    branch_name: state.currentBranch.name,
                    employee_id: employee.id,
                    employee_name: employee.full_name || employee.username || 'Employee',
                    amount,
                    team_leader_id: state.currentUser.id,
                    team_leader_name: state.currentUser.full_name || state.currentUser.username || 'Team Leader'
                }, { onConflict: 'week_start,branch_key,employee_id' });
                if (error) throw error;
            } else {
                const { error } = await supabase.from(CASH_ADVANCES_TABLE)
                    .delete()
                    .eq('week_start', state.selectedWeekStart)
                    .eq('branch_key', getBranchKey())
                    .eq('employee_id', employee.id);
                if (error) throw error;
            }
        }

        await loadAdvances();
        renderAll();
        setStatus('Submitted');
        showToast('Weekly cash advances saved. Submitting again updates the same employee records.');
    } catch (error) {
        console.error('Cash advance submit failed:', error);
        setStatus('Submit failed');
        showToast(getFriendlyError(error), 'error');
    } finally {
        setBusy(false);
    }
}

async function clearWeek() {
    if (state.busy || !state.advances.length) return;
    const confirmed = window.confirm(`Clear all cash advances for ${getWeekRangeLabel(state.selectedWeekStart)}?`);
    if (!confirmed) return;

    setBusy(true, 'Clearing week...');
    try {
        const { error } = await supabase.from(CASH_ADVANCES_TABLE)
            .delete()
            .eq('week_start', state.selectedWeekStart)
            .eq('branch_key', getBranchKey());
        if (error) throw error;
        state.advances = [];
        renderAll();
        showToast('Selected week cash advances cleared.');
    } catch (error) {
        console.error('Clear week failed:', error);
        showToast(getFriendlyError(error), 'error');
    } finally {
        setBusy(false);
        setStatus('Ready');
    }
}

function exportWeeklyPdf() {
    if (!state.advances.length) {
        showToast('No cash advances are available to export for this week.', 'error');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        showToast('PDF library is not ready. Reload the page and try again.', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        showToast('PDF table library is not ready.', 'error');
        return;
    }

    const end = addDaysToDateKey(state.selectedWeekStart, 6);
    const total = state.advances.reduce((sum, row) => sum + getAmount(row), 0);
    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, 210, 30, 'F');
    doc.setTextColor(44, 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("ADRIANO'S WEEKLY CASH ADVANCE REPORT", 105, 13, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(end)}`, 105, 20, { align: 'center' });
    doc.text(`${state.currentBranch.name} | Prepared by ${state.currentUser.full_name}`, 105, 25, { align: 'center' });

    doc.autoTable({
        startY: 35,
        head: [['Employee', 'Role', 'Cash Advance', 'Last Updated']],
        body: [...state.advances]
            .sort((a, b) => String(a.employee_name).localeCompare(String(b.employee_name)))
            .map(row => {
                const employee = state.employees.find(item => String(item.id) === String(row.employee_id));
                return [
                    row.employee_name || 'Employee',
                    employee?.role === 'team_leader' ? 'Team Leader' : 'Employee',
                    formatPesoForPdf(getAmount(row)),
                    formatPHDateTime(row.updated_at || row.created_at)
                ];
            }),
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.4 },
        headStyles: { fillColor: [76, 52, 37] },
        columnStyles: { 2: { halign: 'right' } },
        foot: [['TOTAL', '', formatPesoForPdf(total), '']],
        footStyles: { fillColor: [245, 238, 230], textColor: [44, 30, 22], fontStyle: 'bold' }
    });

    addPdfPageNumbers(doc);
    doc.save(`Adrianos_Cash_Advances_${safeFileName(state.currentBranch.name)}_${state.selectedWeekStart}_to_${end}.pdf`);
}

function addPdfPageNumbers(doc) {
    const count = doc.internal.getNumberOfPages();
    for (let page = 1; page <= count; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Page ${page} of ${count}`, 196, 291, { align: 'right' });
    }
}

function updateHeader() {
    elements.headerMeta.textContent = `${state.currentBranch?.name || 'Branch'} • ${state.currentUser?.full_name || 'Team Leader'}`;
    updateWeekText();
}

function updateWeekText() {
    const label = getWeekRangeLabel(state.selectedWeekStart || getPHWeekStartKey());
    elements.weekRangeText.textContent = label;
    elements.weekLabelText.textContent = label;
}

function startWeekWatcher() {
    window.setInterval(async () => {
        const latestWeek = getPHWeekStartKey();
        if (latestWeek === state.selectedWeekStart) return;
        state.selectedWeekStart = latestWeek;
        elements.weekPicker.value = latestWeek;
        await loadAllData();
        showToast('A new Philippine week started. The new weekly cash advance form is blank.');
    }, 60_000);
}

function setBusy(isBusy, text = '') {
    state.busy = isBusy;
    [elements.refreshBtn, elements.exportPdfBtn, elements.submitBtn]
        .filter(Boolean)
        .forEach(button => { button.disabled = isBusy; });
    if (elements.clearWeekBtn) elements.clearWeekBtn.disabled = isBusy || state.advances.length === 0;
    if (text) setStatus(text);
}

function setStatus(text) {
    elements.saveStatusText.textContent = text;
}

function getFriendlyError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || message.includes('weekly_cash_advances')) {
        return 'Cash advance table is not installed. Run supabase-receipts-cash-advances.sql in Supabase.';
    }
    if (code === '42501' || message.includes('row-level security')) {
        return 'Supabase permissions blocked the cash advance request. Run the included SQL migration.';
    }
    return error?.message || 'Cash advance request failed.';
}

function getBranchKey() {
    return `branch_${state.currentUser.branch_id}`;
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
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: PH_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}-${parts.find(part => part.type === 'day').value}`;
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

function getWeekRangeLabel(start) {
    return `${formatDateLong(start)} to ${formatDateLong(addDaysToDateKey(start, 6))}`;
}

function formatDateLong(dateKey) {
    return new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: 'long', day: '2-digit' }).format(dateKeyToUTC(dateKey));
}

function formatPHDateTime(value) {
    if (!value) return 'N/A';
    return new Intl.DateTimeFormat('en-PH', { timeZone: PH_TIMEZONE, month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}

function formatPeso(value) {
    return Number(value || 0).toLocaleString('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatPesoForPdf(value) {
    return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function safeFileName(value) {
    return String(value || 'Branch').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

function escapeHTML(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    window.setTimeout(() => elements.toast.classList.add('hidden'), 3400);
}

function logout() {
    clearTlSession();
    window.location.replace('tl-login.html');
}

function clearTlSession() {
    ['adrianosTlAuth', 'adrianosTlUserId', 'adrianosTlUsername', 'adrianosTlRole', 'adrianosLoggedUserId', 'adrianosLoggedUsername', 'adrianosLoggedRole']
        .forEach(key => sessionStorage.removeItem(key));
}
