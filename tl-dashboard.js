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
    createProduct('More To Enjoy / Add Ons', 'Thai Milk Tea', '', 130),
    createProduct('More To Enjoy / Add Ons', 'Hot Chocolate', '', 70),
    createProduct('More To Enjoy / Add Ons', 'Mineral Water', '', 25),
    createProduct('More To Enjoy / Add Ons', 'Coke in Can', '', 70),
    createProduct('More To Enjoy / Add Ons', 'Nata', '', 20),
    createProduct('More To Enjoy / Add Ons', 'Cold Foam', '', 20),
    createProduct('More To Enjoy / Add Ons', 'Oat Milk', '', 50),

    createProduct('Fries and Nachos Series', 'French Fries', 'Sour Cream', 90),
    createProduct('Fries and Nachos Series', 'French Fries', 'BBQ', 90),
    createProduct('Fries and Nachos Series', 'French Fries', 'Cheese', 90),
    createProduct('Fries and Nachos Series', 'Nachos', '', 95),
    createProduct('Fries and Nachos Series', 'Nachos Fries', '', 155),
    createProduct('Fries and Nachos Series', 'Shawarma Fries', '', 100),
    createProduct('Fries and Nachos Series', 'Cheesy Fries', '', 100),
    createProduct('Quesadilla Spree', 'Cheese Quesadillas', '', 105),
    createProduct('Quesadilla Spree', 'Chicken Quesadillas', '', 110),
    createProduct('Quesadilla Spree', 'Pork Quesadillas', '', 115),
    createProduct('Quesadilla Spree', 'Beef Quesadillas', '', 125),
    createProduct('Quesadilla Spree', 'Tuna Melt Quesadillas', '', 135),
    createProduct('Quesadilla Spree', 'Hawaiian Quesadillas', '', 145),

    createProduct('Dip It Good', "Chips N' Dip", '', 125),
    createProduct('Dip It Good', 'Onion Rings', '', 145),
    createProduct('Dip It Good', 'Lumpia Shanghai', '', 135),
    createProduct('Dip It Good', 'Chicken Skin', '', 160),
    createProduct('Hunger Crushers', 'Chicken Tenders w/ Fries', '', 145),
    createProduct('Hunger Crushers', 'Ramen', '', 135),
    createProduct('Hunger Crushers', 'Chicken Alfredo', '', 170),
    createProduct('Snack-Bar Remix', 'Vcut Con Nacho Fries', '', 135),
    createProduct('Snack-Bar Remix', 'Vcut Con Nachos', '', 105),
    createProduct('Snack-Bar Remix', 'Chippy Con Carne', 'Small', 60),
    createProduct('Snack-Bar Remix', 'Chippy Con Carne', 'Big', 90),

    createProduct('Bun Intended', 'Cheese Burger', '', 145),
    createProduct('Bun Intended', 'Chicken Burger', '', 135),
    createProduct('That’s A Wrap', 'Shawarma Wrap', 'Beef', 85),
    createProduct('That’s A Wrap', 'Shawarma Wrap', 'Pork', 80),
    createProduct('That’s A Wrap', 'Shawarma Wrap', 'Chicken', 75),
    createProduct('Add Ons', 'Steam Rice', '', 25),
    createProduct('Add Ons', 'Java Rice', '', 30),
    createProduct('Add Ons', 'Garlic Rice', '', 30),
    createProduct('Add Ons', 'Take-out Box', '', 10),
    createProduct('Add Ons', 'Egg', '', 25),
    createProduct('Add Ons', 'Sauce', '', 25),

    createProduct('Kanin-Get Enough', 'Burger Steak', '', 165),
    createProduct('Kanin-Get Enough', 'Chicken Tenders', '', 155),
    createProduct('Kanin-Get Enough', 'Hungarian', '', 145),
    createProduct('Kanin-Get Enough', 'Fish Fillet', '', 155),
    createProduct('Kanin-Get Enough', 'Liempo', '', 165),
    createProduct('Kanin-Get Enough', 'Sisig', '', 145),
    createProduct('Kanin-Get Enough', 'Backribs', '', 200),
    createProduct('Kanin-Get Enough', 'Chicken Katsu Curry', '', 195),
    createProduct('The Flavor Trip', 'Shawarma Rice', 'Chicken', 110),
    createProduct('The Flavor Trip', 'Shawarma Rice', 'Pork', 115),
    createProduct('The Flavor Trip', 'Shawarma Rice', 'Beef', 125),
    createProduct('The Flavor Trip', 'Burrito', 'Chicken', 125),
    createProduct('The Flavor Trip', 'Burrito', 'Pork', 135),
    createProduct('The Flavor Trip', 'Burrito', 'Beef', 145)
];

