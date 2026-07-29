import { supabase } from './supabaseClient.js';

const PH_TIMEZONE = 'Asia/Manila';
const DAILY_EXPENSES_TABLE = 'daily_expenses';
const DAILY_FINANCIALS_TABLE = 'daily_branch_financials';
const EXPENSE_RECEIPTS_TABLE = 'expense_receipts';
const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

const state = {
    branches: [],
    rows: [],
    financials: [],
    receipts: [],
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
        'refreshBtn', 'exportPdfBtn', 'weeklyTotalText', 'weeklyEntriesText', 'generalTotalText',
        'panindaTotalText', 'fundsTotalText', 'moneyLeftTotalText', 'todayTotalText', 'todayDateText',
        'branchCountText', 'topExpenseText', 'topExpenseAmountText', 'receiptCountText',
        'dailyBreakdownList', 'expenseBreakdownList', 'branchBreakdownList', 'searchInput',
        'recordsBody', 'recordsCards', 'recordsCountText', 'reportScopeText', 'heroWeekText',
        'adminReceiptCountText', 'adminReceiptGallery', 'toast'
    ];

    ids.forEach(id => {
        elements[id] = document.getElementById(id);
    });
}

function bindEvents() {
    elements.backBtn.addEventListener('click', () => window.location.assign('admin-dashboard.html'));
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', loadExpenseReport);
    elements.exportPdfBtn.addEventListener('click', exportWeeklyPdf);

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
    elements.branchSelect.innerHTML =
        '<option value="all">All Branches</option>' +
        state.branches.map(branch =>
            `<option value="branch_${escapeHTML(branch.id)}">${escapeHTML(branch.name)}</option>`
        ).join('');
}

async function loadExpenseReport() {
    setBusy(true);
    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);

    try {
        let expenseQuery = supabase
            .from(DAILY_EXPENSES_TABLE)
            .select('*')
            .gte('expense_date', state.selectedWeekStart)
            .lte('expense_date', endDate)
            .order('expense_date', { ascending: true })
            .order('branch_name', { ascending: true })
            .order('expense_name', { ascending: true });

        let financialQuery = supabase
            .from(DAILY_FINANCIALS_TABLE)
            .select('*')
            .gte('financial_date', state.selectedWeekStart)
            .lte('financial_date', endDate)
            .order('financial_date', { ascending: true })
            .order('branch_name', { ascending: true });

        let receiptQuery = supabase
            .from(EXPENSE_RECEIPTS_TABLE)
            .select('*')
            .gte('expense_date', state.selectedWeekStart)
            .lte('expense_date', endDate)
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false });

        if (state.selectedBranchKey !== 'all') {
            expenseQuery = expenseQuery.eq('branch_key', state.selectedBranchKey);
            financialQuery = financialQuery.eq('branch_key', state.selectedBranchKey);
            receiptQuery = receiptQuery.eq('branch_key', state.selectedBranchKey);
        }

        const [expenseResult, financialResult, receiptResult] = await Promise.all([
            expenseQuery,
            financialQuery,
            receiptQuery
        ]);

        if (expenseResult.error) throw expenseResult.error;
        if (financialResult.error) throw financialResult.error;
        if (receiptResult.error) throw receiptResult.error;

        state.rows = (expenseResult.data || [])
            .filter(row => getAmount(row) > 0)
            .map(row => ({
                ...row,
                expense_category: normalizeExpenseCategory(row.expense_category)
            }));

        state.financials = financialResult.data || [];
        state.receipts = receiptResult.data || [];

        renderAll();
    } catch (error) {
        console.error('Admin expense report load failed:', error);
        state.rows = [];
        state.financials = [];
        state.receipts = [];
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
    renderReceipts();
    updateWeekRangeText();
}

