import { supabase } from './supabaseClient.js';

const TABLE_NAME = 'daily_product_orders';
const EXPENSE_NAMES_TABLE = 'expense_names';
const WEEKLY_EXPENSES_TABLE = 'weekly_expenses';
const PH_TIMEZONE = 'Asia/Manila';

const PRODUCTS = [
    ...createSizedProducts('Cold Brew', ['Spanish Latte', 'Caramel Macchiato', 'Salted Caramel', 'Mocha Latte', 'Hazelnut Mocha', 'Americano', 'Cream Cheese Latte', 'French Vanilla'], [
        { size: '16oz', price: 80 },
        { size: '22oz', price: 90 }
    ]),
    ...createSingleSizeProducts('Premium Cold Brew', ['Biscoff Latte', 'Ube Latte', 'Sea Salt Latte', 'Yema Affogato', 'Pistachio Cream Latte', 'Adz Latte', 'Salted Matcha', 'Vietnamese', 'Dirty Matcha', 'Kape Palma'], '22oz', 125),

    ...createSizedProducts('Soda', ['Strawberry', 'Lychee', 'Blueberry', 'Bubblegum', 'Green Apple', 'Watermelon', 'Grapes'], [
        { size: '16oz', price: 65 },
        { size: '22oz', price: 75 }
    ]),
    ...createSizedProducts('Fruit Tea', ['Strawberry', 'Lychee', 'Blueberry', 'Bubblegum', 'Grapes', 'Mixed Berries', 'Green Apple', 'Watermelon'], [
        { size: '16oz', price: 75 },
        { size: '22oz', price: 80 }
    ]),

    ...createSizedProducts('Espresso Iced', ['Americano', 'Latte', 'Spanish Latte', 'Cream Cheese Latte', 'French Vanilla', 'Salted Caramel', 'Hazelnut Mocha', 'Mocha', 'Caramel'], [
        { size: '16oz', price: 120 },
        { size: '22oz', price: 130 }
    ]),
    ...createSingleSizeProducts('Espresso Hot', ['Americano', 'Cappuccino', 'Latte'], '8oz', 100),
    ...createSingleSizeProducts('Premium Espresso', ['Biscoff Latte', 'Sea Salt Latte', 'Salted Matcha', 'Pistachio Cream Latte', 'Kape Palma', 'Dirty Matcha', 'Ube Latte', 'Adz Latte', 'Yema Affogato'], '22oz', 140),

    ...createSingleSizeProducts('Premium Milk Based', ['Oreo', 'Matcha Milk', 'Strawberry Matcha', 'Pure Cocoa', 'Ube Milk', 'Biscoff Milk', 'Mango Graham'], '22oz', 125),
    ...createSizedProducts('Milk Based', ['Blueberry', 'Strawberry', 'Mango'], [
        { size: '16oz', price: 75 },
        { size: '22oz', price: 85 }
    ]),
    createProduct('More To Enjoy', 'Thai Milk Tea', '22oz', 130, 'More To Enjoy / Add Ons', ''),
    createProduct('More To Enjoy', 'Hot Chocolate', '8oz', 70, 'More To Enjoy / Add Ons', ''),
    createProduct('More To Enjoy', 'Mineral Water', '', 25, 'More To Enjoy / Add Ons'),
    createProduct('More To Enjoy', 'Coke in Can', '', 70, 'More To Enjoy / Add Ons'),
    createProduct('More To Enjoy', 'Nata', '', 20, 'More To Enjoy / Add Ons'),
    createProduct('More To Enjoy', 'Cold Foam', '', 20, 'More To Enjoy / Add Ons'),
    createProduct('More To Enjoy', 'Oat Milk', '', 50, 'More To Enjoy / Add Ons'),
    createProduct('More To Enjoy', 'Biscoff Spread', '', 25),
    createProduct('More To Enjoy', 'Extra Single Shot Espresso', '', 25),
    createProduct('More To Enjoy', 'Extra Double Shot Espresso', '', 50),

    createProduct('Starters', 'French Fries', 'Plain', 90),
    createProduct('Starters', 'French Fries', 'Sour Cream', 90, 'Fries and Nachos Series'),
    createProduct('Starters', 'French Fries', 'BBQ', 90, 'Fries and Nachos Series'),
    createProduct('Starters', 'French Fries', 'Cheese', 90, 'Fries and Nachos Series'),
    createProduct('Starters', 'Nachos', '', 95, 'Fries and Nachos Series'),
    createProduct('Starters', 'Nachos Fries', '', 155, 'Fries and Nachos Series'),
    createProduct('Starters', 'Shawarma Fries', '', 100, 'Fries and Nachos Series'),
    createProduct('Starters', 'Cheesy Fries', '', 100, 'Fries and Nachos Series'),
    createProduct('Starters', 'Cheese Quesadillas', '', 105, 'Quesadilla Spree'),
    createProduct('Starters', 'Chicken Quesadillas', '', 110, 'Quesadilla Spree'),
    createProduct('Starters', 'Pork Quesadillas', '', 115, 'Quesadilla Spree'),
    createProduct('Starters', 'Beef Quesadillas', '', 125, 'Quesadilla Spree'),
    createProduct('Starters', 'Tuna Melt Quesadillas', '', 135, 'Quesadilla Spree'),
    createProduct('Starters', 'Hawaiian Quesadillas', '', 145, 'Quesadilla Spree'),
    createProduct('Starters', "Chips N' Dip", '', 125, 'Dip It Good'),
    createProduct('Starters', 'Onion Rings', '', 145, 'Dip It Good'),
    createProduct('Starters', 'Lumpia Shanghai', '', 135, 'Dip It Good'),
    createProduct('Starters', 'Chicken Skin', '', 160, 'Dip It Good'),
    createProduct('Starters', 'Chicken Tenders w/ Fries', '', 145, 'Hunger Crushers'),
    createProduct('Starters', 'Ramen', '', 135, 'Hunger Crushers'),
    createProduct('Starters', 'Chicken Alfredo', '', 170, 'Hunger Crushers'),
    createProduct('Starters', 'Vcut Con Nacho Fries', '', 135, 'Snack-Bar Remix'),
    createProduct('Starters', 'Vcut Con Nachos', '', 105, 'Snack-Bar Remix'),
    createProduct('Starters', 'Chippy Con Carne', 'Small', 60, 'Snack-Bar Remix'),
    createProduct('Starters', 'Chippy Con Carne', 'Big', 90, 'Snack-Bar Remix'),

    createProduct('Bun Intended', 'Cheese Burger', '', 145),
    createProduct('Bun Intended', 'Chicken Burger', '', 135),
    createProduct('Bun Intended', 'Smoked Grilled Burger', '', 150),
    createProduct('That’s A Wrap', 'Shawarma Wrap', 'Beef', 85),
    createProduct('That’s A Wrap', 'Shawarma Wrap', 'Pork', 80),
    createProduct('That’s A Wrap', 'Shawarma Wrap', 'Chicken', 75),
    createProduct('Add Ons', 'Steam Rice', '', 25),
    createProduct('Add Ons', 'Java Rice', '', 30),
    createProduct('Add Ons', 'Garlic Rice', '', 30),
    createProduct('Add Ons', 'Take-out Box', '', 10),
    createProduct('Add Ons', 'Egg', '', 25),
    createProduct('Add Ons', 'Sauce', '', 25),
    createProduct('Add Ons', 'Cheese', '', 25),

    createProduct('Rice Meals', 'Burger Steak', '', 165, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Chicken Tenders', '', 155, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Hungarian', '', 145, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Fish Fillet', '', 155, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Liempo', '', 165, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Sisig', '', 145, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Backribs', '', 200, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Chicken Katsu Curry', '', 195, 'Kanin-Get Enough'),
    createProduct('Rice Meals', 'Chicken Tonkatsu', '', 195),
    createProduct('Rice Meals', 'Lasagna', 'Pork', 180),
    createProduct('Rice Meals', 'Lasagna', 'Beef', 200),
    createProduct('Rice Meals', 'Shawarma Rice', 'Chicken', 110, 'The Flavor Trip'),
    createProduct('Rice Meals', 'Shawarma Rice', 'Pork', 115, 'The Flavor Trip'),
    createProduct('Rice Meals', 'Shawarma Rice', 'Beef', 125, 'The Flavor Trip'),
    createProduct('Rice Meals', 'Burrito', 'Chicken', 125, 'The Flavor Trip'),
    createProduct('Rice Meals', 'Burrito', 'Pork', 135, 'The Flavor Trip'),
    createProduct('Rice Meals', 'Burrito', 'Beef', 145, 'The Flavor Trip')
];

const productByKey = new Map(PRODUCTS.map(product => [product.key, product]));

let currentUser = null;
let currentBranch = null;
let currentReportDate = getPHWeekStartKey();
let counts = new Map();
let currentCategory = 'all';
let currentSearch = '';
let saveTimers = new Map();
let pendingSaveCount = 0;
let weekChangeInProgress = false;

let expenseTemplates = [];
let expenseAmounts = new Map();
let expenseFeatureLoaded = false;
let expenseDirty = false;
let expenseBusy = false;

const elements = {};

document.addEventListener('DOMContentLoaded', () => {
    bindElements();
    bindEvents();
    initDashboard();
});

function bindElements() {
    elements.pageLoader = document.getElementById('pageLoader');
    elements.logoutBtn = document.getElementById('logoutBtn');
    elements.navBranchText = document.getElementById('navBranchText');
    elements.todayText = document.getElementById('todayText');
    elements.leaderText = document.getElementById('leaderText');
    elements.branchText = document.getElementById('branchText');
    elements.totalOrdersText = document.getElementById('totalOrdersText');
    elements.activeItemsText = document.getElementById('activeItemsText');
    elements.phTimeText = document.getElementById('phTimeText');
    elements.searchInput = document.getElementById('searchInput');
    elements.categorySelect = document.getElementById('categorySelect');
    elements.categoryChips = document.getElementById('categoryChips');
    elements.saveStatusText = document.getElementById('saveStatusText');
    elements.refreshBtn = document.getElementById('refreshBtn');
    elements.productGrid = document.getElementById('productGrid');
    elements.topItemsList = document.getElementById('topItemsList');
    elements.clearDayBtn = document.getElementById('clearDayBtn');
    elements.toast = document.getElementById('toast');
    ensureCupUsagePanel();
    ensureExpensesFeature();
}

function bindEvents() {
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', refreshData);
    elements.clearDayBtn.addEventListener('click', clearWeekOrders);

    elements.searchInput.addEventListener('input', event => {
        currentSearch = event.target.value.trim().toLowerCase();
        renderProducts();
    });

    elements.categorySelect.addEventListener('change', event => {
        setCategory(event.target.value);
    });

    elements.categoryChips.addEventListener('click', event => {
        const button = event.target.closest('[data-category]');
        if (!button) return;
        setCategory(button.dataset.category);
    });

    elements.productGrid.addEventListener('input', async event => {
        const input = event.target.closest('.quantity-input[data-key]');
        if (!input) return;

        const cleanedValue = sanitizeNumberInput(input.value);
        if (input.value !== cleanedValue) input.value = cleanedValue;

        await handleWeekChangeIfNeeded(true);

        const product = productByKey.get(input.dataset.key);
        if (!product) return;

        const quantity = Number(cleanedValue || 0);
        const targetReportDate = currentReportDate;

        updateLocalCount(product, quantity, false);
        scheduleSave(product, quantity, targetReportDate);
    });

    elements.productGrid.addEventListener('blur', event => {
        const input = event.target.closest('.quantity-input[data-key]');
        if (!input) return;
        input.value = String(Math.max(0, Number(input.value) || 0));
    }, true);

    setInterval(() => {
        updateClockTexts();
        handleWeekChangeIfNeeded(false).catch(error => {
            console.error('Automatic PH week check failed:', error);
        });
    }, 30000);
}

async function initDashboard() {
    try {
        await loadCurrentUser();
        await loadBranch();
        setupCategories();
        updateHeaderTexts();
        await loadCurrentWeekOrders();
        renderProducts();
        renderSummary();
    } catch (error) {
        console.error('TL dashboard failed:', error);
        alert(error.message || 'Session expired. Please login again.');
        clearLoginSession();
        window.location.replace('tl-login.html');
    } finally {
        elements.pageLoader.classList.add('hidden');
    }
}

async function loadCurrentUser() {
    const hasAuth = sessionStorage.getItem('adrianosTlAuth') === 'true';
    const userId = sessionStorage.getItem('adrianosTlUserId') || sessionStorage.getItem('adrianosLoggedUserId');

    if (!hasAuth || !userId) {
        throw new Error('Session expired. Please login again.');
    }

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    if (error || !data) {
        throw new Error('Team leader account not found.');
    }

    if (data.role !== 'team_leader') {
        throw new Error('Access denied. Team Leader account only.');
    }

    currentUser = data;
}

async function loadBranch() {
    currentBranch = null;

    if (!currentUser.branch_id) return;

    const { data, error } = await supabase
        .from('branches')
        .select('*')
        .eq('id', currentUser.branch_id)
        .single();

    if (!error && data) currentBranch = data;
}

function setupCategories() {
    const categories = ['all', ...new Set(PRODUCTS.map(product => product.category))];

    elements.categorySelect.innerHTML = categories.map(category => {
        const label = category === 'all' ? 'All Categories' : category;
        return `<option value="${escapeHTML(category)}">${escapeHTML(label)}</option>`;
    }).join('');

    elements.categoryChips.innerHTML = categories.map(category => {
        const label = category === 'all' ? 'All' : category;
        const activeClass = category === currentCategory ? 'active' : '';
        return `<button type="button" class="category-chip ${activeClass}" data-category="${escapeHTML(category)}">${escapeHTML(label)}</button>`;
    }).join('');
}

function setCategory(category) {
    currentCategory = category || 'all';
    elements.categorySelect.value = currentCategory;

    document.querySelectorAll('.category-chip').forEach(button => {
        button.classList.toggle('active', button.dataset.category === currentCategory);
    });

    renderProducts();
}

async function loadCurrentWeekOrders() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('report_date', currentReportDate)
        .eq('branch_key', getBranchKey());

    if (error) {
        throw new Error('Could not load this week\'s orders. Please check the Supabase table.');
    }

    counts = new Map();

    (data || []).forEach(row => {
        counts.set(row.product_key, Number(row.quantity) || 0);
    });
}