const productByKey = new Map(PRODUCTS.map(product => [product.key, product]));

let currentUser = null;
let currentBranch = null;
let currentReportDate = getPHDateKey();
let counts = new Map();
let currentCategory = 'all';
let currentSearch = '';
let saveTimers = new Map();
let pendingSaveCount = 0;
let dateChangeInProgress = false;

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
}

function bindEvents() {
    elements.logoutBtn.addEventListener('click', logout);
    elements.refreshBtn.addEventListener('click', refreshData);
    elements.clearDayBtn.addEventListener('click', clearTodayOrders);

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

    elements.productGrid.addEventListener('click', async event => {
        const button = event.target.closest('[data-action][data-key]');
        if (!button) return;

        await handleDateChangeIfNeeded(true);

        const product = productByKey.get(button.dataset.key);
        if (!product) return;

        const action = button.dataset.action;
        const currentQty = getCount(product.key);
        const nextQty = action === 'increase' ? currentQty + 1 : Math.max(0, currentQty - 1);
        const targetReportDate = currentReportDate;

        updateLocalCount(product, nextQty);
        scheduleSave(product, nextQty, targetReportDate);
    });

    setInterval(() => {
        updateClockTexts();
        handleDateChangeIfNeeded(false).catch(error => {
            console.error('Automatic PH date check failed:', error);
        });
    }, 30000);
}

