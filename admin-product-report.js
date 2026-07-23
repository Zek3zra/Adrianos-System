import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const ORDERS_TABLE_NAME = 'daily_product_orders'; // kept for compatibility; report_date now stores PH week start date
    const PH_TIMEZONE = 'Asia/Manila';
    const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

    const elements = {
        logoutBtn: document.getElementById('logoutBtn'),
        orderQuickRangeSelect: document.getElementById('orderQuickRangeSelect'),
        orderStartDateInput: document.getElementById('orderStartDateInput'),
        orderEndDateInput: document.getElementById('orderEndDateInput'),
        orderBranchSelect: document.getElementById('orderBranchSelect'),
        refreshOrdersBtn: document.getElementById('refreshOrdersBtn'),
        exportOrdersPdfBtn: document.getElementById('exportOrdersPdfBtn'),
        ordersRangeNote: document.getElementById('ordersRangeNote'),
        ordersTotalQty: document.getElementById('ordersTotalQty'),
        ordersActiveProducts: document.getElementById('ordersActiveProducts'),
        ordersBranchCount: document.getElementById('ordersBranchCount'),
        ordersDaysCovered: document.getElementById('ordersDaysCovered'),
        ordersEstimatedValue: document.getElementById('ordersEstimatedValue'),
        ordersTopProduct: document.getElementById('ordersTopProduct'),
        weeklySalesChart: document.getElementById('weeklySalesChart'),
        topProductsList: document.getElementById('topProductsList'),
        dailyOrdersList: document.getElementById('dailyOrdersList'),
        branchOrdersList: document.getElementById('branchOrdersList'),
        ordersSearchInput: document.getElementById('ordersSearchInput'),
        ordersCategorySelect: document.getElementById('ordersCategorySelect'),
        ordersPageSizeSelect: document.getElementById('ordersPageSizeSelect'),
        recordsShowingText: document.getElementById('recordsShowingText'),
        prevOrdersPageBtn: document.getElementById('prevOrdersPageBtn'),
        nextOrdersPageBtn: document.getElementById('nextOrdersPageBtn'),
        ordersPageInfo: document.getElementById('ordersPageInfo'),
        ordersTableBody: document.getElementById('ordersTableBody'),
        pdfLoadingOverlay: document.getElementById('pdfLoadingOverlay'),
        pdfLoadingTitle: document.getElementById('pdfLoadingTitle'),
        pdfLoadingMessage: document.getElementById('pdfLoadingMessage'),
        toast: document.getElementById('toast')
    };

    let branchesList = [];
    let productOrders = [];
    let currentRecordsPage = 1;

    const coffeeDark = [44, 30, 22];
    const coffeeMedium = [139, 94, 52];
    const cream = [253, 251, 247];
    const border = [224, 220, 211];
    const textGray = [60, 60, 60];

    protectAdminPage();
    initReportPage();

    async function initReportPage() {
        initWeekRange();
        bindEvents();
        ensureCupUsagePanel();
        ensureAdminExpensesShortcut();
        await fetchBranches();
        await loadProductOrdersReport();
    }


    function ensureAdminExpensesShortcut() {
        if (document.getElementById('adminExpensesPageShortcut')) return;
        const button = document.createElement('button');
        button.type = 'button';
        button.id = 'adminExpensesPageShortcut';
        button.className = 'btn outline-btn';
        button.textContent = 'Expense Reports';
        button.addEventListener('click', () => window.location.assign('admin-expenses.html'));

        const host = elements.exportOrdersPdfBtn?.parentElement || elements.refreshOrdersBtn?.parentElement;
        if (host) host.appendChild(button);
        else (document.querySelector('main, .container') || document.body).prepend(button);
    }

    function protectAdminPage() {
        const isAdminLoggedIn = sessionStorage.getItem('adrianosAdminAuth') === 'true';
        const adminLoginTime = Number(sessionStorage.getItem('adrianosAdminLoginTime') || 0);
        const isSessionExpired = !adminLoginTime || Date.now() - adminLoginTime > ADMIN_SESSION_MAX_AGE;

        if (!isAdminLoggedIn || isSessionExpired) {
            clearAdminSession();
            window.location.replace('tl-login.html');
        }
    }

    function bindEvents() {
        elements.logoutBtn?.addEventListener('click', logout);
        elements.orderQuickRangeSelect?.addEventListener('change', handleQuickRangeChange);
        elements.orderStartDateInput?.addEventListener('change', handleManualWeekRangeChange);
        elements.orderEndDateInput?.addEventListener('change', handleManualWeekRangeChange);
        elements.orderBranchSelect?.addEventListener('change', loadProductOrdersReport);
        elements.refreshOrdersBtn?.addEventListener('click', loadProductOrdersReport);
        elements.exportOrdersPdfBtn?.addEventListener('click', exportProductOrdersPdf);

        elements.ordersSearchInput?.addEventListener('input', () => {
            currentRecordsPage = 1;
            renderProductOrdersTable(getPositiveOrderRows());
        });

        elements.ordersCategorySelect?.addEventListener('change', () => {
            currentRecordsPage = 1;
            renderProductOrdersTable(getPositiveOrderRows());
        });

        elements.ordersPageSizeSelect?.addEventListener('change', () => {
            currentRecordsPage = 1;
            renderProductOrdersTable(getPositiveOrderRows());
        });

        elements.prevOrdersPageBtn?.addEventListener('click', () => {
            if (currentRecordsPage > 1) {
                currentRecordsPage -= 1;
                renderProductOrdersTable(getPositiveOrderRows());
            }
        });

        elements.nextOrdersPageBtn?.addEventListener('click', () => {
            currentRecordsPage += 1;
            renderProductOrdersTable(getPositiveOrderRows());
        });
    }

    function initWeekRange() {
        const thisWeek = getPHWeekStartKey();
        elements.orderQuickRangeSelect.value = 'thisWeek';
        elements.orderStartDateInput.value = thisWeek;
        elements.orderEndDateInput.value = thisWeek;
        updateOrdersRangeNote();
    }

    async function fetchBranches() {
        try {
            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;

            branchesList = data || [];
            elements.orderBranchSelect.innerHTML = '<option value="all">All Branches</option>';

            branchesList.forEach(branch => {
                const option = document.createElement('option');
                option.value = `branch_${branch.id}`;
                option.textContent = branch.name;
                elements.orderBranchSelect.appendChild(option);
            });
        } catch (error) {
            console.error('Branch load failed:', error);
            showToast('Failed to load branches. Report still works with All Branches.', 'error');
        }
    }

    function handleQuickRangeChange() {
        applyQuickRange(elements.orderQuickRangeSelect.value);
        loadProductOrdersReport();
    }

    function handleManualWeekRangeChange() {
        elements.orderQuickRangeSelect.value = 'custom';
        normalizeSelectedWeekRange();
        loadProductOrdersReport();
    }

    function applyQuickRange(rangeValue) {
        const thisWeek = getPHWeekStartKey();
        let startWeek = thisWeek;
        let endWeek = thisWeek;

        if (rangeValue === '4weeks') {
            startWeek = addDaysToDateKey(thisWeek, -21);
        } else if (rangeValue === '8weeks') {
            startWeek = addDaysToDateKey(thisWeek, -49);
        } else if (rangeValue === 'custom') {
            normalizeSelectedWeekRange();
            return;
        }

        elements.orderStartDateInput.value = startWeek;
        elements.orderEndDateInput.value = endWeek;
        updateOrdersRangeNote();
    }

    function normalizeSelectedWeekRange() {
        const thisWeek = getPHWeekStartKey();
        let startWeek = elements.orderStartDateInput.value || thisWeek;
        let endWeek = elements.orderEndDateInput.value || startWeek;

        startWeek = getPHWeekStartKey(startWeek);
        endWeek = getPHWeekStartKey(endWeek);

        if (startWeek > endWeek) {
            const tempWeek = startWeek;
            startWeek = endWeek;
            endWeek = tempWeek;
        }

        elements.orderStartDateInput.value = startWeek;
        elements.orderEndDateInput.value = endWeek;
        updateOrdersRangeNote();
    }

    function getSelectedWeekRange() {
        normalizeSelectedWeekRange();
        return {
            startDate: elements.orderStartDateInput.value,
            endDate: elements.orderEndDateInput.value
        };
    }

    function updateOrdersRangeNote() {
        const startDate = elements.orderStartDateInput.value || getPHWeekStartKey();
        const endDate = elements.orderEndDateInput.value || startDate;
        const branchLabel = getSelectedOrderBranchLabel();
        elements.ordersRangeNote.textContent = `Showing weekly orders from ${getWeekRangeLabel(startDate, endDate)} • ${branchLabel}.`;
    }

    async function loadProductOrdersReport() {
        const { startDate, endDate } = getSelectedWeekRange();
        updateOrdersRangeNote();
        setLoadingState(true);

        try {
            let query = supabase
                .from(ORDERS_TABLE_NAME)
                .select('*')
                .gte('report_date', startDate)
                .lte('report_date', endDate)
                .order('report_date', { ascending: false })
                .order('quantity', { ascending: false })
                .order('product_name', { ascending: true });

            if (elements.orderBranchSelect.value && elements.orderBranchSelect.value !== 'all') {
                query = query.eq('branch_key', elements.orderBranchSelect.value);
            }

            const { data, error } = await query;
            if (error) throw error;

            productOrders = (data || []).map(row => ({
                ...row,
                category: normalizeProductCategory(row.category)
            }));
            currentRecordsPage = 1;
            renderProductOrdersReport();
        } catch (error) {
            console.error('Product orders load failed:', error);
            productOrders = [];
            renderEmptyProductOrders('Failed to load weekly product orders. Please check the daily_product_orders table.');
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        elements.refreshOrdersBtn.disabled = isLoading;
        elements.exportOrdersPdfBtn.disabled = isLoading;
        elements.refreshOrdersBtn.textContent = isLoading ? 'Loading...' : 'Refresh';
        if (isLoading) {
            elements.ordersTableBody.innerHTML = '<tr><td colspan="10" class="loading-text">Loading weekly product orders...</td></tr>';
        }
    }

    function renderProductOrdersReport() {
        const rows = getPositiveOrderRows();
        const stats = buildReportStats(rows);

        elements.ordersTotalQty.textContent = String(stats.totalQty);
        elements.ordersActiveProducts.textContent = String(stats.activeProducts);
        elements.ordersBranchCount.textContent = String(stats.branchesLogged);
        elements.ordersDaysCovered.textContent = String(stats.weeksLogged);
        elements.ordersEstimatedValue.textContent = formatPeso(stats.estimatedTotal);
        elements.ordersTopProduct.textContent = stats.topProducts.length
            ? `${stats.topProducts[0].productName} (${stats.topProducts[0].quantity})`
            : 'No orders yet';

        renderCupUsage(stats.cupUsage);
        renderTopProducts(stats.topProducts);
        renderWeeklyBreakdown(stats.weeklyBreakdown);
        renderBranchBreakdown(stats.branchBreakdown);
        renderWeeklySalesGraph(stats.topProducts);
        populateCategoryFilter(rows);
        renderProductOrdersTable(rows);
    }

    function renderEmptyProductOrders(message) {
        elements.ordersTotalQty.textContent = '0';
        elements.ordersActiveProducts.textContent = '0';
        elements.ordersBranchCount.textContent = '0';
        elements.ordersDaysCovered.textContent = '0';
        elements.ordersEstimatedValue.textContent = formatPeso(0);
        elements.ordersTopProduct.textContent = 'No orders yet';
        renderCupUsage({ cups16oz: 0, cups22oz: 0, totalCups: 0 });
        elements.topProductsList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        elements.dailyOrdersList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        elements.branchOrdersList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        elements.weeklySalesChart.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        resetRecordsControls(message);
        elements.ordersTableBody.innerHTML = `<tr><td colspan="10" class="loading-text">${escapeHTML(message)}</td></tr>`;
    }

    function renderTopProducts(topProducts) {
        if (!topProducts.length) {
            elements.topProductsList.innerHTML = '<div class="empty-state">No product orders found for this week range.</div>';
            return;
        }

        elements.topProductsList.innerHTML = topProducts.slice(0, 12).map(item => {
            const meta = [item.category, item.variant || 'Regular', formatPeso(item.estimatedTotal)].filter(Boolean).join(' • ');
            return `
                <div class="rank-item">
                    <div>
                        <strong>${escapeHTML(item.productName)}</strong>
                        <span>${escapeHTML(meta)}</span>
                    </div>
                    <div class="rank-count">${item.quantity}</div>
                </div>
            `;
        }).join('');
    }

    function renderWeeklyBreakdown(weeklyBreakdown) {
        if (!weeklyBreakdown.length) {
            elements.dailyOrdersList.innerHTML = '<div class="empty-state">No weekly orders found for this range.</div>';
            return;
        }

        elements.dailyOrdersList.innerHTML = weeklyBreakdown.map(item => `
            <div class="rank-item">
                <div>
                    <strong>${escapeHTML(formatSingleWeekLabel(item.reportDate))}</strong>
                    <span>${item.activeProducts} active product${item.activeProducts === 1 ? '' : 's'} • ${item.branchesLogged} branch${item.branchesLogged === 1 ? '' : 'es'} • 16oz: ${item.cups16oz} • 22oz: ${item.cups22oz} • ${formatPeso(item.estimatedTotal)}</span>
                </div>
                <div class="rank-count">${item.quantity}</div>
            </div>
        `).join('');
    }

    function renderBranchBreakdown(branchBreakdown) {
        if (!branchBreakdown.length) {
            elements.branchOrdersList.innerHTML = '<div class="empty-state">No branch orders found for this week range.</div>';
            return;
        }

        elements.branchOrdersList.innerHTML = branchBreakdown.map(item => `
            <div class="rank-item">
                <div>
                    <strong>${escapeHTML(item.branchName)}</strong>
                    <span>${item.activeProducts} active product${item.activeProducts === 1 ? '' : 's'} • ${item.weeksLogged} week${item.weeksLogged === 1 ? '' : 's'} • 16oz: ${item.cups16oz} • 22oz: ${item.cups22oz} • ${formatPeso(item.estimatedTotal)}</span>
                </div>
                <div class="rank-count">${item.quantity}</div>
            </div>
        `).join('');
    }

    function renderWeeklySalesGraph(topProducts) {
        if (!elements.weeklySalesChart) return;

        const graphItems = topProducts.slice(0, 10);
        if (!graphItems.length) {
            elements.weeklySalesChart.innerHTML = '<div class="empty-state">No graph data yet.</div>';
            return;
        }

        const maxQty = Math.max(...graphItems.map(item => item.quantity), 1);
        elements.weeklySalesChart.innerHTML = graphItems.map((item, index) => {
            const width = Math.max(6, Math.round((item.quantity / maxQty) * 100));
            const label = [item.productName, item.variant || 'Regular'].filter(Boolean).join(' - ');
            return `
                <div class="chart-row">
                    <div class="chart-label"><strong>${index + 1}. ${escapeHTML(label)}</strong><span>${escapeHTML(item.category || 'Uncategorized')}</span></div>
                    <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${width}%"></div></div>
                    <div class="chart-value">${item.quantity}</div>
                </div>
            `;
        }).join('');
    }

    function renderProductOrdersTable(rows) {
        const filteredRows = getFilteredDetailRows(rows);
        const sortedRows = getSortedOrderRows(filteredRows);
        const totalRows = sortedRows.length;
        const pageSize = getRecordsPageSize();
        const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));

        if (currentRecordsPage > totalPages) currentRecordsPage = totalPages;
        if (currentRecordsPage < 1) currentRecordsPage = 1;

        updateRecordsPagination(totalRows, totalPages, pageSize);

        if (!rows.length) {
            elements.ordersTableBody.innerHTML = '<tr><td colspan="10" class="loading-text">No weekly product orders logged for the selected range.</td></tr>';
            return;
        }

        if (!totalRows) {
            elements.ordersTableBody.innerHTML = '<tr><td colspan="10" class="loading-text">No matching records found.</td></tr>';
            return;
        }

        const startIndex = (currentRecordsPage - 1) * pageSize;
        const pageRows = sortedRows.slice(startIndex, startIndex + pageSize);

        elements.ordersTableBody.innerHTML = pageRows.map(row => {
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);
            const estimatedTotal = qty * price;
            return `
                <tr>
                    <td>${escapeHTML(formatSingleWeekLabel(row.report_date))}</td>
                    <td><strong>${escapeHTML(row.product_name || 'Unnamed Product')}</strong></td>
                    <td>${escapeHTML(row.product_variant || 'Regular')}</td>
                    <td>${escapeHTML(row.category || 'Uncategorized')}</td>
                    <td>${escapeHTML(row.branch_name || 'Unassigned Branch')}</td>
                    <td class="qty-cell">${qty}</td>
                    <td>${escapeHTML(formatPeso(price))}</td>
                    <td class="value-cell">${escapeHTML(formatPeso(estimatedTotal))}</td>
                    <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                    <td>${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
                </tr>
            `;
        }).join('');
    }

    function buildReportStats(rows) {
        const topProducts = getTopProducts(rows);
        const weeklyBreakdown = getWeeklyBreakdown(rows);
        const branchBreakdown = getBranchBreakdown(rows);
        return {
            totalQty: rows.reduce((sum, row) => sum + getOrderQuantity(row), 0),
            estimatedTotal: rows.reduce((sum, row) => sum + getOrderQuantity(row) * getOrderPrice(row), 0),
            activeProducts: getUniqueProductKeys(rows).size,
            branchesLogged: branchBreakdown.length,
            weeksLogged: weeklyBreakdown.length,
            cupUsage: getCupUsage(rows),
            topProducts,
            weeklyBreakdown,
            branchBreakdown
        };
    }

    function getTopProducts(rows) {
        const map = new Map();
        rows.forEach(row => {
            const key = getProductKey(row);
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);
            if (!map.has(key)) {
                map.set(key, {
                    productKey: key,
                    productName: plainText(row.product_name, 'Unnamed Product'),
                    variant: row.product_variant || 'Regular',
                    category: row.category || 'Uncategorized',
                    quantity: 0,
                    estimatedTotal: 0
                });
            }
            const item = map.get(key);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
        });
        return [...map.values()].sort((a, b) => b.quantity - a.quantity || a.productName.localeCompare(b.productName));
    }

    function getWeeklyBreakdown(rows) {
        const map = new Map();
        rows.forEach(row => {
            const reportDate = row.report_date || 'Unknown Week';
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);
            if (!map.has(reportDate)) {
                map.set(reportDate, { reportDate, quantity: 0, estimatedTotal: 0, products: new Set(), branches: new Set(), cups16oz: 0, cups22oz: 0, totalCups: 0 });
            }
            const item = map.get(reportDate);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
            item.products.add(getProductKey(row));
            item.branches.add(row.branch_key || row.branch_name || 'unassigned');
            addRowCupUsage(item, row);
        });
        return [...map.values()].map(item => ({
            reportDate: item.reportDate,
            quantity: item.quantity,
            estimatedTotal: item.estimatedTotal,
            activeProducts: item.products.size,
            branchesLogged: item.branches.size,
            cups16oz: item.cups16oz,
            cups22oz: item.cups22oz,
            totalCups: item.totalCups
        })).sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate)));
    }

    function getBranchBreakdown(rows) {
        const map = new Map();
        rows.forEach(row => {
            const key = row.branch_key || row.branch_name || 'unassigned';
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);
            if (!map.has(key)) {
                map.set(key, {
                    branchKey: key,
                    branchName: row.branch_name || getBranchName(row.branch_id) || 'Unassigned Branch',
                    quantity: 0,
                    estimatedTotal: 0,
                    products: new Set(),
                    weeks: new Set(),
                    cups16oz: 0,
                    cups22oz: 0,
                    totalCups: 0
                });
            }
            const item = map.get(key);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
            item.products.add(getProductKey(row));
            if (row.report_date) item.weeks.add(row.report_date);
            addRowCupUsage(item, row);
        });
        return [...map.values()].map(item => ({
            branchKey: item.branchKey,
            branchName: item.branchName,
            quantity: item.quantity,
            estimatedTotal: item.estimatedTotal,
            activeProducts: item.products.size,
            weeksLogged: item.weeks.size,
            cups16oz: item.cups16oz,
            cups22oz: item.cups22oz,
            totalCups: item.totalCups
        })).sort((a, b) => b.quantity - a.quantity || a.branchName.localeCompare(b.branchName));
    }

    function ensureCupUsagePanel() {
        if (document.getElementById('automaticCupUsagePanel')) return;

        const anchor = elements.ordersRangeNote?.closest('.card, section, .panel, .report-filter-card') || elements.ordersRangeNote || elements.weeklySalesChart;
        if (!anchor) return;

        const panel = document.createElement('section');
        panel.id = 'automaticCupUsagePanel';
        panel.setAttribute('aria-label', 'Automatic cup usage inventory');
        panel.style.margin = '14px 0';
        panel.style.padding = '14px';
        panel.style.border = '1px solid rgba(80, 57, 41, 0.18)';
        panel.style.borderRadius = '12px';
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px;">
                <div><strong>Automatic Cup Inventory</strong><br><span style="font-size:0.82rem;opacity:0.72;">Derived from all recorded 16oz and 22oz drinks in the selected range.</span></div>
                <strong id="reportTotalCupsText">0 cups</strong>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                <div style="padding:10px;border:1px solid rgba(80,57,41,0.14);border-radius:10px;"><span style="display:block;font-size:0.8rem;opacity:0.72;">16oz Cups Used</span><strong id="report16ozCupsText" style="font-size:1.25rem;">0</strong></div>
                <div style="padding:10px;border:1px solid rgba(80,57,41,0.14);border-radius:10px;"><span style="display:block;font-size:0.8rem;opacity:0.72;">22oz Cups Used</span><strong id="report22ozCupsText" style="font-size:1.25rem;">0</strong></div>
            </div>
        `;

        anchor.insertAdjacentElement('afterend', panel);
        elements.report16ozCupsText = panel.querySelector('#report16ozCupsText');
        elements.report22ozCupsText = panel.querySelector('#report22ozCupsText');
        elements.reportTotalCupsText = panel.querySelector('#reportTotalCupsText');
    }

    function normalizeCupSize(value, productName = '') {
        const clean = String(value || '').toLowerCase().replace(/\s+/g, '');
        if (clean === '16oz' || clean === '16ounce' || clean === '16ounces') return '16oz';
        if (clean === '22oz' || clean === '22ounce' || clean === '22ounces') return '22oz';

        // Compatibility for records saved before these menu sizes were specified.
        const cleanName = String(productName || '').trim().toLowerCase();
        if (cleanName === 'thai milk tea') return '22oz';
        return '';
    }

    function addRowCupUsage(target, row) {
        const cupSize = normalizeCupSize(row.product_variant, row.product_name);
        if (!cupSize) return target;

        const quantity = getOrderQuantity(row);
        if (cupSize === '16oz') target.cups16oz = (target.cups16oz || 0) + quantity;
        if (cupSize === '22oz') target.cups22oz = (target.cups22oz || 0) + quantity;
        target.totalCups = (target.totalCups || 0) + quantity;
        return target;
    }

    function getCupUsage(rows) {
        return rows.reduce((usage, row) => addRowCupUsage(usage, row), { cups16oz: 0, cups22oz: 0, totalCups: 0 });
    }

    function renderCupUsage(usage) {
        ensureCupUsagePanel();
        if (elements.report16ozCupsText) elements.report16ozCupsText.textContent = String(usage.cups16oz || 0);
        if (elements.report22ozCupsText) elements.report22ozCupsText.textContent = String(usage.cups22oz || 0);
        if (elements.reportTotalCupsText) elements.reportTotalCupsText.textContent = `${usage.totalCups || 0} cup${usage.totalCups === 1 ? '' : 's'}`;
    }

    function getPositiveOrderRows() {
        return productOrders.filter(row => getOrderQuantity(row) > 0);
    }

    function getFilteredDetailRows(rows) {
        const searchValue = (elements.ordersSearchInput?.value || '').trim().toLowerCase();
        const categoryValue = elements.ordersCategorySelect?.value || 'all';
        return rows.filter(row => {
            const matchesCategory = categoryValue === 'all' || row.category === categoryValue;
            const searchText = `${row.report_date || ''} ${row.product_name || ''} ${row.product_variant || ''} ${row.category || ''} ${row.branch_name || ''} ${row.team_leader_name || ''} ${row.quantity || ''} ${row.price || ''}`.toLowerCase();
            const matchesSearch = !searchValue || searchText.includes(searchValue);
            return matchesCategory && matchesSearch;
        });
    }

    function getSortedOrderRows(rows) {
        return [...rows].sort((a, b) => {
            const dateCompare = plainText(b.report_date, '').localeCompare(plainText(a.report_date, ''));
            if (dateCompare !== 0) return dateCompare;
            const qtyCompare = getOrderQuantity(b) - getOrderQuantity(a);
            if (qtyCompare !== 0) return qtyCompare;
            return plainText(a.product_name, '').localeCompare(plainText(b.product_name, ''));
        });
    }

    function populateCategoryFilter(rows) {
        if (!elements.ordersCategorySelect) return;
        const currentValue = elements.ordersCategorySelect.value || 'all';
        const categories = [...new Set(rows.map(row => row.category || 'Uncategorized'))].sort();
        elements.ordersCategorySelect.innerHTML = '<option value="all">All Categories</option>' + categories.map(category => {
            return `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`;
        }).join('');
        elements.ordersCategorySelect.value = categories.includes(currentValue) ? currentValue : 'all';
    }

    function getRecordsPageSize() {
        return Math.max(1, Number(elements.ordersPageSizeSelect?.value) || 25);
    }

    function updateRecordsPagination(totalRows, totalPages, pageSize) {
        const startItem = totalRows === 0 ? 0 : ((currentRecordsPage - 1) * pageSize) + 1;
        const endItem = Math.min(totalRows, currentRecordsPage * pageSize);
        if (elements.recordsShowingText) elements.recordsShowingText.textContent = `Showing ${startItem}-${endItem} of ${totalRows} records`;
        if (elements.ordersPageInfo) elements.ordersPageInfo.textContent = `Page ${currentRecordsPage} of ${totalPages}`;
        if (elements.prevOrdersPageBtn) elements.prevOrdersPageBtn.disabled = currentRecordsPage <= 1;
        if (elements.nextOrdersPageBtn) elements.nextOrdersPageBtn.disabled = currentRecordsPage >= totalPages;
    }

    function resetRecordsControls(message) {
        currentRecordsPage = 1;
        if (elements.ordersCategorySelect) {
            elements.ordersCategorySelect.innerHTML = '<option value="all">All Categories</option>';
            elements.ordersCategorySelect.value = 'all';
        }
        if (elements.ordersSearchInput) elements.ordersSearchInput.value = '';
        if (elements.recordsShowingText) elements.recordsShowingText.textContent = message;
        if (elements.ordersPageInfo) elements.ordersPageInfo.textContent = 'Page 1 of 1';
        if (elements.prevOrdersPageBtn) elements.prevOrdersPageBtn.disabled = true;
        if (elements.nextOrdersPageBtn) elements.nextOrdersPageBtn.disabled = true;
    }

    async function exportProductOrdersPdf() {
        if (!ensurePdfLibraryReady()) return;
        if (!productOrders.length) await loadProductOrdersReport();

        const rows = getPositiveOrderRows();
        if (!rows.length) {
            alert('No weekly product orders available to export for the selected range.');
            return;
        }

        showPdfLoading('Generating Weekly Report...', 'Creating a clean PDF report with weekly summary and detailed tables.');

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const { startDate, endDate } = getSelectedWeekRange();
            const stats = buildReportStats(rows);
            const reportTitle = 'WEEKLY PRODUCT ORDERS REPORT';
            const branchLabel = getSelectedOrderBranchLabel();
            const rangeLabel = getWeekRangeLabel(startDate, endDate);

            drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
            let y = 34;

            doc.autoTable({
                body: [
                    ['Week Range', rangeLabel, 'Total Orders', String(stats.totalQty)],
                    ['Branch Filter', branchLabel, 'Estimated Value', formatPesoForPdf(stats.estimatedTotal)],
                    ['Active Products', String(stats.activeProducts), 'Weeks Logged', String(stats.weeksLogged)],
                    ['16oz Cups Used', String(stats.cupUsage.cups16oz), '22oz Cups Used', String(stats.cupUsage.cups22oz)],
                    ['Total Cups Used', String(stats.cupUsage.totalCups), 'Calculation', '1 cup per recorded 16oz/22oz drink'],
                    ['Branches Logged', String(stats.branchesLogged), 'Top Product', stats.topProducts.length ? `${stats.topProducts[0].productName} (${stats.topProducts[0].quantity})` : 'No orders yet']
                ],
                startY: y,
                theme: 'grid',
                styles: { font: 'helvetica', fontSize: 8, cellPadding: 2.5, lineColor: border, lineWidth: 0.15, textColor: textGray },
                columnStyles: { 0: { fontStyle: 'bold', fillColor: cream }, 2: { fontStyle: 'bold', fillColor: cream } },
                margin: { left: 12, right: 12 }
            });

            y = doc.lastAutoTable.finalY + 9;
            addSectionTitle(doc, 'Top Products Graph Data', y);
            doc.autoTable({
                head: [['Rank', 'Product', 'Variant', 'Category', 'Total Qty', 'Estimated Value']],
                body: stats.topProducts.slice(0, 15).map((item, index) => [
                    String(index + 1), item.productName, item.variant || 'Regular', item.category || 'Uncategorized', String(item.quantity), formatPesoForPdf(item.estimatedTotal)
                ]),
                startY: y + 5,
                ...getStandardTableOptions(),
                columnStyles: { 0: { cellWidth: 14, halign: 'center' }, 1: { cellWidth: 66, fontStyle: 'bold' }, 2: { cellWidth: 35 }, 3: { cellWidth: 55 }, 4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' }, 5: { cellWidth: 40, halign: 'right', fontStyle: 'bold' } },
                didDrawPage() { drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`); }
            });

            y = doc.lastAutoTable.finalY + 9;
            if (y > 145) { doc.addPage(); drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`); y = 35; }

            addSectionTitle(doc, 'Weekly Breakdown', y);
            doc.autoTable({
                head: [['Week', 'Active Products', 'Branches', 'Total Qty', '16oz Cups', '22oz Cups', 'Total Cups', 'Estimated Value']],
                body: stats.weeklyBreakdown.map(item => [formatSingleWeekLabel(item.reportDate), String(item.activeProducts), String(item.branchesLogged), String(item.quantity), String(item.cups16oz), String(item.cups22oz), String(item.totalCups), formatPesoForPdf(item.estimatedTotal)]),
                startY: y + 5,
                ...getStandardTableOptions(),
                didDrawPage() { drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`); }
            });

            y = doc.lastAutoTable.finalY + 9;
            if (y > 145) { doc.addPage(); drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`); y = 35; }

            addSectionTitle(doc, 'Branch Breakdown', y);
            doc.autoTable({
                head: [['Branch', 'Active Products', 'Weeks', 'Total Qty', '16oz Cups', '22oz Cups', 'Total Cups', 'Estimated Value']],
                body: stats.branchBreakdown.map(item => [item.branchName, String(item.activeProducts), String(item.weeksLogged), String(item.quantity), String(item.cups16oz), String(item.cups22oz), String(item.totalCups), formatPesoForPdf(item.estimatedTotal)]),
                startY: y + 5,
                ...getStandardTableOptions(),
                didDrawPage() { drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`); }
            });

            doc.addPage();
            drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
            addSectionTitle(doc, 'Detailed Product Orders', 35);
            doc.autoTable({
                head: [['Week', 'Product', 'Variant', 'Category', 'Branch', 'Qty', 'Price', 'Total', 'Logged By', 'Updated']],
                body: getSortedOrderRows(rows).map(row => {
                    const qty = getOrderQuantity(row);
                    const price = getOrderPrice(row);
                    return [formatSingleWeekLabel(row.report_date), row.product_name || 'Unnamed Product', row.product_variant || 'Regular', row.category || 'Uncategorized', row.branch_name || 'Unassigned Branch', String(qty), formatPesoForPdf(price), formatPesoForPdf(qty * price), row.team_leader_name || 'Team Leader', formatPHDateTime(row.updated_at || row.created_at)];
                }),
                startY: 40,
                ...getStandardTableOptions(),
                styles: { ...getStandardTableOptions().styles, fontSize: 6.8, cellPadding: 1.6 },
                columnStyles: { 0: { cellWidth: 26 }, 1: { cellWidth: 36, fontStyle: 'bold' }, 2: { cellWidth: 25 }, 3: { cellWidth: 35 }, 4: { cellWidth: 31 }, 5: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, 6: { cellWidth: 19, halign: 'right' }, 7: { cellWidth: 23, halign: 'right', fontStyle: 'bold' }, 8: { cellWidth: 28 }, 9: { cellWidth: 36 } },
                didDrawPage() { drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`); }
            });

            addPdfPageNumbers(doc);
            doc.save(`Adrianos_Weekly_Product_Report_${startDate}_to_${endDate}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', error);
            alert('Error compiling weekly product PDF. Please check the console for details.');
        } finally {
            hidePdfLoading();
        }
    }

    function ensurePdfLibraryReady() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library failed to load. Please check your internet connection or CDN scripts.');
            return false;
        }
        const testDoc = new window.jspdf.jsPDF();
        if (typeof testDoc.autoTable !== 'function') {
            alert('PDF table library failed to load. Please check the jsPDF AutoTable CDN script.');
            return false;
        }
        return true;
    }

    function drawPdfHeader(doc, title, subtitle) {
        const pageWidth = doc.internal.pageSize.getWidth();
        doc.setFillColor(...cream);
        doc.rect(0, 0, pageWidth, 27, 'F');
        doc.setTextColor(...coffeeDark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text(title, pageWidth / 2, 12, { align: 'center' });
        doc.setTextColor(...coffeeMedium);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(subtitle, pageWidth / 2, 18, { align: 'center' });
        doc.setDrawColor(...coffeeDark);
        doc.setLineWidth(0.45);
        doc.line(12, 24, pageWidth - 12, 24);
    }

    function addSectionTitle(doc, title, y) {
        doc.setTextColor(...coffeeDark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(title, 12, y);
    }

    function getStandardTableOptions() {
        return {
            theme: 'grid',
            margin: { top: 32, right: 12, bottom: 16, left: 12 },
            styles: { font: 'helvetica', fontSize: 7.6, cellPadding: 2, overflow: 'linebreak', valign: 'middle', lineColor: border, lineWidth: 0.15, textColor: textGray },
            headStyles: { fillColor: coffeeDark, textColor: 255, fontStyle: 'bold', halign: 'center' },
            alternateRowStyles: { fillColor: [250, 249, 246] }
        };
    }

    function addPdfPageNumbers(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const generated = `Generated: ${new Date().toLocaleString('en-PH', { timeZone: PH_TIMEZONE, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
        for (let page = 1; page <= pageCount; page++) {
            doc.setPage(page);
            doc.setDrawColor(...border);
            doc.setLineWidth(0.2);
            doc.line(12, pageHeight - 11, pageWidth - 12, pageHeight - 11);
            doc.setTextColor(120, 120, 120);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(generated, 12, pageHeight - 6);
            doc.text(`Page ${page} of ${pageCount}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
        }
    }

    function getUniqueProductKeys(rows) {
        return new Set(rows.map(row => getProductKey(row)));
    }

    function getProductKey(row) {
        return row.product_key || `${row.product_name || 'product'}-${row.product_variant || 'regular'}-${row.category || 'uncategorized'}`;
    }

    function getOrderQuantity(row) {
        return Math.max(0, Number(row.quantity) || 0);
    }

    function getOrderPrice(row) {
        return Math.max(0, Number(row.price) || 0);
    }


    function normalizeProductCategory(category) {
        const original = String(category || '').trim();
        const clean = original
            .toLowerCase()
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

        const starterCategories = new Set([
            'fries and nachos series',
            'quesadilla spree',
            'quesadillas spree',
            'dip it good',
            'hunger crusher',
            'hunger crushers',
            'snack bar remix',
            'snackbar remix'
        ]);

        const riceMealCategories = new Set([
            'kanin get enough',
            'flavor trip',
            'the flavor trip',
            'flavour trip',
            'the flavour trip'
        ]);

        if (starterCategories.has(clean)) return 'Starters';
        if (riceMealCategories.has(clean)) return 'Rice Meals';
        if (clean === 'more to enjoy add ons') return 'More To Enjoy';

        return original || 'Uncategorized';
    }

    function getBranchName(branchId) {
        if (!branchId) return 'Unassigned Branch';
        return branchesList.find(branch => String(branch.id) === String(branchId))?.name || 'Unassigned Branch';
    }

    function getSelectedOrderBranchLabel() {
        if (!elements.orderBranchSelect.value || elements.orderBranchSelect.value === 'all') return 'All Branches';
        return elements.orderBranchSelect.options[elements.orderBranchSelect.selectedIndex]?.textContent || 'Selected Branch';
    }

    function getPHDateKey() {
        const parts = new Intl.DateTimeFormat('en-US', { timeZone: PH_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
        const year = parts.find(part => part.type === 'year').value;
        const month = parts.find(part => part.type === 'month').value;
        const day = parts.find(part => part.type === 'day').value;
        return `${year}-${month}-${day}`;
    }

    function getPHWeekStartKey(dateKey = getPHDateKey()) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const weekday = date.getUTCDay();
        const daysFromMonday = (weekday + 6) % 7;
        date.setUTCDate(date.getUTCDate() - daysFromMonday);
        return formatUTCDateKey(date);
    }

    function addDaysToDateKey(dateKey, amount) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + amount);
        return formatUTCDateKey(date);
    }

    function formatUTCDateKey(date) {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    function getWeekRangeLabel(startWeek, endWeek) {
        if (startWeek === endWeek) return formatSingleWeekLabel(startWeek);
        return `${formatSingleWeekLabel(startWeek)} to ${formatSingleWeekLabel(endWeek)}`;
    }

    function formatSingleWeekLabel(weekStartKey) {
        const weekEndKey = addDaysToDateKey(weekStartKey, 6);
        return `${formatOrderDateShort(weekStartKey)} - ${formatOrderDateShort(weekEndKey)}`;
    }

    function formatOrderDateShort(dateKey) {
        if (!dateKey) return 'N/A';
        try {
            const [year, month, day] = String(dateKey).split('-').map(Number);
            const date = new Date(Date.UTC(year, month - 1, day));
            return new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }).format(date);
        } catch {
            return dateKey;
        }
    }

    function formatPHDateTime(value) {
        if (!value) return 'N/A';
        try {
            return new Intl.DateTimeFormat('en-PH', { timeZone: PH_TIMEZONE, year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
        } catch {
            return value;
        }
    }

    function formatPeso(value) {
        return `₱${Number(value || 0).toLocaleString('en-PH')}`;
    }

    function formatPesoForPdf(value) {
        return `PHP ${Number(value || 0).toLocaleString('en-PH')}`;
    }

    function plainText(value, fallback = 'N/A') {
        const text = String(value ?? '').trim();
        return text.length ? text : fallback;
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showPdfLoading(title, message) {
        elements.pdfLoadingTitle.textContent = title;
        elements.pdfLoadingMessage.textContent = message;
        elements.pdfLoadingOverlay.classList.remove('hidden');
        elements.exportOrdersPdfBtn.disabled = true;
        elements.refreshOrdersBtn.disabled = true;
    }

    function hidePdfLoading() {
        elements.pdfLoadingOverlay.classList.add('hidden');
        elements.exportOrdersPdfBtn.disabled = false;
        elements.refreshOrdersBtn.disabled = false;
    }

    function showToast(message, type = 'success') {
        elements.toast.textContent = message;
        elements.toast.className = `toast ${type}`;
        setTimeout(() => elements.toast.classList.add('hidden'), 2800);
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
});