async function handleWeekChangeIfNeeded(silent = false) {
    const latestReportDate = getPHWeekStartKey();

    if (latestReportDate === currentReportDate) return false;
    if (weekChangeInProgress) return true;

    weekChangeInProgress = true;

    try {
        currentReportDate = latestReportDate;
        updateHeaderTexts();
        await loadCurrentWeekOrders();
        renderProducts();
        renderSummary();

        if (expenseFeatureLoaded) {
            await loadExpenseData();
        }

        if (!silent) {
            showToast('New PH week started. Counts are now for the new week.', 'success');
        }

        return true;
    } catch (error) {
        console.error('Automatic week change failed:', error);
        showToast('New PH week detected, but refresh failed. Please tap Refresh.', 'error');
        return false;
    } finally {
        weekChangeInProgress = false;
    }
}

async function refreshData() {
    elements.refreshBtn.disabled = true;
    elements.refreshBtn.textContent = 'Refreshing...';

    try {
        currentReportDate = getPHWeekStartKey();
        updateHeaderTexts();
        await loadCurrentWeekOrders();
        renderProducts();
        renderSummary();

        if (expenseFeatureLoaded) {
            await loadExpenseData();
        }

        showToast('Weekly product tracker refreshed.', 'success');
    } catch (error) {
        console.error('Refresh failed:', error);
        showToast(error.message || 'Failed to refresh data.', 'error');
    } finally {
        elements.refreshBtn.disabled = false;
        elements.refreshBtn.textContent = 'Refresh';
    }
}