async function initDashboard() {
    try {
        await loadCurrentUser();
        await loadBranch();
        setupCategories();
        updateHeaderTexts();
        await loadTodayOrders();
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

    if (!error && data) {
        currentBranch = data;
    }
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

async function loadTodayOrders() {
    const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('report_date', currentReportDate)
        .eq('branch_key', getBranchKey());

    if (error) {
        throw new Error('Could not load today\'s inventory. Please check the Supabase table.');
    }

    counts = new Map();

    (data || []).forEach(row => {
        counts.set(row.product_key, Number(row.quantity) || 0);
    });
}

async function handleDateChangeIfNeeded(silent = false) {
    const latestReportDate = getPHDateKey();

    if (latestReportDate === currentReportDate) {
        return false;
    }

    if (dateChangeInProgress) {
        return true;
    }

    dateChangeInProgress = true;

    try {
        currentReportDate = latestReportDate;
        updateHeaderTexts();
        await loadTodayOrders();
        renderProducts();
        renderSummary();

        if (!silent) {
            showToast('New PH day started. Counts reset to zero.', 'success');
        }

        return true;
    } catch (error) {
        console.error('Automatic date change failed:', error);
        showToast('New PH day detected, but refresh failed. Please tap Refresh.', 'error');
        return false;
    } finally {
        dateChangeInProgress = false;
    }
}

async function refreshData() {
    elements.refreshBtn.disabled = true;
    elements.refreshBtn.textContent = 'Refreshing...';

    try {
        currentReportDate = getPHDateKey();
        updateHeaderTexts();
        await loadTodayOrders();
        renderProducts();
        renderSummary();
        showToast('Inventory refreshed.', 'success');
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
        const detailText = [product.variant, formatPeso(product.price)].filter(Boolean).join(' • ');

        return `
            <article class="product-card ${hasCountClass}" data-card-key="${escapeHTML(product.key)}">
                <div class="product-meta">
                    <span class="product-category">${escapeHTML(product.category)}</span>
                    <strong class="product-name">${escapeHTML(product.name)}</strong>
                    <span class="product-details">${escapeHTML(detailText)}</span>
                </div>

                <div class="counter-row">
                    <button type="button" class="counter-btn minus" data-action="decrease" data-key="${escapeHTML(product.key)}" ${count <= 0 ? 'disabled' : ''}>−</button>
                    <div class="count-box" id="count-${escapeHTML(product.key)}">${count}</div>
                    <button type="button" class="counter-btn plus" data-action="increase" data-key="${escapeHTML(product.key)}">+</button>
                </div>
            </article>
        `;
    }).join('');
}

function renderSummary() {
    const totalOrders = Array.from(counts.values()).reduce((sum, value) => sum + value, 0);
    const activeItems = Array.from(counts.values()).filter(value => value > 0).length;

    elements.totalOrdersText.textContent = String(totalOrders);
    elements.activeItemsText.textContent = String(activeItems);

    const orderedItems = PRODUCTS
        .map(product => ({ product, quantity: getCount(product.key) }))
        .filter(item => item.quantity > 0)
        .sort((a, b) => b.quantity - a.quantity || a.product.name.localeCompare(b.product.name))
        .slice(0, 10);

    if (!orderedItems.length) {
        elements.topItemsList.innerHTML = '<div class="empty-state">No orders recorded yet.</div>';
        return;
    }

    elements.topItemsList.innerHTML = orderedItems.map(({ product, quantity }) => {
        const detailText = [product.category, product.variant, formatPeso(product.price)].filter(Boolean).join(' • ');

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

function updateLocalCount(product, quantity) {
    counts.set(product.key, quantity);

    const countBox = document.getElementById(`count-${product.key}`);
    const card = document.querySelector(`[data-card-key="${CSS.escape(product.key)}"]`);

    if (countBox) countBox.textContent = String(quantity);
    if (card) {
        card.classList.toggle('has-count', quantity > 0);
        const minusButton = card.querySelector('[data-action="decrease"]');
        if (minusButton) minusButton.disabled = quantity <= 0;
    }

    renderSummary();
}

function scheduleSave(product, quantity, reportDate = currentReportDate) {
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
            await persistQuantity(product, quantity, reportDate);
        } catch (error) {
            console.error('Save failed:', error);
            showToast('Failed to save. Tap Refresh to check latest data.', 'error');
        } finally {
            pendingSaveCount = Math.max(0, pendingSaveCount - 1);
            updateSaveStatus();
        }
    }, 350);

    saveTimers.set(timerKey, timerId);
}

async function persistQuantity(product, quantity, reportDate = currentReportDate) {
    if (quantity <= 0) {
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
        quantity,
        updated_at: new Date().toISOString()
    };

    const { error } = await supabase
        .from(TABLE_NAME)
        .upsert(payload, { onConflict: 'report_date,branch_key,product_key' });

    if (error) throw error;
}

async function clearTodayOrders() {
    await handleDateChangeIfNeeded(true);

    const confirmClear = confirm('Clear all product counts for today? This cannot be undone.');
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
        showToast('Today\'s counts cleared.', 'success');
    } catch (error) {
        console.error('Clear failed:', error);
        showToast('Failed to clear today\'s counts.', 'error');
    } finally {
        elements.clearDayBtn.disabled = false;
        elements.clearDayBtn.textContent = 'Clear Today';
    }
}

function updateHeaderTexts() {
    const leaderName = currentUser.full_name || currentUser.username || 'Team Leader';
    const branchName = getBranchName();

    elements.navBranchText.textContent = branchName;
    elements.todayText.textContent = formatPHDateLong(currentReportDate);
    elements.leaderText.textContent = `Team Leader: ${leaderName}`;
    elements.branchText.textContent = `Branch: ${branchName}`;

    updateClockTexts();
}

function updateClockTexts() {
    elements.phTimeText.textContent = getPHTimeText();
}

function updateSaveStatus() {
    elements.saveStatusText.textContent = pendingSaveCount > 0 ? 'Saving changes...' : 'Changes save automatically.';
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

function getPHTimeText() {
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: PH_TIMEZONE,
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    }).format(new Date());
}

function formatPHDateLong(dateKey) {
    const date = new Date(`${dateKey}T00:00:00+08:00`);
    return new Intl.DateTimeFormat('en-PH', {
        timeZone: PH_TIMEZONE,
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
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

function createProduct(category, name, variant, price) {
    const key = slugify(`${category}-${name}-${variant || 'regular'}-${price}`);

    return {
        key,
        category,
        name,
        variant,
        price
    };
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
