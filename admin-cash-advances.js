import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const CASH_ADVANCES_TABLE = 'weekly_cash_advances';
const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

const state = {
    branches: [],
    rows: [],
    selectedWeekStart: '',
    selectedBranchKey: 'all',
    search: '',
    busy: false
};

const elements = {};
document.addEventListener('DOMContentLoaded', init);

async function init() {
    bindElements();
    protectAdminPage();
    bindEvents();
    state.selectedWeekStart = getPHWeekStartKey();
    elements.weekPicker.value = state.selectedWeekStart;
    updateWeekText();

    try {
        await fetchBranches();
        await loadReport();
    } catch (error) {
        console.error('Admin cash advance page failed:', error);
        showToast(getFriendlyError(error), 'error');
    } finally {
        elements.pageLoader.classList.add('hidden');
    }
}

function bindElements() {
    const ids = [
        'pageLoader', 'backBtn', 'logoutBtn', 'weekPicker', 'weekRangeText', 'branchSelect',
        'refreshBtn', 'exportPdfBtn', 'weekTotalText', 'entryCountText', 'employeeCountText',
        'branchCountText', 'topEmployeeText', 'topAmountText', 'branchSummaryList',
        'employeeSummaryList', 'recordsCountText', 'searchInput', 'recordCards', 'recordsBody',
        'reportScopeText', 'heroWeekText', 'toast'
    ];
    ids.forEach(id => { elements[id] = document.getElementById(id); });
}

function bindEvents() {
    elements.backBtn.addEventListener('click', () => window.location.assign('admin-dashboard.html'));
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', loadReport);
    elements.exportPdfBtn.addEventListener('click', exportPdf);

    elements.weekPicker.addEventListener('change', async () => {
        state.selectedWeekStart = getPHWeekStartKey(elements.weekPicker.value || getPHDateKey());
        elements.weekPicker.value = state.selectedWeekStart;
        updateWeekText();
        await loadReport();
    });

    elements.branchSelect.addEventListener('change', async () => {
        state.selectedBranchKey = elements.branchSelect.value || 'all';
        updateWeekText();
        await loadReport();
    });

    elements.searchInput.addEventListener('input', event => {
        state.search = event.target.value.trim().toLowerCase();
        renderRecords();
    });
}

function protectAdminPage() {
    const loggedIn = sessionStorage.getItem('adrianosAdminAuth') === 'true';
    const loginTime = Number(sessionStorage.getItem('adrianosAdminLoginTime') || 0);
    if (!loggedIn || !loginTime || Date.now() - loginTime > ADMIN_SESSION_MAX_AGE) {
        clearAdminSession();
        window.location.replace('tl-login.html');
        throw new Error('Admin session expired.');
    }
}

async function fetchBranches() {
    const { data, error } = await supabase.from('branches').select('*').order('name', { ascending: true });
    if (error) throw error;
    state.branches = data || [];
    elements.branchSelect.innerHTML = '<option value="all">All Branches</option>' + state.branches.map(branch => (
        `<option value="branch_${escapeHTML(branch.id)}">${escapeHTML(branch.name)}</option>`
    )).join('');
}

async function loadReport() {
    setBusy(true);
    try {
        let query = supabase.from(CASH_ADVANCES_TABLE)
            .select('*')
            .eq('week_start', state.selectedWeekStart)
            .order('branch_name', { ascending: true })
            .order('employee_name', { ascending: true });
        if (state.selectedBranchKey !== 'all') query = query.eq('branch_key', state.selectedBranchKey);

        const { data, error } = await query;
        if (error) throw error;
        state.rows = (data || []).filter(row => getAmount(row) > 0);
        renderAll();
    } catch (error) {
        console.error('Cash advance report load failed:', error);
        state.rows = [];
        renderAll();
        showToast(getFriendlyError(error), 'error');
    } finally {
        setBusy(false);
    }
}

function renderAll() {
    renderSummary();
    renderBreakdowns();
    renderRecords();
    updateWeekText();
}

function renderSummary() {
    const total = state.rows.reduce((sum, row) => sum + getAmount(row), 0);
    const employees = new Set(state.rows.map(row => row.employee_id || row.employee_name));
    const branches = new Set(state.rows.map(row => row.branch_key || row.branch_name));
    const top = [...state.rows].sort((a, b) => getAmount(b) - getAmount(a))[0];

    elements.weekTotalText.textContent = formatPeso(total);
    elements.entryCountText.textContent = `${state.rows.length} entr${state.rows.length === 1 ? 'y' : 'ies'}`;
    elements.employeeCountText.textContent = String(employees.size);
    elements.branchCountText.textContent = String(branches.size);
    elements.topEmployeeText.textContent = top?.employee_name || 'None';
    elements.topAmountText.textContent = formatPeso(top ? getAmount(top) : 0);
}