function renderProducts() {
    const filteredProducts = PRODUCTS.filter(product => {
        const categoryMatch = currentCategory === 'all' || product.category === currentCategory;
        const searchMatch = !currentSearch || `${product.category} ${product.name} ${product.variant}`.toLowerCase().includes(currentSearch);
        return categoryMatch && searchMatch;
    });

    if (!filteredProducts.length) {
        elements.productGrid.innerHTML = '<div class="empty-state">No product found.</div>';
        return;
    }

    elements.productGrid.innerHTML = filteredProducts.map(product => {
        const count = getCount(product.key);
        const hasCountClass = count > 0 ? 'has-count' : '';
        const detailText = [product.variant || 'Regular', formatPeso(product.price)].filter(Boolean).join(' • ');

        return `
            <article class="product-card ${hasCountClass}" data-card-key="${escapeHTML(product.key)}">
                <div class="product-meta">
                    <span class="product-category">${escapeHTML(product.category)}</span>
                    <strong class="product-name">${escapeHTML(product.name)}</strong>
                    <span class="product-details">${escapeHTML(detailText)}</span>
                </div>

                <label class="quantity-field">
                    <span>Orders this week</span>
                    <input type="number" class="quantity-input" data-key="${escapeHTML(product.key)}" min="0" step="1" inputmode="numeric" pattern="[0-9]*" value="${count}" aria-label="${escapeHTML(product.name)} weekly order quantity">
                </label>
            </article>
        `;
    }).join('');
}

function renderSummary() {
    const totalOrders = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    const activeItems = Array.from(counts.values()).filter(value => value > 0).length;

    elements.totalOrdersText.textContent = String(totalOrders);
    elements.activeItemsText.textContent = String(activeItems);
    renderCupUsage(getCupUsageFromCurrentCounts());

    const orderedItems = PRODUCTS
        .map(product => ({ product, quantity: getCount(product.key) }))
        .filter(item => item.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity || a.product.name.localeCompare(b.product.name))
        .slice(0, 10);

    if (!orderedItems.length) {
        elements.topItemsList.innerHTML = '<div class="empty-state">No orders recorded yet for this week.</div>';
        return;
    }

    elements.topItemsList.innerHTML = orderedItems.map(({ product, quantity }) => {
        const detailText = [product.category, product.variant || 'Regular', formatPeso(product.price)].filter(Boolean).join(' • ');

        return `
            <div class="top-item">
                <div>
                    <strong>${escapeHTML(product.name)}</strong><br>
                    <span>${escapeHTML(detailText)}</span>
                </div>
                <div class="top-count">${quantity}</div>
            </div>
        `;
    }).join('');
}

