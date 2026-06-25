import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const ORDERS_TABLE_NAME = 'daily_product_orders';
    const PH_TIMEZONE = 'Asia/Manila';
    const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

    const isAdminLoggedIn = sessionStorage.getItem('adrianosAdminAuth') === 'true';
    const adminLoginTime = Number(sessionStorage.getItem('adrianosAdminLoginTime') || 0);
    const isSessionExpired = !adminLoginTime || Date.now() - adminLoginTime > ADMIN_SESSION_MAX_AGE;

    if (!isAdminLoggedIn || isSessionExpired) {
        clearAdminSession();
        window.location.replace('tl-login.html');
        return;
    }

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
        topProductsList: document.getElementById('topProductsList'),
        dailyOrdersList: document.getElementById('dailyOrdersList'),
        branchOrdersList: document.getElementById('branchOrdersList'),
        ordersSearchInput: document.getElementById('ordersSearchInput'),
        ordersCategorySelect: document.getElementById('ordersCategorySelect'),
        ordersPageSizeSelect: document.getElementById('ordersPageSizeSelect'),
        recordsShowingText: document.getElementById('recordsShowingText'),
        ordersPagination: document.getElementById('ordersPagination'),
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
    const softRow = [250, 249, 246];

    async function initReportPage() {
        initDateRange();
        bindEvents();
        await fetchBranches();
        await loadProductOrdersReport();
    }

    function bindEvents() {
        elements.logoutBtn.addEventListener('click', logout);
        elements.orderQuickRangeSelect.addEventListener('change', handleQuickRangeChange);
        elements.orderStartDateInput.addEventListener('change', handleManualDateRangeChange);
        elements.orderEndDateInput.addEventListener('change', handleManualDateRangeChange);
        elements.orderBranchSelect.addEventListener('change', loadProductOrdersReport);
        elements.refreshOrdersBtn.addEventListener('click', loadProductOrdersReport);
        elements.exportOrdersPdfBtn.addEventListener('click', exportProductOrdersPdf);

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

    function initDateRange() {
        const today = getPHDateKey();
        elements.orderQuickRangeSelect.value = 'today';
        elements.orderStartDateInput.value = today;
        elements.orderEndDateInput.value = today;
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
            console.error('Branch load failed:', JSON.stringify(error, null, 2));
            showToast('Failed to load branches. Report still works with All Branches.', 'error');
        }
    }

    function handleQuickRangeChange() {
        applyQuickRange(elements.orderQuickRangeSelect.value);
        loadProductOrdersReport();
    }

    function handleManualDateRangeChange() {
        elements.orderQuickRangeSelect.value = 'custom';
        normalizeSelectedDateRange();
        loadProductOrdersReport();
    }

    function applyQuickRange(rangeValue) {
        const today = getPHDateKey();
        let startDate = today;
        let endDate = today;

        if (rangeValue === '7days') {
            startDate = addDaysToDateKey(today, -6);
        } else if (rangeValue === '30days') {
            startDate = addDaysToDateKey(today, -29);
        } else if (rangeValue === 'custom') {
            normalizeSelectedDateRange();
            return;
        }

        elements.orderStartDateInput.value = startDate;
        elements.orderEndDateInput.value = endDate;
        updateOrdersRangeNote();
    }

    function normalizeSelectedDateRange() {
        const today = getPHDateKey();

        if (!elements.orderStartDateInput.value) {
            elements.orderStartDateInput.value = today;
        }

        if (!elements.orderEndDateInput.value) {
            elements.orderEndDateInput.value = elements.orderStartDateInput.value;
        }

        if (elements.orderStartDateInput.value > elements.orderEndDateInput.value) {
            const tempDate = elements.orderStartDateInput.value;
            elements.orderStartDateInput.value = elements.orderEndDateInput.value;
            elements.orderEndDateInput.value = tempDate;
        }

        updateOrdersRangeNote();
    }

    function getSelectedDateRange() {
        normalizeSelectedDateRange();

        return {
            startDate: elements.orderStartDateInput.value,
            endDate: elements.orderEndDateInput.value
        };
    }

    function updateOrdersRangeNote() {
        const startDate = elements.orderStartDateInput.value || getPHDateKey();
        const endDate = elements.orderEndDateInput.value || startDate;
        const branchLabel = getSelectedOrderBranchLabel();

        elements.ordersRangeNote.textContent = `Showing orders from ${getRangeLabel(startDate, endDate)} • ${branchLabel}.`;
    }

    async function loadProductOrdersReport() {
        const { startDate, endDate } = getSelectedDateRange();
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

            productOrders = data || [];
            currentRecordsPage = 1;
            renderProductOrdersReport();
        } catch (error) {
            console.error('Product orders load failed:', JSON.stringify(error, null, 2));
            productOrders = [];
            renderEmptyProductOrders('Failed to load product orders. Please check the daily_product_orders table.');
        } finally {
            setLoadingState(false);
        }
    }

    function setLoadingState(isLoading) {
        elements.refreshOrdersBtn.disabled = isLoading;
        elements.exportOrdersPdfBtn.disabled = isLoading;
        elements.refreshOrdersBtn.textContent = isLoading ? 'Loading...' : 'Refresh Orders';

        if (isLoading) {
            elements.ordersTableBody.innerHTML = '<tr><td colspan="10" class="loading-text">Loading product orders...</td></tr>';
        }
    }

    function renderProductOrdersReport() {
        const rows = getPositiveOrderRows();
        const stats = buildReportStats(rows);

        elements.ordersTotalQty.textContent = String(stats.totalQty);
        elements.ordersActiveProducts.textContent = String(stats.activeProducts);
        elements.ordersBranchCount.textContent = String(stats.branchesLogged);
        elements.ordersDaysCovered.textContent = String(stats.daysLogged);
        elements.ordersEstimatedValue.textContent = formatPeso(stats.estimatedTotal);
        elements.ordersTopProduct.textContent = stats.topProducts.length
            ? `${stats.topProducts[0].productName} (${stats.topProducts[0].quantity})`
            : 'No orders yet';

        renderTopProducts(stats.topProducts);
        renderDailyBreakdown(stats.dailyBreakdown);
        renderBranchBreakdown(stats.branchBreakdown);
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
        elements.topProductsList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        elements.dailyOrdersList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        elements.branchOrdersList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        resetRecordsControls(message);
        elements.ordersTableBody.innerHTML = `<tr><td colspan="10" class="loading-text">${escapeHTML(message)}</td></tr>`;
    }

    function renderTopProducts(topProducts) {
        if (!topProducts.length) {
            elements.topProductsList.innerHTML = '<div class="empty-state">No product orders found for this range.</div>';
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

    function renderDailyBreakdown(dailyBreakdown) {
        if (!dailyBreakdown.length) {
            elements.dailyOrdersList.innerHTML = '<div class="empty-state">No daily orders found for this range.</div>';
            return;
        }

        elements.dailyOrdersList.innerHTML = dailyBreakdown.map(item => {
            return `
                <div class="rank-item">
                    <div>
                        <strong>${escapeHTML(formatOrderDateLong(item.reportDate))}</strong>
                        <span>${item.activeProducts} active product${item.activeProducts === 1 ? '' : 's'} • ${item.branchesLogged} branch${item.branchesLogged === 1 ? '' : 'es'} • ${formatPeso(item.estimatedTotal)}</span>
                    </div>
                    <div class="rank-count">${item.quantity}</div>
                </div>
            `;
        }).join('');
    }

    function renderBranchBreakdown(branchBreakdown) {
        if (!branchBreakdown.length) {
            elements.branchOrdersList.innerHTML = '<div class="empty-state">No branch orders found for this range.</div>';
            return;
        }

        elements.branchOrdersList.innerHTML = branchBreakdown.map(item => {
            return `
                <div class="rank-item">
                    <div>
                        <strong>${escapeHTML(item.branchName)}</strong>
                        <span>${item.activeProducts} active product${item.activeProducts === 1 ? '' : 's'} • ${item.daysLogged} day${item.daysLogged === 1 ? '' : 's'} • ${formatPeso(item.estimatedTotal)}</span>
                    </div>
                    <div class="rank-count">${item.quantity}</div>
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
            elements.ordersTableBody.innerHTML = '<tr><td colspan="10" class="loading-text">No product orders logged for the selected range.</td></tr>';
            return;
        }

        if (!totalRows) {
            elements.ordersTableBody.innerHTML = '<tr><td colspan="10" class="loading-text">No records match your search or category filter.</td></tr>';
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
                    <td>${escapeHTML(formatOrderDateShort(row.report_date))}</td>
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

    function getFilteredDetailRows(rows) {
        const searchTerm = plainText(elements.ordersSearchInput?.value, '').toLowerCase();
        const selectedCategory = elements.ordersCategorySelect?.value || 'all';

        return rows.filter(row => {
            const category = plainText(row.category, 'Uncategorized');
            const matchesCategory = selectedCategory === 'all' || category === selectedCategory;

            if (!matchesCategory) return false;
            if (!searchTerm) return true;

            const searchableText = [
                row.report_date,
                row.product_name,
                row.product_variant || 'Regular',
                row.category || 'Uncategorized',
                row.branch_name || 'Unassigned Branch',
                row.team_leader_name || 'Team Leader',
                formatPeso(getOrderPrice(row)),
                String(getOrderQuantity(row))
            ].join(' ').toLowerCase();

            return searchableText.includes(searchTerm);
        });
    }

    function populateCategoryFilter(rows) {
        if (!elements.ordersCategorySelect) return;

        const currentValue = elements.ordersCategorySelect.value || 'all';
        const categories = [...new Set(rows.map(row => plainText(row.category, 'Uncategorized')))]
            .filter(Boolean)
            .sort((a, b) => a.localeCompare(b));

        elements.ordersCategorySelect.innerHTML = '<option value="all">All Categories</option>' +
            categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('');

        const hasCurrentValue = currentValue === 'all' || categories.includes(currentValue);
        elements.ordersCategorySelect.value = hasCurrentValue ? currentValue : 'all';
    }

    function getRecordsPageSize() {
        const selectedSize = Number(elements.ordersPageSizeSelect?.value || 25);
        return Number.isFinite(selectedSize) && selectedSize > 0 ? selectedSize : 25;
    }

    function updateRecordsPagination(totalRows, totalPages, pageSize) {
        const startRecord = totalRows === 0 ? 0 : (currentRecordsPage - 1) * pageSize + 1;
        const endRecord = totalRows === 0 ? 0 : Math.min(totalRows, currentRecordsPage * pageSize);

        if (elements.recordsShowingText) {
            elements.recordsShowingText.textContent = totalRows
                ? `Showing ${startRecord}-${endRecord} of ${totalRows} records`
                : 'Showing 0 records';
        }

        if (elements.ordersPageInfo) {
            elements.ordersPageInfo.textContent = `Page ${currentRecordsPage} of ${totalPages}`;
        }

        if (elements.prevOrdersPageBtn) {
            elements.prevOrdersPageBtn.disabled = currentRecordsPage <= 1 || totalRows === 0;
        }

        if (elements.nextOrdersPageBtn) {
            elements.nextOrdersPageBtn.disabled = currentRecordsPage >= totalPages || totalRows === 0;
        }
    }

    function resetRecordsControls(message = 'No records') {
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

    function buildReportStats(rows) {
        const topProducts = getTopProducts(rows);
        const dailyBreakdown = getDailyBreakdown(rows);
        const branchBreakdown = getBranchBreakdown(rows);

        return {
            totalQty: rows.reduce((sum, row) => sum + getOrderQuantity(row), 0),
            estimatedTotal: rows.reduce((sum, row) => sum + getOrderQuantity(row) * getOrderPrice(row), 0),
            activeProducts: getUniqueProductKeys(rows).size,
            branchesLogged: branchBreakdown.length,
            daysLogged: dailyBreakdown.length,
            topProducts,
            dailyBreakdown,
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

        return [...map.values()].sort((a, b) => {
            const qtyCompare = b.quantity - a.quantity;
            if (qtyCompare !== 0) return qtyCompare;
            return a.productName.localeCompare(b.productName);
        });
    }

    function getDailyBreakdown(rows) {
        const map = new Map();

        rows.forEach(row => {
            const reportDate = row.report_date || 'Unknown Date';
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);

            if (!map.has(reportDate)) {
                map.set(reportDate, {
                    reportDate,
                    quantity: 0,
                    estimatedTotal: 0,
                    products: new Set(),
                    branches: new Set()
                });
            }

            const item = map.get(reportDate);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
            item.products.add(getProductKey(row));
            item.branches.add(row.branch_key || row.branch_name || 'unassigned');
        });

        return [...map.values()]
            .map(item => ({
                reportDate: item.reportDate,
                quantity: item.quantity,
                estimatedTotal: item.estimatedTotal,
                activeProducts: item.products.size,
                branchesLogged: item.branches.size
            }))
            .sort((a, b) => String(b.reportDate).localeCompare(String(a.reportDate)));
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
                    dates: new Set()
                });
            }

            const item = map.get(key);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
            item.products.add(getProductKey(row));
            if (row.report_date) item.dates.add(row.report_date);
        });

        return [...map.values()]
            .map(item => ({
                branchKey: item.branchKey,
                branchName: item.branchName,
                quantity: item.quantity,
                estimatedTotal: item.estimatedTotal,
                activeProducts: item.products.size,
                daysLogged: item.dates.size
            }))
            .sort((a, b) => b.quantity - a.quantity || a.branchName.localeCompare(b.branchName));
    }

    function getPositiveOrderRows() {
        return productOrders.filter(row => getOrderQuantity(row) > 0);
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

    async function exportProductOrdersPdf() {
        if (!ensurePdfLibraryReady()) return;

        if (!productOrders.length) {
            await loadProductOrdersReport();
        }

        const rows = getPositiveOrderRows();

        if (!rows.length) {
            alert('No product orders available to export for the selected range.');
            return;
        }

        showPdfLoading('Generating Product Report...', 'Creating a clean PDF report with summary and detailed tables.');

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
            const { startDate, endDate } = getSelectedDateRange();
            const stats = buildReportStats(rows);
            const reportTitle = 'PRODUCT ORDERS SUMMARY REPORT';
            const branchLabel = getSelectedOrderBranchLabel();
            const rangeLabel = getRangeLabel(startDate, endDate);

            drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
            let y = 35;

            y = addSummaryCards(doc, {
                dateRange: rangeLabel,
                branchLabel,
                totalQty: stats.totalQty,
                activeProducts: stats.activeProducts,
                branchesLogged: stats.branchesLogged,
                daysLogged: stats.daysLogged,
                estimatedTotal: stats.estimatedTotal,
                topProduct: stats.topProducts.length ? `${stats.topProducts[0].productName} (${stats.topProducts[0].quantity})` : 'No orders yet'
            }, y);

            y += 8;
            addSectionTitle(doc, 'Top Products Summary', y);
            y += 5;

            doc.autoTable({
                head: [['Rank', 'Product', 'Variant', 'Category', 'Total Qty', 'Estimated Value']],
                body: stats.topProducts.slice(0, 15).map((item, index) => [
                    String(index + 1),
                    item.productName,
                    item.variant || 'Regular',
                    item.category || 'Uncategorized',
                    String(item.quantity),
                    formatPesoForPdf(item.estimatedTotal)
                ]),
                startY: y,
                ...getStandardTableOptions(doc),
                columnStyles: {
                    0: { cellWidth: 14, halign: 'center' },
                    1: { cellWidth: 66, fontStyle: 'bold' },
                    2: { cellWidth: 36 },
                    3: { cellWidth: 58 },
                    4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
                    5: { cellWidth: 38, halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage() {
                    drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
                }
            });

            y = doc.lastAutoTable.finalY + 9;

            const pageHeight = doc.internal.pageSize.getHeight();
            if (y > pageHeight - 50) {
                doc.addPage();
                drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
                y = 35;
            }

            addSectionTitle(doc, 'Daily Breakdown', y);
            doc.autoTable({
                head: [['Date', 'Active Products', 'Branches Logged', 'Total Qty', 'Estimated Value']],
                body: stats.dailyBreakdown.map(item => [
                    formatOrderDateShort(item.reportDate),
                    String(item.activeProducts),
                    String(item.branchesLogged),
                    String(item.quantity),
                    formatPesoForPdf(item.estimatedTotal)
                ]),
                startY: y + 5,
                ...getStandardTableOptions(doc),
                columnStyles: {
                    0: { cellWidth: 50, fontStyle: 'bold' },
                    1: { cellWidth: 40, halign: 'center' },
                    2: { cellWidth: 40, halign: 'center' },
                    3: { cellWidth: 35, halign: 'center', fontStyle: 'bold' },
                    4: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage() {
                    drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
                }
            });

            y = doc.lastAutoTable.finalY + 9;

            if (y > pageHeight - 50) {
                doc.addPage();
                drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
                y = 35;
            }

            addSectionTitle(doc, 'Branch Breakdown', y);
            doc.autoTable({
                head: [['Branch', 'Active Products', 'Days Logged', 'Total Qty', 'Estimated Value']],
                body: stats.branchBreakdown.map(item => [
                    item.branchName,
                    String(item.activeProducts),
                    String(item.daysLogged),
                    String(item.quantity),
                    formatPesoForPdf(item.estimatedTotal)
                ]),
                startY: y + 5,
                ...getStandardTableOptions(doc),
                columnStyles: {
                    0: { cellWidth: 78, fontStyle: 'bold' },
                    1: { cellWidth: 40, halign: 'center' },
                    2: { cellWidth: 35, halign: 'center' },
                    3: { cellWidth: 35, halign: 'center', fontStyle: 'bold' },
                    4: { cellWidth: 45, halign: 'right', fontStyle: 'bold' }
                },
                didDrawPage() {
                    drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
                }
            });

            doc.addPage();
            drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
            addSectionTitle(doc, 'Detailed Product Orders', 35);

            doc.autoTable({
                head: [['Date', 'Product', 'Variant', 'Category', 'Branch', 'Qty', 'Price', 'Total', 'Logged By', 'Updated']],
                body: getSortedOrderRows(rows).map(row => {
                    const qty = getOrderQuantity(row);
                    const price = getOrderPrice(row);
                    return [
                        formatOrderDateShort(row.report_date),
                        row.product_name || 'Unnamed Product',
                        row.product_variant || 'Regular',
                        row.category || 'Uncategorized',
                        row.branch_name || 'Unassigned Branch',
                        String(qty),
                        formatPesoForPdf(price),
                        formatPesoForPdf(qty * price),
                        row.team_leader_name || 'Team Leader',
                        formatPHDateTime(row.updated_at || row.created_at)
                    ];
                }),
                startY: 41,
                ...getStandardTableOptions(doc),
                styles: {
                    ...getBaseTableStyles(),
                    fontSize: 6.7,
                    cellPadding: 1.55
                },
                columnStyles: {
                    0: { cellWidth: 24 },
                    1: { cellWidth: 39, fontStyle: 'bold' },
                    2: { cellWidth: 27 },
                    3: { cellWidth: 37 },
                    4: { cellWidth: 32 },
                    5: { cellWidth: 13, halign: 'center', fontStyle: 'bold' },
                    6: { cellWidth: 22, halign: 'right' },
                    7: { cellWidth: 25, halign: 'right', fontStyle: 'bold' },
                    8: { cellWidth: 29 },
                    9: { cellWidth: 32 }
                },
                didDrawPage() {
                    drawPdfHeader(doc, reportTitle, `${rangeLabel} | ${branchLabel}`);
                }
            });

            addPdfPageNumbers(doc);
            doc.save(`Adrianos_Product_Orders_${startDate}_to_${endDate}.pdf`);
        } catch (error) {
            console.error('PDF export failed:', JSON.stringify(error, null, 2));
            alert('Error compiling product orders PDF. Please check the console for details.');
        } finally {
            hidePdfLoading();
        }
    }

    function ensurePdfLibraryReady() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library failed to load. Please check your internet connection.');
            return false;
        }

        const testDoc = new window.jspdf.jsPDF();

        if (typeof testDoc.autoTable !== 'function') {
            alert('PDF table library failed to load. Please check the jsPDF AutoTable script.');
            return false;
        }

        return true;
    }

    function drawPdfHeader(doc, title, subtitle) {
        const pageWidth = doc.internal.pageSize.getWidth();

        doc.setFillColor(...coffeeDark);
        doc.rect(0, 0, pageWidth, 24, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('ADRIANOS', 12, 10);

        doc.setFontSize(11);
        doc.text(title, pageWidth - 12, 10, { align: 'right' });

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.text(subtitle, pageWidth - 12, 16, { align: 'right' });

        doc.setDrawColor(...coffeeMedium);
        doc.setLineWidth(0.8);
        doc.line(12, 28, pageWidth - 12, 28);
    }

    function addSectionTitle(doc, title, y) {
        doc.setTextColor(...coffeeDark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text(title, 12, y);

        doc.setDrawColor(...border);
        doc.setLineWidth(0.25);
        doc.line(12, y + 2, doc.internal.pageSize.getWidth() - 12, y + 2);
    }

    function addSummaryCards(doc, stats, startY) {
        const pageWidth = doc.internal.pageSize.getWidth();
        const left = 12;
        const gap = 5;
        const cardWidth = (pageWidth - 24 - (gap * 3)) / 4;
        const cardHeight = 18;
        const cards = [
            ['Date Range', stats.dateRange],
            ['Branch Filter', stats.branchLabel],
            ['Total Orders', String(stats.totalQty)],
            ['Estimated Value', formatPesoForPdf(stats.estimatedTotal)],
            ['Active Products', String(stats.activeProducts)],
            ['Branches Logged', String(stats.branchesLogged)],
            ['Days Logged', String(stats.daysLogged)],
            ['Top Product', stats.topProduct]
        ];

        cards.forEach((card, index) => {
            const row = Math.floor(index / 4);
            const col = index % 4;
            const x = left + col * (cardWidth + gap);
            const y = startY + row * (cardHeight + gap);
            const highlighted = index === 2 || index === 3;

            if (highlighted) {
                doc.setFillColor(...cream);
            } else {
                doc.setFillColor(255, 255, 255);
            }

            doc.setDrawColor(...border);
            doc.setLineWidth(0.25);
            doc.roundedRect(x, y, cardWidth, cardHeight, 2, 2, 'FD');

            doc.setTextColor(...coffeeMedium);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.4);
            doc.text(card[0].toUpperCase(), x + 3, y + 6);

            doc.setTextColor(...coffeeDark);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(String(card[1]).length > 30 ? 7.5 : 8.7);
            doc.text(String(card[1]), x + 3, y + 13, { maxWidth: cardWidth - 6 });
        });

        return startY + cardHeight * 2 + gap;
    }

    function getBaseTableStyles() {
        return {
            font: 'helvetica',
            fontSize: 7.3,
            cellPadding: 1.9,
            overflow: 'linebreak',
            valign: 'middle',
            lineColor: border,
            lineWidth: 0.12,
            textColor: textGray
        };
    }

    function getStandardTableOptions(doc) {
        return {
            margin: { top: 34, right: 12, bottom: 16, left: 12 },
            theme: 'grid',
            rowPageBreak: 'avoid',
            pageBreak: 'auto',
            styles: getBaseTableStyles(),
            headStyles: {
                fillColor: coffeeDark,
                textColor: 255,
                fontStyle: 'bold',
                halign: 'center'
            },
            alternateRowStyles: {
                fillColor: softRow
            }
        };
    }

    function addPdfPageNumbers(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const generated = `Generated: ${formatGeneratedDate()}`;

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

    function getBranchName(branchId) {
        if (!branchId) return 'Unassigned Branch';
        return branchesList.find(branch => String(branch.id) === String(branchId))?.name || 'Unassigned Branch';
    }

    function getSelectedOrderBranchLabel() {
        if (!elements.orderBranchSelect.value || elements.orderBranchSelect.value === 'all') {
            return 'All Branches';
        }

        return elements.orderBranchSelect.options[elements.orderBranchSelect.selectedIndex]?.textContent || 'Selected Branch';
    }

    function getRangeLabel(startDate, endDate) {
        if (startDate === endDate) {
            return formatOrderDateLong(startDate);
        }

        return `${formatOrderDateLong(startDate)} to ${formatOrderDateLong(endDate)}`;
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

    function addDaysToDateKey(dateKey, amount) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + amount);

        const outputYear = date.getUTCFullYear();
        const outputMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
        const outputDay = String(date.getUTCDate()).padStart(2, '0');

        return `${outputYear}-${outputMonth}-${outputDay}`;
    }

    function formatOrderDateLong(dateKey) {
        if (!dateKey) return 'N/A';

        try {
            const date = new Date(`${dateKey}T00:00:00+08:00`);
            return new Intl.DateTimeFormat('en-PH', {
                timeZone: PH_TIMEZONE,
                year: 'numeric',
                month: 'long',
                day: '2-digit'
            }).format(date);
        } catch {
            return dateKey;
        }
    }

    function formatOrderDateShort(dateKey) {
        if (!dateKey) return 'N/A';

        try {
            const date = new Date(`${dateKey}T00:00:00+08:00`);
            return new Intl.DateTimeFormat('en-PH', {
                timeZone: PH_TIMEZONE,
                month: 'short',
                day: '2-digit',
                year: 'numeric'
            }).format(date);
        } catch {
            return dateKey;
        }
    }

    function formatPHDateTime(value) {
        if (!value) return 'N/A';

        try {
            return new Intl.DateTimeFormat('en-PH', {
                timeZone: PH_TIMEZONE,
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).format(new Date(value));
        } catch {
            return value;
        }
    }

    function formatGeneratedDate() {
        return new Intl.DateTimeFormat('en-PH', {
            timeZone: PH_TIMEZONE,
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: true
        }).format(new Date());
    }

    function formatPeso(amount) {
        const value = Number(amount) || 0;

        return value.toLocaleString('en-PH', {
            style: 'currency',
            currency: 'PHP',
            minimumFractionDigits: value % 1 === 0 ? 0 : 2,
            maximumFractionDigits: 2
        });
    }

    function formatPesoForPdf(amount) {
        const value = Number(amount) || 0;
        const formatted = value.toLocaleString('en-PH', {
            minimumFractionDigits: value % 1 === 0 ? 0 : 2,
            maximumFractionDigits: 2
        });

        return `PHP ${formatted}`;
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

        setTimeout(() => {
            elements.toast.classList.add('hidden');
        }, 2800);
    }

    function clearAdminSession() {
        sessionStorage.removeItem('adrianosAdminAuth');
        sessionStorage.removeItem('adrianosAdminLoginTime');
        sessionStorage.removeItem('adrianosAdminUsername');
    }

    function logout() {
        clearAdminSession();
        window.location.replace('tl-login.html');
    }

    initReportPage();
});