function renderSummaryCards() {
    const allExpenses = state.rows.reduce((sum, row) => sum + getAmount(row), 0);
    const generalTotal = sumRowsByCategory(state.rows, 'general');
    const panindaTotal = sumRowsByCategory(state.rows, 'paninda');
    const salesTotal = state.financials.reduce((sum, row) => sum + getFinancialAmount(row.sales), 0);
    const bilinTotal = state.financials.reduce((sum, row) => sum + getFinancialAmount(row.bilin_sa_paninda), 0);
    const fundsTotal = salesTotal + bilinTotal;
    const moneyLeft = fundsTotal - generalTotal;
    const branchCount = new Set([
        ...state.rows.map(row => row.branch_key || row.branch_name),
        ...state.financials.map(row => row.branch_key || row.branch_name)
    ]).size;

    const expenseTotals = buildGroupedTotals(
        state.rows,
        row => row.expense_id || `${row.expense_category}|${row.expense_name}`,
        row => `${getCategoryLabel(row.expense_category)} • ${row.expense_name || 'Unnamed Expense'}`
    );
    const topExpense = expenseTotals[0];

    elements.weeklyTotalText.textContent = formatPeso(allExpenses);
    elements.weeklyEntriesText.textContent = `${state.rows.length} entr${state.rows.length === 1 ? 'y' : 'ies'}`;
    elements.generalTotalText.textContent = formatPeso(generalTotal);
    elements.panindaTotalText.textContent = formatPeso(panindaTotal);
    elements.fundsTotalText.textContent = formatPeso(fundsTotal);
    elements.moneyLeftTotalText.textContent = formatPeso(moneyLeft);
    elements.moneyLeftTotalText.classList.toggle('negative-money', moneyLeft < 0);
    elements.branchCountText.textContent = String(branchCount);
    elements.topExpenseText.textContent = topExpense?.label || 'None';
    elements.topExpenseAmountText.textContent = formatPeso(topExpense?.total || 0);
    elements.receiptCountText.textContent = String(state.receipts.length);
}

function renderBreakdowns() {
    const dailyItems = [];

    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        const rows = state.rows.filter(row => row.expense_date === date);
        const financials = state.financials.filter(row => row.financial_date === date);

        const general = sumRowsByCategory(rows, 'general');
        const paninda = sumRowsByCategory(rows, 'paninda');
        const sales = financials.reduce((sum, row) => sum + getFinancialAmount(row.sales), 0);
        const bilin = financials.reduce((sum, row) => sum + getFinancialAmount(row.bilin_sa_paninda), 0);

        dailyItems.push({
            date,
            label: formatDateWithWeekday(date),
            total: general + paninda,
            general,
            paninda,
            sales,
            bilin,
            moneyLeft: sales + bilin - general,
            count: rows.length
        });
    }

    const expenseItems = buildGroupedTotals(
        state.rows,
        row => row.expense_id || `${row.expense_category}|${row.expense_name}`,
        row => `${getCategoryLabel(row.expense_category)} • ${row.expense_name || 'Unnamed Expense'}`
    );

    const branchItems = buildGroupedTotals(
        state.rows,
        row => row.branch_key || row.branch_name,
        row => row.branch_name || 'Unassigned Branch'
    );

    elements.dailyBreakdownList.innerHTML = renderDailyRankItems(dailyItems);
    elements.expenseBreakdownList.innerHTML = renderRankItems(expenseItems, 'entries');
    elements.branchBreakdownList.innerHTML = renderRankItems(branchItems, 'entries');
}