function ensureCupUsagePanel() {
    if (!elements.topItemsList || document.getElementById('automaticCupUsagePanel')) return;

    const panel = document.createElement('section');
    panel.id = 'automaticCupUsagePanel';
    panel.setAttribute('aria-label', 'Automatic cup usage inventory');
    panel.style.marginBottom = '16px';
    panel.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:8px;">
            <div>
                <strong>Automatic Cup Usage</strong><br>
                <span style="font-size:0.82rem;opacity:0.75;">Calculated from recorded 16oz and 22oz drinks.</span>
            </div>
            <strong id="totalCupsUsedText">0 cups</strong>
        </div>
        <div class="top-item">
            <div><strong>16oz Cups Used</strong><br><span>1 cup per recorded 16oz drink</span></div>
            <div class="top-count" id="cups16ozUsedText">0</div>
        </div>
        <div class="top-item">
            <div><strong>22oz Cups Used</strong><br><span>1 cup per recorded 22oz drink</span></div>
            <div class="top-count" id="cups22ozUsedText">0</div>
        </div>
    `;

    elements.topItemsList.parentElement?.insertBefore(panel, elements.topItemsList);
    elements.cups16ozUsedText = panel.querySelector('#cups16ozUsedText');
    elements.cups22ozUsedText = panel.querySelector('#cups22ozUsedText');
    elements.totalCupsUsedText = panel.querySelector('#totalCupsUsedText');
}

function normalizeCupSize(value) {
    const clean = String(value || '').toLowerCase().replace(/\s+/g, '');
    if (clean === '16oz' || clean === '16ounce' || clean === '16ounces') return '16oz';
    if (clean === '22oz' || clean === '22ounce' || clean === '22ounces') return '22oz';
    return '';
}

function getCupUsageFromCurrentCounts() {
    return PRODUCTS.reduce((usage, product) => {
        const cupSize = normalizeCupSize(product.variant);
        if (!cupSize) return usage;

        const quantity = getCount(product.key);
        if (cupSize === '16oz') usage.cups16oz += quantity;
        if (cupSize === '22oz') usage.cups22oz += quantity;
        usage.totalCups += quantity;
        return usage;
    }, { cups16oz: 0, cups22oz: 0, totalCups: 0 });
}

function renderCupUsage(usage) {
    ensureCupUsagePanel();
    if (elements.cups16ozUsedText) elements.cups16ozUsedText.textContent = String(usage.cups16oz || 0);
    if (elements.cups22ozUsedText) elements.cups22ozUsedText.textContent = String(usage.cups22oz || 0);
    if (elements.totalCupsUsedText) elements.totalCupsUsedText.textContent = `${usage.totalCups || 0} cup${usage.totalCups === 1 ? '' : 's'}`;
}


function ensureExpensesFeature() {
    if (document.getElementById('weeklyExpensesBtn')) return;

    ensureExpensesStyles();

    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'weeklyExpensesBtn';
    button.className = 'btn outline-btn weekly-expenses-open-btn';
    button.textContent = 'Weekly Expenses';

    const actionParent = elements.refreshBtn?.parentElement || elements.clearDayBtn?.parentElement;
    if (actionParent) {
        if (elements.clearDayBtn && elements.clearDayBtn.parentElement === actionParent) {
            actionParent.insertBefore(button, elements.clearDayBtn);
        } else {
            actionParent.appendChild(button);
        }
    } else if (elements.productGrid?.parentElement) {
        elements.productGrid.parentElement.insertBefore(button, elements.productGrid);
    } else {
        document.body.appendChild(button);
    }

    const modal = document.createElement('div');
    modal.id = 'weeklyExpensesModal';
    modal.className = 'weekly-expenses-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
        <section class="weekly-expenses-dialog" role="dialog" aria-modal="true" aria-labelledby="weeklyExpensesTitle">
            <header class="weekly-expenses-header">
                <div>
                    <h2 id="weeklyExpensesTitle">Weekly Expenses</h2>
                    <p id="weeklyExpensesWeekText">Current week</p>
                </div>
                <button type="button" class="weekly-expenses-close" id="closeWeeklyExpensesBtn" aria-label="Close expenses">&times;</button>
            </header>

            <div class="weekly-expenses-content">
                <div class="weekly-expenses-summary">
                    <div>
                        <span>Branch</span>
                        <strong id="weeklyExpensesBranchText">Unassigned Branch</strong>
                    </div>
                    <div>
                        <span>Weekly Total</span>
                        <strong id="weeklyExpensesTotalText">₱0.00</strong>
                    </div>
                </div>

                <form id="addExpenseNameForm" class="weekly-expenses-add-form">
                    <label for="newExpenseNameInput">Add an expense name</label>
                    <div>
                        <input id="newExpenseNameInput" type="text" maxlength="120" autocomplete="off" placeholder="Example: LPG, transportation, supplies" required>
                        <button type="submit" class="btn primary-btn">Add Expense</button>
                    </div>
                </form>

                <div id="weeklyExpensesStatus" class="weekly-expenses-status" aria-live="polite">
                    Expense names remain available every week. Enter an amount only when used.
                </div>

                <div id="weeklyExpensesList" class="weekly-expenses-list">
                    <div class="empty-state">Open the expenses panel to load saved expense names.</div>
                </div>
            </div>

            <footer class="weekly-expenses-footer">
                <button type="button" class="btn outline-btn" id="exportWeeklyExpensesPdfBtn">Export Expenses PDF</button>
                <button type="button" class="btn primary-btn" id="submitWeeklyExpensesBtn">Submit Weekly Expenses</button>
            </footer>
        </section>
    `;

    document.body.appendChild(modal);

    elements.weeklyExpensesBtn = button;
    elements.weeklyExpensesModal = modal;
    elements.closeWeeklyExpensesBtn = modal.querySelector('#closeWeeklyExpensesBtn');
    elements.weeklyExpensesWeekText = modal.querySelector('#weeklyExpensesWeekText');
    elements.weeklyExpensesBranchText = modal.querySelector('#weeklyExpensesBranchText');
    elements.weeklyExpensesTotalText = modal.querySelector('#weeklyExpensesTotalText');
    elements.addExpenseNameForm = modal.querySelector('#addExpenseNameForm');
    elements.newExpenseNameInput = modal.querySelector('#newExpenseNameInput');
    elements.weeklyExpensesStatus = modal.querySelector('#weeklyExpensesStatus');
    elements.weeklyExpensesList = modal.querySelector('#weeklyExpensesList');
    elements.exportWeeklyExpensesPdfBtn = modal.querySelector('#exportWeeklyExpensesPdfBtn');
    elements.submitWeeklyExpensesBtn = modal.querySelector('#submitWeeklyExpensesBtn');

    button.addEventListener('click', openWeeklyExpenses);
    elements.closeWeeklyExpensesBtn.addEventListener('click', closeWeeklyExpenses);
    modal.addEventListener('click', event => {
        if (event.target === modal) closeWeeklyExpenses();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('open')) {
            closeWeeklyExpenses();
        }
    });

    elements.addExpenseNameForm.addEventListener('submit', addExpenseName);
    elements.weeklyExpensesList.addEventListener('input', handleExpenseAmountInput);
    elements.weeklyExpensesList.addEventListener('click', event => {
        const removeButton = event.target.closest('[data-remove-expense-id]');
        if (!removeButton) return;
        removeExpenseName(removeButton.dataset.removeExpenseId);
    });

    elements.submitWeeklyExpensesBtn.addEventListener('click', submitWeeklyExpenses);
    elements.exportWeeklyExpensesPdfBtn.addEventListener('click', exportWeeklyExpensesPdf);
}