function renderBreakdowns() {
    const branchItems = groupedTotals(state.rows, row => row.branch_key || row.branch_name, row => row.branch_name || 'Unassigned Branch');
    const employeeItems = groupedTotals(state.rows, row => row.employee_id || row.employee_name, row => row.employee_name || 'Employee');
    elements.branchSummaryList.innerHTML = renderRankRows(branchItems, 'employee entries');
    elements.employeeSummaryList.innerHTML = renderRankRows(employeeItems, 'weekly entries');
}

function groupedTotals(rows, keyGetter, labelGetter) {
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

function renderRankRows(items, countLabel) {
    return items.length
        ? items.map(item => `<div class="rank-row"><div><strong>${escapeHTML(item.label)}</strong><span>${item.count} ${escapeHTML(countLabel)}</span></div><strong>${escapeHTML(formatPeso(item.total))}</strong></div>`).join('')
        : '<div class="empty-state">No positive cash advances for this selection.</div>';
}

function renderRecords() {
    const rows = [...state.rows]
        .filter(row => {
            if (!state.search) return true;
            const text = `${row.employee_name || ''} ${row.branch_name || ''} ${row.team_leader_name || ''} ${row.amount || ''}`.toLowerCase();
            return text.includes(state.search);
        })
        .sort((a, b) => String(a.branch_name).localeCompare(String(b.branch_name)) || String(a.employee_name).localeCompare(String(b.employee_name)));

    elements.recordsCountText.textContent = `${rows.length} record${rows.length === 1 ? '' : 's'} shown`;
    elements.recordCards.innerHTML = rows.length
        ? rows.map(row => `
            <article class="record-card">
                <span class="record-branch">${escapeHTML(row.branch_name || 'Unassigned Branch')}</span>
                <div class="record-head"><div><strong>${escapeHTML(row.employee_name || 'Employee')}</strong></div><div class="record-amount">${escapeHTML(formatPeso(getAmount(row)))}</div></div>
                <div class="record-meta"><span>Logged by ${escapeHTML(row.team_leader_name || 'Team Leader')}</span><span>Updated ${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</span></div>
            </article>
        `).join('')
        : '<div class="empty-state">No matching cash advance records.</div>';

    elements.recordsBody.innerHTML = rows.length
        ? rows.map(row => `
            <tr>
                <td>${escapeHTML(getWeekRangeLabel(row.week_start))}</td>
                <td>${escapeHTML(row.branch_name || 'Unassigned Branch')}</td>
                <td><strong>${escapeHTML(row.employee_name || 'Employee')}</strong></td>
                <td>${escapeHTML(formatPeso(getAmount(row)))}</td>
                <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="6" class="empty-state">No matching cash advance records.</td></tr>';
}

function exportPdf() {
    if (!state.rows.length) {
        showToast('No cash advances are available to export.', 'error');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        showToast('PDF library is not ready. Reload and try again.', 'error');
        return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
        showToast('PDF table library is not ready.', 'error');
        return;
    }

    const end = addDaysToDateKey(state.selectedWeekStart, 6);
    const total = state.rows.reduce((sum, row) => sum + getAmount(row), 0);
    const branchLabel = elements.branchSelect.options[elements.branchSelect.selectedIndex]?.textContent || 'All Branches';

    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setTextColor(44, 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("ADRIANO'S ADMIN CASH ADVANCE REPORT", 148.5, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(end)} | ${branchLabel}`, 148.5, 19, { align: 'center' });
    doc.text(`Total Cash Advances: ${formatPesoForPdf(total)}`, 148.5, 24, { align: 'center' });

    doc.autoTable({
        startY: 35,
        head: [['Branch', 'Employee', 'Cash Advance', 'Logged By', 'Last Updated']],
        body: [...state.rows]
            .sort((a, b) => String(a.branch_name).localeCompare(String(b.branch_name)) || String(a.employee_name).localeCompare(String(b.employee_name)))
            .map(row => [
                row.branch_name || 'Unassigned Branch',
                row.employee_name || 'Employee',
                formatPesoForPdf(getAmount(row)),
                row.team_leader_name || 'Team Leader',
                formatPHDateTime(row.updated_at || row.created_at)
            ]),
        theme: 'grid',
        styles: { fontSize: 7.7, cellPadding: 2.1 },
        headStyles: { fillColor: [76, 52, 37] },
        columnStyles: { 2: { halign: 'right' } },
        foot: [['TOTAL', '', formatPesoForPdf(total), '', '']],
        footStyles: { fillColor: [245, 238, 230], textColor: [44, 30, 22], fontStyle: 'bold' }
    });

    addPdfPageNumbers(doc);
    doc.save(`Adrianos_Admin_Cash_Advances_${state.selectedWeekStart}_to_${end}.pdf`);
}

function addPdfPageNumbers(doc) {
    const count = doc.internal.getNumberOfPages();
    for (let page = 1; page <= count; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(100);
        doc.text(`Page ${page} of ${count}`, 283, 202, { align: 'right' });
    }
}

function updateWeekText() {
    const label = getWeekRangeLabel(state.selectedWeekStart || getPHWeekStartKey());
    elements.weekRangeText.textContent = label;
    elements.heroWeekText.textContent = label;
    const branchLabel = elements.branchSelect?.options[elements.branchSelect.selectedIndex]?.textContent || 'All Branches';
    elements.reportScopeText.textContent = `${label} • ${branchLabel}`;
}

function setBusy(isBusy) {
    state.busy = isBusy;
    elements.refreshBtn.disabled = isBusy;
    elements.exportPdfBtn.disabled = isBusy;
    elements.refreshBtn.textContent = isBusy ? 'Loading...' : 'Refresh';
}

function getFriendlyError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || '').toLowerCase();
    if (code === '42P01' || code === 'PGRST205' || message.includes('weekly_cash_advances')) {
        return 'Cash advance table is not installed. Run supabase-receipts-cash-advances.sql in Supabase.';
    }
    if (code === '42501' || message.includes('row-level security')) return 'Supabase permissions blocked this report. Run the included SQL migration.';
    return error?.message || 'Cash advance report failed.';
}