function buildGroupedTotals(rows, keyGetter, labelGetter) {
    const map = new Map();

    rows.forEach(row => {
        const key = keyGetter(row);

        if (!map.has(key)) {
            map.set(key, {
                label: labelGetter(row),
                total: 0,
                count: 0
            });
        }

        const item = map.get(key);
        item.total += getAmount(row);
        item.count += 1;
    });

    return [...map.values()]
        .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function renderRankItems(items, countLabel) {
    if (!items.length) {
        return '<div class="empty-state">No positive expense values for this selection.</div>';
    }

    return items.map(item => `
        <div class="rank-row">
            <div>
                <strong>${escapeHTML(item.label)}</strong><br>
                <span>${item.count} ${escapeHTML(countLabel)}</span>
            </div>
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
                >
                    <div>
                        <strong>${escapeHTML(item.label)}</strong><br>
                        <span>${item.count} entries • Money left ${escapeHTML(formatPeso(item.moneyLeft))}</span>
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
        selectedButton?.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest'
        });
    });
}

function renderInlineDailyBreakdown(dateKey) {
    const rows = state.rows
        .filter(row => row.expense_date === dateKey)
        .sort((a, b) =>
            String(a.branch_name || '').localeCompare(String(b.branch_name || '')) ||
            String(a.expense_category || '').localeCompare(String(b.expense_category || '')) ||
            String(a.expense_name || '').localeCompare(String(b.expense_name || ''))
        );

    const financials = state.financials.filter(row => row.financial_date === dateKey);
    const branchGroups = buildDailyBranchGroups(rows, financials);

    if (!branchGroups.length) {
        return `
            <div class="daily-inline-empty">
                <strong>No report logged.</strong>
                <span>This date has no expense or daily financial values for the selected branch filter.</span>
            </div>
        `;
    }

    const totalGeneral = branchGroups.reduce((sum, group) => sum + group.general, 0);
    const totalPaninda = branchGroups.reduce((sum, group) => sum + group.paninda, 0);
    const totalSales = branchGroups.reduce((sum, group) => sum + group.sales, 0);
    const totalBilin = branchGroups.reduce((sum, group) => sum + group.bilin, 0);
    const totalMoneyLeft = totalSales + totalBilin - totalGeneral;

    return `
        <div class="daily-inline-summary daily-cash-flow-summary">
            <div><span>Sales + Bilin</span><strong>${escapeHTML(formatPeso(totalSales + totalBilin))}</strong></div>
            <div><span>General</span><strong>${escapeHTML(formatPeso(totalGeneral))}</strong></div>
            <div><span>Paninda</span><strong>${escapeHTML(formatPeso(totalPaninda))}</strong></div>
            <div class="daily-money-left"><span>Money Left</span><strong>${escapeHTML(formatPeso(totalMoneyLeft))}</strong></div>
        </div>

        <div class="daily-inline-branches">
            ${branchGroups.map(group => `
                <section class="daily-inline-branch-card">
                    <header>
                        <div><span>Branch</span><strong>${escapeHTML(group.branchName)}</strong></div>
                        <strong>${escapeHTML(formatPeso(group.general + group.paninda))}</strong>
                    </header>

                    <div class="branch-cash-flow-strip">
                        <span>Sales <strong>${escapeHTML(formatPeso(group.sales))}</strong></span>
                        <span>Bilin <strong>${escapeHTML(formatPeso(group.bilin))}</strong></span>
                        <span>General <strong>${escapeHTML(formatPeso(group.general))}</strong></span>
                        <span>Paninda <strong>${escapeHTML(formatPeso(group.paninda))}</strong></span>
                        <span class="branch-money-left">Money left <strong>${escapeHTML(formatPeso(group.sales + group.bilin - group.general))}</strong></span>
                    </div>

                    <div class="daily-inline-expense-list">
                        ${group.rows.length ? group.rows.map(row => `
                            <article class="daily-inline-expense-row">
                                <div>
                                    <span class="record-category ${normalizeExpenseCategory(row.expense_category) === 'paninda' ? 'paninda-record-category' : ''}">${escapeHTML(getCategoryLabel(row.expense_category))}</span>
                                    <strong>${escapeHTML(row.expense_name || 'Unnamed Expense')}</strong>
                                    <span>Submitted by ${escapeHTML(row.team_leader_name || 'Team Leader')}</span>
                                    <small>Updated ${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</small>
                                </div>
                                <strong>${escapeHTML(formatPeso(getAmount(row)))}</strong>
                            </article>
                        `).join('') : '<div class="daily-inline-empty compact-empty"><span>No expense items logged for this branch.</span></div>'}
                    </div>
                </section>
            `).join('')}
        </div>
    `;
}

function buildDailyBranchGroups(rows, financials) {
    const map = new Map();

    rows.forEach(row => {
        const key = row.branch_key || row.branch_name || 'unassigned';

        if (!map.has(key)) {
            map.set(key, createBranchGroup(key, row.branch_name));
        }

        const group = map.get(key);
        group.rows.push(row);

        if (normalizeExpenseCategory(row.expense_category) === 'paninda') {
            group.paninda += getAmount(row);
        } else {
            group.general += getAmount(row);
        }
    });

    financials.forEach(row => {
        const key = row.branch_key || row.branch_name || 'unassigned';

        if (!map.has(key)) {
            map.set(key, createBranchGroup(key, row.branch_name));
        }

        const group = map.get(key);
        group.sales += getFinancialAmount(row.sales);
        group.bilin += getFinancialAmount(row.bilin_sa_paninda);
    });

    return [...map.values()]
        .sort((a, b) => a.branchName.localeCompare(b.branchName));
}

function createBranchGroup(key, branchName) {
    return {
        key,
        branchName: branchName || 'Unassigned Branch',
        general: 0,
        paninda: 0,
        sales: 0,
        bilin: 0,
        rows: []
    };
}

function closeDailyBreakdown() {
    state.selectedDailyDate = '';
}

function renderRecordsTable() {
    const rows = [...state.rows]
        .filter(row => {
            if (!state.search) return true;

            const text = [
                row.expense_date,
                row.branch_name,
                getCategoryLabel(row.expense_category),
                row.expense_name,
                row.team_leader_name,
                row.amount
            ].join(' ').toLowerCase();

            return text.includes(state.search);
        })
        .sort((a, b) =>
            String(b.expense_date).localeCompare(String(a.expense_date)) ||
            String(a.branch_name).localeCompare(String(b.branch_name)) ||
            String(a.expense_category).localeCompare(String(b.expense_category)) ||
            String(a.expense_name).localeCompare(String(b.expense_name))
        );

    elements.recordsCountText.textContent =
        `${rows.length} record${rows.length === 1 ? '' : 's'} shown` +
        (state.search ? ` for “${elements.searchInput.value.trim()}”` : '');

    elements.recordsBody.innerHTML = rows.length
        ? rows.map(row => `
            <tr>
                <td>${escapeHTML(formatDateWithWeekday(row.expense_date))}</td>
                <td><strong>${escapeHTML(row.branch_name || 'Unassigned Branch')}</strong></td>
                <td>${escapeHTML(getCategoryLabel(row.expense_category))}</td>
                <td>${escapeHTML(row.expense_name || 'Unnamed Expense')}</td>
                <td>${escapeHTML(formatPeso(getAmount(row)))}</td>
                <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="7" class="table-empty">No matching positive-value expense records.</td></tr>';

    elements.recordsCards.innerHTML = rows.length
        ? rows.map(row => `
            <article class="mobile-record-card">
                <div class="record-label-row">
                    <span class="record-branch">${escapeHTML(row.branch_name || 'Unassigned Branch')}</span>
                    <span class="record-category ${normalizeExpenseCategory(row.expense_category) === 'paninda' ? 'paninda-record-category' : ''}">${escapeHTML(getCategoryLabel(row.expense_category))}</span>
                </div>
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

function renderReceipts() {
    elements.adminReceiptCountText.textContent =
        `${state.receipts.length} receipt${state.receipts.length === 1 ? '' : 's'} shown`;

    elements.adminReceiptGallery.innerHTML = state.receipts.length
        ? state.receipts.map(receipt => `
            <article class="admin-receipt-card">
                <a href="${escapeHTML(receipt.receipt_url)}" target="_blank" rel="noopener">
                    <img src="${escapeHTML(receipt.receipt_url)}" alt="${escapeHTML(receipt.receipt_name)} receipt" loading="lazy">
                </a>
                <div>
                    <strong>${escapeHTML(receipt.receipt_name || 'Receipt')}</strong>
                    <span>${escapeHTML(receipt.branch_name || 'Unassigned Branch')}</span>
                    <span>${escapeHTML(formatDateWithWeekday(receipt.expense_date))}</span>
                    <a class="btn outline-btn" href="${escapeHTML(receipt.receipt_url)}" target="_blank" rel="noopener">View Receipt</a>
                </div>
            </article>
        `).join('')
        : '<div class="empty-state">No receipt images uploaded for this selection.</div>';
}

function exportWeeklyPdf() {
    if (!state.rows.length && !state.financials.length && !state.receipts.length) {
        showToast('There are no expenses, cash-flow values, or receipts to export for this week.', 'error');
        return;
    }
    if (!window.jspdf?.jsPDF) {
        showToast('The PDF library is not ready. Check your internet connection and reload.', 'error');
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: 'landscape',
        unit: 'mm',
        format: 'a4'
    });

    if (typeof doc.autoTable !== 'function') {
        showToast('The PDF table library is not ready. Reload the page and try again.', 'error');
        return;
    }

    const endDate = addDaysToDateKey(state.selectedWeekStart, 6);
    const branchLabel =
        elements.branchSelect.options[elements.branchSelect.selectedIndex]?.textContent ||
        'All Branches';

    const generalTotal = sumRowsByCategory(state.rows, 'general');
    const panindaTotal = sumRowsByCategory(state.rows, 'paninda');
    const salesTotal = state.financials.reduce((sum, row) => sum + getFinancialAmount(row.sales), 0);
    const bilinTotal = state.financials.reduce((sum, row) => sum + getFinancialAmount(row.bilin_sa_paninda), 0);
    const moneyLeft = salesTotal + bilinTotal - generalTotal;
    const dailyItems = buildAdminDailyItems();

    doc.setFillColor(253, 251, 247);
    doc.rect(0, 0, 297, 30, 'F');
    doc.setTextColor(44, 30, 22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text("ADRIANO'S ADMIN EXPENSE AND CASH-FLOW REPORT", 148.5, 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text(`${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(endDate)} | ${branchLabel}`, 148.5, 19, { align: 'center' });
    doc.text(`Generated ${formatPHDateTime(new Date().toISOString())}`, 148.5, 24, { align: 'center' });

    doc.autoTable({
        startY: 34,
        head: [['Summary', 'Value', 'Summary', 'Value']],
        body: [
            ['Sales', formatPesoForPdf(salesTotal), 'Bilin sa Paninda', formatPesoForPdf(bilinTotal)],
            ['General Expenses', formatPesoForPdf(generalTotal), 'Paninda Purchases', formatPesoForPdf(panindaTotal)],
            ['All Expenses', formatPesoForPdf(generalTotal + panindaTotal), 'Total Money Left', formatPesoForPdf(moneyLeft)],
            ['Expense Entries', String(state.rows.length), 'Receipt Attachments', String(state.receipts.length)]
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
        body: dailyItems.map(item => [
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

    if (state.rows.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Detailed Daily Expenses', 14, y);

        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Branch', 'Category', 'Expense', 'Amount', 'Submitted By', 'Updated']],
            body: [...state.rows]
                .sort((a, b) =>
                    String(a.expense_date).localeCompare(String(b.expense_date)) ||
                    String(a.branch_name).localeCompare(String(b.branch_name)) ||
                    String(a.expense_category).localeCompare(String(b.expense_category)) ||
                    String(a.expense_name).localeCompare(String(b.expense_name))
                )
                .map(row => [
                    formatDateWithWeekday(row.expense_date),
                    row.branch_name || 'Unassigned Branch',
                    getCategoryLabel(row.expense_category),
                    row.expense_name || 'Unnamed Expense',
                    formatPesoForPdf(getAmount(row)),
                    row.team_leader_name || 'Team Leader',
                    formatPHDateTime(row.updated_at || row.created_at)
                ]),
            theme: 'grid',
            styles: { fontSize: 6.9, cellPadding: 1.7 },
            headStyles: { fillColor: [76, 52, 37] },
            columnStyles: { 4: { halign: 'right' } }
        });
    }

    if (state.receipts.length) {
        y = doc.lastAutoTable.finalY + 6;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('Receipt Attachments', 14, y);

        doc.autoTable({
            startY: y + 3,
            head: [['Date', 'Branch', 'Receipt Name', 'Uploaded By', 'Uploaded']],
            body: state.receipts.map(receipt => [
                formatDateWithWeekday(receipt.expense_date),
                receipt.branch_name || 'Unassigned Branch',
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
    doc.save(`Adrianos_Admin_Expenses_${state.selectedWeekStart}_to_${endDate}.pdf`);
}

function buildAdminDailyItems() {
    const result = [];

    for (let i = 0; i < 7; i += 1) {
        const date = addDaysToDateKey(state.selectedWeekStart, i);
        const rows = state.rows.filter(row => row.expense_date === date);
        const financials = state.financials.filter(row => row.financial_date === date);

        result.push({
            date,
            general: sumRowsByCategory(rows, 'general'),
            paninda: sumRowsByCategory(rows, 'paninda'),
            sales: financials.reduce((sum, row) => sum + getFinancialAmount(row.sales), 0),
            bilin: financials.reduce((sum, row) => sum + getFinancialAmount(row.bilin_sa_paninda), 0)
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

function setBusy(isBusy) {
    state.busy = isBusy;
    elements.refreshBtn.disabled = isBusy;
    elements.exportPdfBtn.disabled = isBusy;
    elements.weekPicker.disabled = isBusy;
    elements.branchSelect.disabled = isBusy;
    elements.refreshBtn.textContent = isBusy ? 'Loading...' : 'Refresh Data';
}

function updateWeekRangeText() {
    const end = addDaysToDateKey(state.selectedWeekStart, 6);
    const rangeLabel = `${formatDateLong(state.selectedWeekStart)} to ${formatDateLong(end)}`;

    elements.weekRangeText.textContent = rangeLabel;
    elements.heroWeekText.textContent = rangeLabel;

    const branchLabel =
        elements.branchSelect?.options[elements.branchSelect.selectedIndex]?.textContent ||
        'All Branches';

    elements.reportScopeText.textContent = `${rangeLabel} • ${branchLabel}`;
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
    if (code === '42501' || message.includes('row-level security')) {
        return 'Supabase permissions blocked the expense report. Run the included SQL migration and reload the schema.';
    }

    return error?.message || 'The expense report request failed.';
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