function ensureExpensesStyles() {
    if (document.getElementById('weeklyExpensesStyles')) return;

    const style = document.createElement('style');
    style.id = 'weeklyExpensesStyles';
    style.textContent = `
        .weekly-expenses-open-btn { margin-inline: 4px; }
        .weekly-expenses-modal {
            position: fixed;
            inset: 0;
            z-index: 10000;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 18px;
            background: rgba(25, 18, 13, 0.58);
            backdrop-filter: blur(3px);
        }
        .weekly-expenses-modal.open { display: flex; }
        .weekly-expenses-dialog {
            width: min(760px, 100%);
            max-height: min(88vh, 850px);
            display: flex;
            flex-direction: column;
            overflow: hidden;
            border-radius: 18px;
            background: #fffdf9;
            color: #2c1e16;
            box-shadow: 0 24px 70px rgba(0, 0, 0, 0.28);
        }
        .weekly-expenses-header,
        .weekly-expenses-footer {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 18px;
            border-color: rgba(68, 45, 31, 0.14);
        }
        .weekly-expenses-header { border-bottom: 1px solid rgba(68, 45, 31, 0.14); }
        .weekly-expenses-footer {
            justify-content: flex-end;
            flex-wrap: wrap;
            border-top: 1px solid rgba(68, 45, 31, 0.14);
        }
        .weekly-expenses-header h2 { margin: 0; font-size: 1.25rem; }
        .weekly-expenses-header p { margin: 4px 0 0; opacity: 0.72; font-size: 0.88rem; }
        .weekly-expenses-close {
            width: 38px;
            height: 38px;
            border: 0;
            border-radius: 50%;
            background: rgba(68, 45, 31, 0.08);
            color: inherit;
            font-size: 1.6rem;
            cursor: pointer;
        }
        .weekly-expenses-content { overflow-y: auto; padding: 18px; }
        .weekly-expenses-summary {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
            margin-bottom: 16px;
        }
        .weekly-expenses-summary > div {
            padding: 13px;
            border: 1px solid rgba(68, 45, 31, 0.14);
            border-radius: 12px;
            background: rgba(139, 94, 52, 0.05);
        }
        .weekly-expenses-summary span,
        .weekly-expense-name span {
            display: block;
            margin-bottom: 4px;
            font-size: 0.78rem;
            opacity: 0.68;
        }
        .weekly-expenses-summary strong { font-size: 1.05rem; }
        .weekly-expenses-add-form {
            padding: 14px;
            margin-bottom: 14px;
            border: 1px solid rgba(68, 45, 31, 0.14);
            border-radius: 12px;
        }
        .weekly-expenses-add-form label {
            display: block;
            margin-bottom: 7px;
            font-weight: 700;
        }
        .weekly-expenses-add-form > div {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
        }
        .weekly-expenses-add-form input,
        .weekly-expense-amount {
            width: 100%;
            min-height: 42px;
            box-sizing: border-box;
            border: 1px solid rgba(68, 45, 31, 0.24);
            border-radius: 9px;
            padding: 9px 11px;
            background: #fff;
            color: inherit;
            font: inherit;
        }
        .weekly-expenses-status {
            min-height: 20px;
            margin-bottom: 10px;
            font-size: 0.84rem;
            opacity: 0.75;
        }
        .weekly-expenses-status.error { color: #a12626; opacity: 1; }
        .weekly-expenses-status.success { color: #25723a; opacity: 1; }
        .weekly-expenses-list { display: grid; gap: 9px; }
        .weekly-expense-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) 160px auto;
            gap: 10px;
            align-items: center;
            padding: 11px 12px;
            border: 1px solid rgba(68, 45, 31, 0.13);
            border-radius: 11px;
            background: #fff;
        }
        .weekly-expense-name strong { overflow-wrap: anywhere; }
        .weekly-expense-amount-wrap {
            position: relative;
            display: flex;
            align-items: center;
        }
        .weekly-expense-amount-wrap::before {
            content: "₱";
            position: absolute;
            left: 11px;
            font-weight: 700;
            opacity: 0.72;
            pointer-events: none;
        }
        .weekly-expense-amount { padding-left: 29px; text-align: right; }
        .weekly-expense-remove {
            border: 1px solid rgba(161, 38, 38, 0.3);
            border-radius: 8px;
            padding: 8px 10px;
            background: transparent;
            color: #a12626;
            cursor: pointer;
        }
        .weekly-expenses-loading { padding: 20px; text-align: center; opacity: 0.7; }
        @media (max-width: 620px) {
            .weekly-expenses-modal { padding: 0; align-items: flex-end; }
            .weekly-expenses-dialog {
                width: 100%;
                max-height: 94vh;
                border-radius: 18px 18px 0 0;
            }
            .weekly-expenses-summary { grid-template-columns: 1fr; }
            .weekly-expenses-add-form > div { grid-template-columns: 1fr; }
            .weekly-expense-row { grid-template-columns: minmax(0, 1fr) 120px; }
            .weekly-expense-remove { grid-column: 1 / -1; }
            .weekly-expenses-footer > .btn { flex: 1 1 180px; }
        }
    `;
    document.head.appendChild(style);
}

async function openWeeklyExpenses() {
    if (!currentUser) {
        showToast('Please wait for the dashboard to finish loading.', 'error');
        return;
    }

    await handleWeekChangeIfNeeded(true);

    elements.weeklyExpensesModal.classList.add('open');
    elements.weeklyExpensesModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    updateExpenseHeader();
    await loadExpenseData();
    setTimeout(() => elements.newExpenseNameInput?.focus(), 0);
}

