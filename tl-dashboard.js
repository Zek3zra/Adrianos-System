import { supabase } from './supabaseClient.js';

const TABLE_NAME = 'daily_product_orders';
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