function getAmount(row) { return Math.max(0, Number(row?.amount) || 0); }
function getPHDateKey() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: PH_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    return `${parts.find(part => part.type === 'year').value}-${parts.find(part => part.type === 'month').value}-${parts.find(part => part.type === 'day').value}`;
}
function getPHWeekStartKey(dateKey = getPHDateKey()) { const d = dateKeyToUTC(dateKey); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return formatUTCDateKey(d); }
function addDaysToDateKey(dateKey, amount) { const d = dateKeyToUTC(dateKey); d.setUTCDate(d.getUTCDate() + amount); return formatUTCDateKey(d); }
function dateKeyToUTC(dateKey) { const [y,m,d] = String(dateKey).split('-').map(Number); return new Date(Date.UTC(y,m-1,d)); }
function formatUTCDateKey(d) { return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`; }
function getWeekRangeLabel(start) { return `${formatDateLong(start)} to ${formatDateLong(addDaysToDateKey(start, 6))}`; }
function formatDateLong(dateKey) { return new Intl.DateTimeFormat('en-PH', { year:'numeric', month:'long', day:'2-digit' }).format(dateKeyToUTC(dateKey)); }
function formatPHDateTime(value) { if (!value) return 'N/A'; return new Intl.DateTimeFormat('en-PH', { timeZone:PH_TIMEZONE, month:'short', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }).format(new Date(value)); }
function formatPeso(value) { return Number(value || 0).toLocaleString('en-PH', { style:'currency', currency:'PHP', minimumFractionDigits:0, maximumFractionDigits:2 }); }
function formatPesoForPdf(value) { return `PHP ${Number(value || 0).toLocaleString('en-PH', { minimumFractionDigits:2, maximumFractionDigits:2 })}`; }
function escapeHTML(value) { return String(value ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;'); }
function showToast(message, type='success') { elements.toast.textContent = message; elements.toast.className = `toast ${type}`; window.setTimeout(() => elements.toast.classList.add('hidden'), 3400); }
function logout() { clearAdminSession(); window.location.replace('tl-login.html'); }
function clearAdminSession() { sessionStorage.removeItem('adrianosAdminAuth'); sessionStorage.removeItem('adrianosAdminLoginTime'); sessionStorage.removeItem('adrianosAdminUsername'); }