function closeWeeklyExpenses() {
    elements.weeklyExpensesModal?.classList.remove('open');
    elements.weeklyExpensesModal?.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

function updateExpenseHeader() {
    if (elements.weeklyExpensesWeekText) {
        elements.weeklyExpensesWeekText.textContent = `Week: ${formatWeekRange(currentReportDate)}`;
    }
    if (elements.weeklyExpensesBranchText) {
        elements.weeklyExpensesBranchText.textContent = getBranchName();
    }
}

async function loadExpenseData() {
    if (!currentUser || expenseBusy) return;

    expenseBusy = true;
    updateExpenseHeader();
    setExpenseStatus('Loading saved expense names and this week’s values...');
    if (elements.weeklyExpensesList) {
        elements.weeklyExpensesList.innerHTML = '<div class="weekly-expenses-loading">Loading weekly expenses...</div>';
    }

    try {
        const branchKey = getBranchKey();

        const { data: names, error: namesError } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .select('*')
            .eq('branch_key', branchKey)
            .eq('is_active', true)
            .order('expense_name', { ascending: true });

        if (namesError) throw namesError;

        const { data: weeklyRows, error: weeklyError } = await supabase
            .from(WEEKLY_EXPENSES_TABLE)
            .select('*')
            .eq('report_date', currentReportDate)
            .eq('branch_key', branchKey);

        if (weeklyError) throw weeklyError;

        expenseTemplates = names || [];
        expenseAmounts = new Map(
            (weeklyRows || []).map(row => [String(row.expense_id), normalizeExpenseAmount(row.amount)])
        );
        expenseFeatureLoaded = true;
        expenseDirty = false;

        renderExpenseRows();
        setExpenseStatus('Expense names remain available every week. Blank or zero amounts are not included in the PDF.');
    } catch (error) {
        console.error('Expense data load failed:', error);
        expenseFeatureLoaded = false;
        expenseTemplates = [];
        expenseAmounts = new Map();
        renderExpenseRows();

        if (isMissingExpenseTableError(error)) {
            setExpenseStatus('Expenses tables are not installed yet. Run the included Supabase SQL file, then refresh this page.', 'error');
        } else {
            setExpenseStatus(error.message || 'Failed to load weekly expenses.', 'error');
        }
    } finally {
        expenseBusy = false;
        updateExpenseButtons();
    }
}

function renderExpenseRows() {
    if (!elements.weeklyExpensesList) return;

    if (!expenseTemplates.length) {
        elements.weeklyExpensesList.innerHTML = `
            <div class="empty-state">
                No expense names yet. Add your first expense above, such as LPG, transportation, supplies, rent, or repairs.
            </div>
        `;
        renderExpenseTotal();
        return;
    }

    elements.weeklyExpensesList.innerHTML = expenseTemplates.map(expense => {
        const amount = normalizeExpenseAmount(expenseAmounts.get(String(expense.id)));
        const displayAmount = amount > 0 ? amount.toFixed(2) : '';

        return `
            <div class="weekly-expense-row" data-expense-row-id="${escapeHTML(expense.id)}">
                <div class="weekly-expense-name">
                    <span>Expense</span>
                    <strong>${escapeHTML(expense.expense_name)}</strong>
                </div>
                <label class="weekly-expense-amount-wrap">
                    <input
                        type="number"
                        class="weekly-expense-amount"
                        data-expense-id="${escapeHTML(expense.id)}"
                        min="0"
                        max="99999999.99"
                        step="0.01"
                        inputmode="decimal"
                        value="${escapeHTML(displayAmount)}"
                        placeholder="0.00"
                        aria-label="${escapeHTML(expense.expense_name)} amount"
                    >
                </label>
                <button type="button" class="weekly-expense-remove" data-remove-expense-id="${escapeHTML(expense.id)}">Remove</button>
            </div>
        `;
    }).join('');

    renderExpenseTotal();
}

function handleExpenseAmountInput(event) {
    const input = event.target.closest('.weekly-expense-amount[data-expense-id]');
    if (!input) return;

    const amount = normalizeExpenseAmount(input.value);
    expenseAmounts.set(String(input.dataset.expenseId), amount);
    expenseDirty = true;

    renderExpenseTotal();
    updateExpenseButtons();
    setExpenseStatus('Unsaved changes. Click Submit Weekly Expenses to save this week’s values.');
}

function renderExpenseTotal() {
    const total = expenseTemplates.reduce((sum, expense) => {
        return sum + normalizeExpenseAmount(expenseAmounts.get(String(expense.id)));
    }, 0);

    if (elements.weeklyExpensesTotalText) {
        elements.weeklyExpensesTotalText.textContent = formatExpenseAmount(total);
    }
}

async function addExpenseName(event) {
    event.preventDefault();

    if (expenseBusy) return;

    const expenseName = String(elements.newExpenseNameInput?.value || '').trim().replace(/\s+/g, ' ');
    if (!expenseName) {
        setExpenseStatus('Enter an expense name first.', 'error');
        return;
    }

    if (expenseName.length > 120) {
        setExpenseStatus('Expense names must be 120 characters or fewer.', 'error');
        return;
    }

    const expenseKey = makeExpenseKey(expenseName);
    const branchKey = getBranchKey();

    expenseBusy = true;
    updateExpenseButtons();
    setExpenseStatus('Saving expense name...');

    try {
        const { data: existing, error: findError } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .select('*')
            .eq('branch_key', branchKey)
            .eq('expense_key', expenseKey)
            .maybeSingle();

        if (findError) throw findError;

        let savedExpense;

        if (existing) {
            if (existing.is_active) {
                setExpenseStatus('That expense name is already in the list.', 'error');
                return;
            }

            const { data, error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .update({
                    expense_name: expenseName,
                    is_active: true,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select('*')
                .single();

            if (error) throw error;
            savedExpense = data;
        } else {
            const payload = {
                branch_key: branchKey,
                branch_id: currentUser.branch_id || null,
                expense_name: expenseName,
                expense_key: expenseKey,
                created_by: currentUser.id,
                created_by_name: currentUser.full_name || currentUser.username || 'Team Leader',
                is_active: true,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await supabase
                .from(EXPENSE_NAMES_TABLE)
                .insert(payload)
                .select('*')
                .single();

            if (error) throw error;
            savedExpense = data;
        }

        expenseTemplates.push(savedExpense);
        expenseTemplates.sort((a, b) => String(a.expense_name).localeCompare(String(b.expense_name)));
        expenseAmounts.set(String(savedExpense.id), 0);
        expenseFeatureLoaded = true;
        elements.newExpenseNameInput.value = '';

        renderExpenseRows();
        setExpenseStatus(`"${savedExpense.expense_name}" was added and will remain available next week.`, 'success');
    } catch (error) {
        console.error('Add expense name failed:', error);
        if (isMissingExpenseTableError(error)) {
            setExpenseStatus('Expenses tables are not installed yet. Run the included Supabase SQL file.', 'error');
        } else {
            setExpenseStatus(error.message || 'Failed to add the expense name.', 'error');
        }
    } finally {
        expenseBusy = false;
        updateExpenseButtons();
    }
}

async function removeExpenseName(expenseId) {
    const expense = expenseTemplates.find(item => String(item.id) === String(expenseId));
    if (!expense || expenseBusy) return;

    const confirmed = confirm(
        `Remove "${expense.expense_name}" from the expense list?\n\n` +
        'It will not appear next week. Older submitted expense history will be preserved.'
    );
    if (!confirmed) return;

    expenseBusy = true;
    updateExpenseButtons();
    setExpenseStatus(`Removing "${expense.expense_name}"...`);

    try {
        const { error: nameError } = await supabase
            .from(EXPENSE_NAMES_TABLE)
            .update({
                is_active: false,
                updated_at: new Date().toISOString()
            })
            .eq('id', expense.id)
            .eq('branch_key', getBranchKey());

        if (nameError) throw nameError;

        const { error: currentWeekError } = await supabase
            .from(WEEKLY_EXPENSES_TABLE)
            .delete()
            .eq('report_date', currentReportDate)
            .eq('branch_key', getBranchKey())
            .eq('expense_id', expense.id);

        if (currentWeekError) throw currentWeekError;

        expenseTemplates = expenseTemplates.filter(item => String(item.id) !== String(expense.id));
        expenseAmounts.delete(String(expense.id));

        renderExpenseRows();
        setExpenseStatus(`"${expense.expense_name}" was removed. Older weekly records remain preserved.`, 'success');
    } catch (error) {
        console.error('Remove expense name failed:', error);
        setExpenseStatus(error.message || 'Failed to remove the expense name.', 'error');
    } finally {
        expenseBusy = false;
        updateExpenseButtons();
    }
}

async function submitWeeklyExpenses() {
    if (expenseBusy || !currentUser) return;

    await handleWeekChangeIfNeeded(true);

    expenseBusy = true;
    updateExpenseButtons();
    setExpenseStatus('Submitting this week’s expenses...');

    try {
        const positiveExpenses = expenseTemplates
            .map(expense => ({
                expense,
                amount: normalizeExpenseAmount(expenseAmounts.get(String(expense.id)))
            }))
            .filter(item => item.amount > 0);

        const positiveExpenseIds = new Set(positiveExpenses.map(item => String(item.expense.id)));

        const { data: existingRows, error: existingError } = await supabase
            .from(WEEKLY_EXPENSES_TABLE)
            .select('id, expense_id')
            .eq('report_date', currentReportDate)
            .eq('branch_key', getBranchKey());

        if (existingError) throw existingError;

        const rowsToDelete = (existingRows || [])
            .filter(row => !positiveExpenseIds.has(String(row.expense_id)))
            .map(row => row.id);

        if (rowsToDelete.length) {
            const { error: deleteError } = await supabase
                .from(WEEKLY_EXPENSES_TABLE)
                .delete()
                .in('id', rowsToDelete);

            if (deleteError) throw deleteError;
        }

        if (positiveExpenses.length) {
            const now = new Date().toISOString();
            const payloads = positiveExpenses.map(({ expense, amount }) => ({
                report_date: currentReportDate,
                branch_key: getBranchKey(),
                branch_id: currentUser.branch_id || null,
                branch_name: getBranchName(),
                expense_id: expense.id,
                expense_name: expense.expense_name,
                amount,
                team_leader_id: currentUser.id,
                team_leader_name: currentUser.full_name || currentUser.username || 'Team Leader',
                updated_at: now
            }));

            const { error: upsertError } = await supabase
                .from(WEEKLY_EXPENSES_TABLE)
                .upsert(payloads, { onConflict: 'report_date,branch_key,expense_id' });

            if (upsertError) throw upsertError;
        }

        expenseDirty = false;
        renderExpenseTotal();
        updateExpenseButtons();
        setExpenseStatus(
            positiveExpenses.length
                ? `${positiveExpenses.length} expense${positiveExpenses.length === 1 ? '' : 's'} submitted. Weekly total: ${formatExpenseAmount(getCurrentExpenseTotal())}.`
                : 'No positive expense values were entered. This week’s expense report is empty.',
            'success'
        );
        showToast('Weekly expenses saved.', 'success');
    } catch (error) {
        console.error('Weekly expense submit failed:', error);
        if (isMissingExpenseTableError(error)) {
            setExpenseStatus('Expenses tables are not installed yet. Run the included Supabase SQL file.', 'error');
        } else {
            setExpenseStatus(error.message || 'Failed to submit weekly expenses.', 'error');
        }
    } finally {
        expenseBusy = false;
        updateExpenseButtons();
    }
}

async function exportWeeklyExpensesPdf() {
    if (expenseBusy) return;

    if (expenseDirty) {
        setExpenseStatus('Submit the weekly expenses before exporting the PDF.', 'error');
        return;
    }

    const rows = expenseTemplates
        .map(expense => ({
            name: expense.expense_name,
            amount: normalizeExpenseAmount(expenseAmounts.get(String(expense.id)))
        }))
        .filter(item => item.amount > 0)
        .sort((a, b) => a.name.localeCompare(b.name));

    if (!rows.length) {
        setExpenseStatus('There are no submitted expenses with a value greater than zero to export.', 'error');
        return;
    }

    expenseBusy = true;
    updateExpenseButtons();
    setExpenseStatus('Preparing the weekly expenses PDF...');

    try {
        const pdfReady = await ensureExpensePdfLibraryReady();
        if (!pdfReady) throw new Error('The PDF library could not be loaded.');

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const total = rows.reduce((sum, row) => sum + row.amount, 0);
        const leaderName = currentUser.full_name || currentUser.username || 'Team Leader';

        doc.setFillColor(253, 251, 247);
        doc.rect(0, 0, pageWidth, 31, 'F');
        doc.setTextColor(44, 30, 22);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text('WEEKLY EXPENSES REPORT', pageWidth / 2, 13, { align: 'center' });
        doc.setTextColor(139, 94, 52);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`${formatWeekRange(currentReportDate)} | ${getBranchName()}`, pageWidth / 2, 20, { align: 'center' });
        doc.setDrawColor(44, 30, 22);
        doc.setLineWidth(0.45);
        doc.line(14, 26, pageWidth - 14, 26);

        doc.autoTable({
            body: [
                ['Week', formatWeekRange(currentReportDate)],
                ['Branch', getBranchName()],
                ['Submitted By', leaderName],
                ['Generated', formatPHDateTimeForExpenses(new Date())],
                ['Included Expenses', String(rows.length)],
                ['Weekly Total', formatExpenseAmountForPdf(total)]
            ],
            startY: 36,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3,
                lineColor: [224, 220, 211],
                lineWidth: 0.15,
                textColor: [60, 60, 60]
            },
            columnStyles: {
                0: { cellWidth: 43, fontStyle: 'bold', fillColor: [253, 251, 247] }
            },
            margin: { left: 14, right: 14 }
        });

        doc.autoTable({
            head: [['#', 'Expense Name', 'Amount']],
            body: rows.map((row, index) => [
                String(index + 1),
                row.name,
                formatExpenseAmountForPdf(row.amount)
            ]),
            foot: [['', 'TOTAL', formatExpenseAmountForPdf(total)]],
            startY: doc.lastAutoTable.finalY + 9,
            theme: 'grid',
            margin: { top: 34, right: 14, bottom: 18, left: 14 },
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: 3,
                overflow: 'linebreak',
                lineColor: [224, 220, 211],
                lineWidth: 0.15,
                textColor: [60, 60, 60]
            },
            headStyles: {
                fillColor: [44, 30, 22],
                textColor: 255,
                fontStyle: 'bold'
            },
            footStyles: {
                fillColor: [253, 251, 247],
                textColor: [44, 30, 22],
                fontStyle: 'bold'
            },
            columnStyles: {
                0: { cellWidth: 15, halign: 'center' },
                1: { fontStyle: 'bold' },
                2: { cellWidth: 42, halign: 'right' }
            },
            didDrawPage: () => {
                const pageNumber = doc.internal.getCurrentPageInfo().pageNumber;
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(100);
                doc.text(
                    `Page ${pageNumber}`,
                    pageWidth - 14,
                    pageHeight - 8,
                    { align: 'right' }
                );
            }
        });

        doc.setFont('helvetica', 'italic');
        doc.setFontSize(7.5);
        doc.setTextColor(100);
        const noteY = Math.min(doc.lastAutoTable.finalY + 8, pageHeight - 14);
        doc.text(
            'Only submitted expense entries with an amount greater than PHP 0.00 are included.',
            14,
            noteY
        );

        const fileBranch = slugify(getBranchName()) || 'branch';
        doc.save(`Adrianos_Weekly_Expenses_${currentReportDate}_${fileBranch}.pdf`);

        setExpenseStatus('Weekly expenses PDF exported successfully.', 'success');
    } catch (error) {
        console.error('Expense PDF export failed:', error);
        setExpenseStatus(error.message || 'Failed to export the weekly expenses PDF.', 'error');
    } finally {
        expenseBusy = false;
        updateExpenseButtons();
    }
}

async function ensureExpensePdfLibraryReady() {
    if (window.jspdf?.jsPDF) {
        const testDoc = new window.jspdf.jsPDF();
        if (typeof testDoc.autoTable === 'function') return true;
    }

    await loadExternalScript(
        'weeklyExpensesJsPdfScript',
        'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js'
    );

    await loadExternalScript(
        'weeklyExpensesAutoTableScript',
        'https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.2/dist/jspdf.plugin.autotable.min.js'
    );

    if (!window.jspdf?.jsPDF) return false;
    const testDoc = new window.jspdf.jsPDF();
    return typeof testDoc.autoTable === 'function';
}

function loadExternalScript(id, src) {
    return new Promise((resolve, reject) => {
        const existing = document.getElementById(id);

        if (existing) {
            if (existing.dataset.loaded === 'true') {
                resolve();
                return;
            }

            existing.addEventListener('load', () => resolve(), { once: true });
            existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
            return;
        }

        const script = document.createElement('script');
        script.id = id;
        script.src = src;
        script.async = true;
        script.crossOrigin = 'anonymous';
        script.addEventListener('load', () => {
            script.dataset.loaded = 'true';
            resolve();
        }, { once: true });
        script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
        document.head.appendChild(script);
    });
}

function updateExpenseButtons() {
    if (elements.submitWeeklyExpensesBtn) {
        elements.submitWeeklyExpensesBtn.disabled = expenseBusy || !expenseTemplates.length;
        elements.submitWeeklyExpensesBtn.textContent = expenseBusy ? 'Working...' : 'Submit Weekly Expenses';
    }
    if (elements.exportWeeklyExpensesPdfBtn) {
        elements.exportWeeklyExpensesPdfBtn.disabled = expenseBusy;
    }
    if (elements.newExpenseNameInput) {
        elements.newExpenseNameInput.disabled = expenseBusy;
    }
    const addButton = elements.addExpenseNameForm?.querySelector('button[type="submit"]');
    if (addButton) addButton.disabled = expenseBusy;
}

function setExpenseStatus(message, type = '') {
    if (!elements.weeklyExpensesStatus) return;
    elements.weeklyExpensesStatus.textContent = message;
    elements.weeklyExpensesStatus.className = `weekly-expenses-status${type ? ` ${type}` : ''}`;
}

function getCurrentExpenseTotal() {
    return expenseTemplates.reduce((sum, expense) => {
        return sum + normalizeExpenseAmount(expenseAmounts.get(String(expense.id)));
    }, 0);
}

function normalizeExpenseAmount(value) {
    const amount = Number(String(value ?? '').replace(/,/g, ''));
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    return Math.round(Math.min(amount, 99999999.99) * 100) / 100;
}

function makeExpenseKey(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^a-z0-9 ]+/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 120);
}

function formatExpenseAmount(value) {
    return `₱${normalizeExpenseAmount(value).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatExpenseAmountForPdf(value) {
    return `PHP ${normalizeExpenseAmount(value).toLocaleString('en-PH', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

function formatPHDateTimeForExpenses(date) {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: PH_TIMEZONE,
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(date);
}

function isMissingExpenseTableError(error) {
    const code = String(error?.code || '');
    const message = String(error?.message || error?.details || '').toLowerCase();

    return code === '42P01' ||
        code === 'PGRST205' ||
        message.includes('expense_names') && message.includes('not') ||
        message.includes('weekly_expenses') && message.includes('not');
}


function updateLocalCount(product, quantity, syncInputValue = true) {
    const safeQuantity = Math.max(0, Number(quantity) || 0);
    counts.set(product.key, safeQuantity);

    const input = document.querySelector(`.quantity-input[data-key="${CSS.escape(product.key)}"]`);
    const card = document.querySelector(`[data-card-key="${CSS.escape(product.key)}"]`);

    if (input && syncInputValue) input.value = String(safeQuantity);
    if (card) card.classList.toggle('has-count', safeQuantity > 0);

    renderSummary();
}

function scheduleSave(product, quantity, reportDate = currentReportDate) {
    const safeQuantity = Math.max(0, Number(quantity) || 0);
    const timerKey = getSaveTimerKey(product.key, reportDate);

    if (saveTimers.has(timerKey)) {
        clearTimeout(saveTimers.get(timerKey));
    } else {
        pendingSaveCount += 1;
    }

    updateSaveStatus();

    const timerId = setTimeout(async () => {
        saveTimers.delete(timerKey);

        try {
            await persistQuantity(product, safeQuantity, reportDate);
        } catch (error) {
            console.error('Save failed:', error);
            showToast('Failed to save. Tap Refresh to check latest data.', 'error');
        } finally {
            pendingSaveCount = Math.max(0, pendingSaveCount - 1);
            updateSaveStatus();
        }
    }, 500);

    saveTimers.set(timerKey, timerId);
}

async function persistQuantity(product, quantity, reportDate = currentReportDate) {
    const safeQuantity = Math.max(0, Number(quantity) || 0);

    if (safeQuantity <= 0) {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('report_date', reportDate)
            .eq('branch_key', getBranchKey())
            .eq('product_key', product.key);

        if (error) throw error;
        return;
    }

    const payload = {
        report_date: reportDate,
        branch_key: getBranchKey(),
        branch_id: currentUser.branch_id || null,
        branch_name: getBranchName(),
        team_leader_id: currentUser.id,
        team_leader_name: currentUser.full_name || currentUser.username || 'Team Leader',
        product_key: product.key,
        product_name: product.name,
        product_variant: product.variant || null,
        category: product.category,
        price: product.price,
        quantity: safeQuantity,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from(TABLE_NAME)
        .upsert(payload, { onConflict: 'report_date,branch_key,product_key' });

    if (error) throw error;
}

async function clearWeekOrders() {
    await handleWeekChangeIfNeeded(true);

    const confirmClear = confirm('Clear all product counts for this week? This cannot be undone.');
    if (!confirmClear) return;

    elements.clearDayBtn.disabled = true;
    elements.clearDayBtn.textContent = 'Clearing...';

    try {
        const { error } = await supabase
            .from(TABLE_NAME)
            .delete()
            .eq('report_date', currentReportDate)
            .eq('branch_key', getBranchKey());

        if (error) throw error;

        counts = new Map();
        renderProducts();
        renderSummary();
        showToast('This week\'s counts cleared.', 'success');
    } catch (error) {
        console.error('Clear failed:', error);
        showToast('Failed to clear this week\'s counts.', 'error');
    } finally {
        elements.clearDayBtn.disabled = false;
        elements.clearDayBtn.textContent = 'Clear Week';
    }
}

function updateHeaderTexts() {
    const leaderName = currentUser.full_name || currentUser.username || 'Team Leader';
    const branchName = getBranchName();

    elements.navBranchText.textContent = branchName;
    elements.todayText.textContent = formatWeekRange(currentReportDate);
    elements.leaderText.textContent = `Team Leader: ${leaderName}`;
    elements.branchText.textContent = `Branch: ${branchName}`;

    updateClockTexts();
}

function updateClockTexts() {
    elements.phTimeText.textContent = getPHTimeText();
}

function updateSaveStatus() {
    elements.saveStatusText.textContent = pendingSaveCount > 0
        ? 'Saving weekly count...'
        : 'Type numbers only. Changes save automatically.';
}

function logout() {
    clearLoginSession();
    window.location.replace('tl-login.html');
}

function clearLoginSession() {
    const keys = [
        'adrianosTlAuth',
        'adrianosTlUserId',
        'adrianosTlUsername',
        'adrianosTlRole',
        'adrianosLoggedUserId',
        'adrianosLoggedUsername',
        'adrianosLoggedRole'
    ];

    keys.forEach(key => sessionStorage.removeItem(key));
}

function sanitizeNumberInput(value) {
    const digitsOnly = String(value || '').replace(/[^0-9]/g, '');
    if (!digitsOnly) return '';
    return String(Math.min(99999, Number(digitsOnly)));
}

function getSaveTimerKey(productKey, reportDate) {
    return `${reportDate}|${productKey}`;
}

function getCount(productKey) {
    return Number(counts.get(productKey)) || 0;
}

function getBranchName() {
    return currentBranch?.name || currentUser?.branch_name || 'Unassigned Branch';
}

function getBranchKey() {
    if (currentUser?.branch_id) return `branch_${currentUser.branch_id}`;
    return `unassigned_${currentUser?.id || 'unknown'}`;
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

function formatWeekRange(weekStartKey) {
    const weekEndKey = addDaysToDateKey(weekStartKey, 6);
    return `${formatPHDateShort(weekStartKey)} - ${formatPHDateShort(weekEndKey)}`;
}

function getPHTimeText() {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: PH_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(new Date());
}

function formatPHDateShort(dateKey) {
    const [year, month, day] = String(dateKey).split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: '2-digit',
        year: 'numeric'
    }).format(date);
}

function formatPeso(price) {
    if (price === null || price === undefined || price === '') return '';
    return `₱${Number(price).toLocaleString('en-PH')}`;
}

function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;

    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 2800);
}

function createSizedProducts(category, names, sizes) {
    return names.flatMap(name => sizes.map(sizeData => createProduct(category, name, sizeData.size, sizeData.price)));
}

function createSingleSizeProducts(category, names, size, price) {
    return names.map(name => createProduct(category, name, size, price));
}

function createProduct(category, name, variant, price, keyCategory = category, keyVariant = variant) {
    // keyCategory and keyVariant preserve existing database keys when display details change.
    const key = slugify(`${keyCategory}-${name}-${keyVariant || 'regular'}-${price}`);

    return { key, category, name, variant, price };
}

function slugify(value) {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
