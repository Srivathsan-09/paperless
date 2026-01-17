/**
 * Paperless Core Logic
 */

const STATE = {
    isLoggedIn: false,
    milkChart: null,
    authMode: 'signIn', // 'signIn' or 'signUp'
    currentDate: new Date(),
    selectedMonth: new Date().getMonth(),
    selectedYear: new Date().getFullYear(),
    view: 'dashboard',
    activeCategory: null,
    activeSubcategory: null,
    data: [],
    tempMilkData: [], // Cache for milk entries
    categories: [

        { id: 'daily', name: 'Daily Expenses', icon: 'zap' },
        { id: 'utilities', name: 'Utilities & Bills', icon: 'file-text' },
        { id: 'groceries', name: 'Groceries', icon: 'shopping-cart' },
        { id: 'maintenance', name: 'House Maintenance', icon: 'home' },
        { id: 'education', name: 'Education', icon: 'book' },
        { id: 'health', name: 'Health', icon: 'activity' },
        { id: 'transport', name: 'Transportation', icon: 'truck' },
        { id: 'events', name: 'Occasional & Events', icon: 'gift' },
        { id: 'subscriptions', name: 'Subscriptions', icon: 'repeat' },
        { id: 'misc', name: 'Miscellaneous', icon: 'more-horizontal' }
    ],
    subcategories: {
        'daily': ['Milk', 'Newspaper', 'Fruits & Vegetables', 'Water Can'],
        'utilities': ['EB Bill', 'Mobile Recharge', 'Internet/Wi-Fi', 'Gas Cylinder'],
        'groceries': ['Supermarket / Monthly Shopping', 'Local Grocery Store', 'Dairy Products'],
        'maintenance': ['Plumbing/Electrical', 'Cleaning Supplies', 'Gardening'],
        'education': ['School/College Fees', 'Books & Stationery', 'Courses/Tuition'],
        'health': ['Medicines', 'Doctor Consultations', 'Lab Tests'],
        'transport': ['Fuel (Petrol/Diesel)', 'Public Transport', 'Vehicle Service'],
        'events': ['Festivals', 'Birthdays', 'Wedding/Parties'],
        'subscriptions': ['OTT Apps (Netflix/Prime)', 'Gym Membership', 'Insurance Premiums'],
        'misc': ['Small Spends', 'General Expense', 'Others']
    },
    isLeaf: false,
    isAutoOpened: false
};

const SUB_ICONS = {
    'Milk': 'droplet', // Ensure 'droplet' is in sprite or map to 'tint'
    'Newspaper': 'file-text',
    'Fruits & Vegetables': 'shopping-cart',
    'Water Can': 'droplet',
    'EB Bill': 'zap',
    'Mobile Recharge': 'smartphone',
    'Internet/Wi-Fi': 'wifi',
    'Gas Cylinder': 'box',
    'Supermarket / Monthly Shopping': 'shopping-cart',
    'Local Grocery Store': 'shopping-bag',
    'Dairy Products': 'droplet',
    'Plumbing/Electrical': 'tool',
    'Cleaning Supplies': 'trash-2',
    'Gardening': 'sun',
    'School/College Fees': 'book',
    'Books & Stationery': 'edit-3',
    'Courses/Tuition': 'monitor',
    'Medicines': 'plus-circle',
    'Doctor Consultations': 'user-plus',
    'Lab Tests': 'activity',
    'Fuel (Petrol/Diesel)': 'truck',
    'Public Transport': 'map-pin',
    'Vehicle Service': 'settings',
    'Festivals': 'star',
    'Birthdays': 'gift',
    'Wedding/Parties': 'heart',
    'OTT Apps (Netflix/Prime)': 'tv',
    'Gym Membership': 'activity',
    'Insurance Premiums': 'shield',
    'Small Spends': 'coffee',
    'General Expense': 'dollar-sign',
    'Others': 'more-horizontal'
};

function getSubIconHelper(name) {
    // If not in map, return a default
    // We assume the sprite has these. If not, they might show blank.
    // Safest bet is to map to categories' icons if unsure, but let's try specific ones.
    // 'droplet' might need to be added to index.html if missing.
    return SUB_ICONS[name] || 'more-horizontal';
}

// --- PERSISTENCE ---

function saveState() {
    localStorage.setItem('PAPERLESS_STATE', JSON.stringify({
        data: STATE.data,
        categories: STATE.categories,
        subcategories: STATE.subcategories,
        isLoggedIn: STATE.isLoggedIn,
        selectedMonth: STATE.selectedMonth,
        selectedYear: STATE.selectedYear
    }));
}

function loadState() {
    const saved = localStorage.getItem('PAPERLESS_STATE');
    if (saved) {
        const parsed = JSON.parse(saved);
        STATE.data = parsed.data || [];
        STATE.categories = parsed.categories || STATE.categories;
        STATE.subcategories = parsed.subcategories || STATE.subcategories;
        STATE.isLoggedIn = parsed.isLoggedIn || false;
        if (parsed.selectedMonth !== undefined) STATE.selectedMonth = parsed.selectedMonth;
        if (parsed.selectedYear !== undefined) STATE.selectedYear = parsed.selectedYear;
    }
}

// Initialize persistence
loadState();

// --- HEADER MANAGER (Unified Mobile Header) ---
// Global Handler for Back Button (State-Based & Robust)
window.currentBackAction = null;
window.handleHeaderBack = function (e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    // 1. Priority: Close Overlay if active
    const overlay = document.getElementById('moduleOverlay');
    if (overlay && overlay.classList.contains('active')) {
        // Determine context to close intelligently
        // If in Misc/Savings sub-item, we want to go back to parent grid
        // But closeModule() handles navigation via fallback if set.
        // We rely on currentBackAction string to find the fallback ID?
        // Or just close it and let logic handle it.
        const action = window.currentBackAction;
        if (action && action.includes('closeModule')) {
            const match = action.match(/closeModule\('(.+)'\)/);
            if (match) { closeModule(match[1]); return; }
        }
        closeModule();
        return;
    }

    // 2. Priority: Navigation based on State
    // If in Subcategory View (like Miscellaneous Grid), go Dashboard
    if (STATE.view === 'subcategories') {
        renderDashboard();
        return;
    }

    // 3. Fallback: Configured Action
    const action = window.currentBackAction;
    if (action) {
        if (typeof action === 'function') action();
        else if (action === 'renderDashboard' || action.includes('renderDashboard')) renderDashboard();
        else try { window.eval(action); } catch (err) { renderDashboard(); }
        return;
    }

    // 4. Ultimate Fallback
    renderDashboard();
};

const HeaderManager = {
    update: function (config) {
        // Store config globally for the handler
        window.currentBackAction = config.onBack;

        // Ensure container exists without destroying layout
        let backBtnContainer = document.getElementById('headerBackBtn');
        if (!backBtnContainer) {
            const headerLeft = document.querySelector('.header-left');
            if (headerLeft) {
                backBtnContainer = document.createElement('div');
                backBtnContainer.id = 'headerBackBtn';
                // Insert as first child
                headerLeft.insertAdjacentElement('afterbegin', backBtnContainer);
            }
        }

        const subContentRow = document.getElementById('headerSubContent');
        const navRow = document.getElementById('headerNavRow');
        const logo = document.querySelector('.logo');
        const monthTrigger = document.getElementById('monthPickerTrigger');

        // 1. Reset
        const isMobile = window.innerWidth <= 768;

        if (backBtnContainer) {
            backBtnContainer.innerHTML = '';
            backBtnContainer.style.display = 'none';
        }
        if (subContentRow) {
            subContentRow.innerHTML = '';
            subContentRow.classList.remove('active');
            if (!isMobile) subContentRow.style.display = 'none';
        }
        if (navRow) {
            navRow.innerHTML = '';
            navRow.classList.remove('active');
            if (!isMobile) navRow.style.display = 'none';
        }
        if (logo) logo.style.display = 'block';
        if (monthTrigger) monthTrigger.style.visibility = 'visible';

        // Helper to show rows only on mobile
        const safeShow = (row, html) => {
            if (isMobile && row && html) {
                row.innerHTML = html;
                row.classList.add('active');
                row.style.display = 'flex';
            } else if (row) {
                row.classList.remove('active');
                row.style.display = 'none';
                row.innerHTML = '';
            }
        };

        // 2. Back Button
        if (config.showBack && backBtnContainer) {
            backBtnContainer.style.display = 'block';
            // Use global handler
            backBtnContainer.innerHTML = `
                <button id="dynamicBackBtn" class="back-btn-v3" onclick="window.handleHeaderBack(event)">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <use href="#icon-arrow-left"></use>
                    </svg>
                </button>
            `;

            // Removed unconditional hiding of month selector on mobile
        }

        // 3. Sub Content (Tabs/etc)
        safeShow(subContentRow, config.subContentHTML);

        // 4. Nav Row (Month Selector)
        safeShow(navRow, config.navRowHTML);

        // 5. Global Selector Toggle
        if (config.hideMonthSelector && monthTrigger) {
            monthTrigger.style.visibility = 'hidden';
        }
    }
};

// --- UI HELPERS ---
function showToast(message, type = 'info') {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Simple icon mapping
    let icon = '';
    if (type === 'error') icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--error);"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
    else if (type === 'success') icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--success);"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    else icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--primary);"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';

    toast.innerHTML = `${icon}<span>${message}</span>`;

    container.appendChild(toast);

    // Auto remove
    setTimeout(() => {
        toast.style.animation = 'fadeOutToast 0.3s ease-out forwards';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

/**
 * Custom Confirmation Modal
 * @param {string} message 
 * @returns {Promise<boolean>}
 */
function showConfirm(message = "Do you want to delete this?") {
    return new Promise((resolve) => {
        let overlay = document.getElementById('confirmOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'confirmOverlay';
            overlay.className = 'confirm-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="confirm-card">
                <div class="confirm-message">${message}</div>
                <div class="confirm-actions">
                    <button class="confirm-btn cancel" id="confirmCancel">Cancel</button>
                    <button class="confirm-btn danger" id="confirmYes">Delete</button>
                </div>
            </div>
        `;

        const cleanup = (value) => {
            overlay.classList.remove('active');
            setTimeout(() => {
                overlay.style.display = 'none';
                resolve(value);
            }, 300);
        };

        overlay.style.display = 'flex';
        // Force reflow for animation
        overlay.offsetHeight;
        overlay.classList.add('active');

        document.getElementById('confirmCancel').onclick = () => cleanup(false);
        document.getElementById('confirmYes').onclick = () => cleanup(true);

        // Also close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup(false);
        };
    });
}

/**
 * Custom Prompt Modal
 * @param {string} message 
 * @param {string} placeholder 
 * @returns {Promise<string|null>}
 */
function showPrompt(message, placeholder = "") {
    return new Promise((resolve) => {
        let overlay = document.getElementById('promptOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'promptOverlay';
            overlay.className = 'confirm-overlay'; // Reuse confirm overlay styles
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="confirm-card">
                <div class="confirm-message">${message}</div>
                <input type="text" id="promptInput" class="prompt-input" placeholder="${placeholder}" autocomplete="off">
                <div class="confirm-actions">
                    <button class="confirm-btn cancel" id="promptCancel">Cancel</button>
                    <button class="confirm-btn primary" id="promptOk">OK</button>
                </div>
            </div>
        `;

        const input = document.getElementById('promptInput');
        const btnOk = document.getElementById('promptOk');
        const btnCancel = document.getElementById('promptCancel');

        const cleanup = (value) => {
            overlay.classList.remove('active');
            document.removeEventListener('keydown', handleKeys);
            setTimeout(() => {
                overlay.style.display = 'none';
                resolve(value);
            }, 300);
        };

        const handleKeys = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                cleanup(input.value.trim() || null);
            }
            if (e.key === 'Escape') {
                e.preventDefault();
                cleanup(null);
            }
        };

        btnOk.onclick = () => cleanup(input.value.trim() || null);
        btnCancel.onclick = () => cleanup(null);
        document.addEventListener('keydown', handleKeys);

        overlay.style.display = 'flex';
        overlay.offsetHeight;
        overlay.classList.add('active');

        // Focus input after animation
        setTimeout(() => input.focus(), 100);

        // Also close on overlay click
        overlay.onclick = (e) => {
            if (e.target === overlay) cleanup(null);
        };
    });
}

// --- API HELPER ---
async function fetchAPI(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(url, { ...options, headers });

    if (response.status === 401) {
        localStorage.removeItem('authToken');
        window.location.href = 'Loginpage.html';
        return;
    }

    if (!response.ok) {
        let errorMessage = 'API Request failed';
        try {
            const error = await response.json();
            errorMessage = error.message || errorMessage;
        } catch (e) {
            // If JSON parse fails, try text
            try {
                const text = await response.text();
                if (text) errorMessage = text;
            } catch (e2) { }
        }
        throw new Error(errorMessage);
    }

    return await response.json();
}

// Token-based auth check
function checkAuth() {
    // Check URL for token first (from Google OAuth redirect)
    const urlParams = new URLSearchParams(window.location.search);
    const urlToken = urlParams.get('token');
    if (urlToken) {
        localStorage.setItem('authToken', urlToken);
        STATE.isLoggedIn = true;
        const isNewUser = urlParams.get('isNewUser');
        const isSuccess = urlParams.get('success');

        // Clean URL to remove token for security and aesthetics
        window.history.replaceState({}, document.title, window.location.pathname);

        if (isNewUser === 'true') {
            sessionStorage.setItem('isNewUser', 'true');
            window.location.href = 'get-started.html';
            return true;
        }

        if (isSuccess === 'true') {
            sessionStorage.setItem('loginJustCompleted', 'true');
            window.location.href = 'success.html';
            return true;
        }
    }

    const urlError = urlParams.get('error');
    if (urlError) {
        // Human-readable mapping
        let msg = urlError;
        if (urlError.includes('access_denied')) msg = 'Authentication failed. Access denied.';
        else if (urlError.includes('verification_failed')) msg = 'Email verification failed.';

        showToast(msg, 'error');
        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }

    const token = localStorage.getItem('authToken');
    if (token) {
        try {
            const parts = token.split('.');
            if (parts.length !== 3) throw new Error('Invalid JWT format');
            const payload = JSON.parse(atob(parts[1]));
            if (payload.exp * 1000 > Date.now()) {
                STATE.isLoggedIn = true;
                // Also store user email if it was in the payload
                if (payload.email) localStorage.setItem('userEmail', payload.email);
                return true;
            } else {
                // Token expired
                localStorage.removeItem('authToken');
                localStorage.removeItem('userEmail');
            }
        } catch (e) {
            console.error('Invalid token found', e);
            localStorage.removeItem('authToken');
        }
    }
    return STATE.isLoggedIn;
}

const currentPage = window.location.pathname.split('/').pop() || 'index.html';
const isAuthPage = currentPage === 'Loginpage.html';


if (!checkAuth() && !isAuthPage) {
    window.location.href = 'Loginpage.html';
} else if (STATE.isLoggedIn && isAuthPage) {
    // If already logged in and on Login Page, go to dashboard
    window.location.href = 'index.html';
}

function logout() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('userEmail');
    STATE.isLoggedIn = false;
    saveState();
    window.location.href = 'Loginpage.html';
}


// Helper to get UTC date at midnight
function getUTCDateObj(year, month, day) {
    return new Date(Date.UTC(year, month, day));
}


// --- DATA SYNC ---

async function fetchCategories(parent = '', isDashboard = false) {
    try {
        let url = '/api/categories';
        const params = new URLSearchParams();
        if (parent) params.append('parent', parent);
        if (isDashboard) params.append('dashboard', 'true');

        if (params.toString()) {
            url += `?${params.toString()}`;
        }

        const categories = await fetchAPI(url);

        return categories;
    } catch (err) {
        console.error('Error fetching categories:', err);
        return [];
    }
}


async function addEntry(entry) {
    try {
        await fetchAPI('/api/entries', {
            method: 'POST',
            body: JSON.stringify(entry)
        });
        showToast('Entry saved successfully', 'success');
        STATE.needsRefresh = true; // Signal reset for UI refresh

        // FIX: Force immediate refresh of background grid if visible
        // Only if it's NOT a leaf category to avoid redundant DOM wipes
        if (STATE.view === 'subcategories' && STATE.activeCategory && !STATE.isLeaf) {
            setTimeout(() => {
                const overlay = document.getElementById('moduleOverlay');
                if (overlay && document.body.contains(overlay)) {
                    openCategory(STATE.activeCategory, true);
                }
            }, 100);
        }

        return true;
    } catch (err) {
        showToast('Unable to save data. ' + err.message, 'error');
        return false;
    }
}


// --- CUSTOM CRUD ---

async function promptAddCategory() {
    const name = prompt("Enter Category Name:");
    if (name) {
        try {
            const id = name.toLowerCase().replace(/\s+/g, '-');
            const newCategory = await fetchAPI('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name, parentCategory: 'General', type: 'general' })
            });

            alert(`Category "${name}" added!`);
            window.location.href = `category.html?id=${newCategory._id}`;
        } catch (err) {
            alert('Failed to add category: ' + err.message);
        }
    }
}

async function promptAddItem(catId) {
    const cat = STATE.categories.find(c => c.id === catId || c._id === catId);
    const name = await showPrompt("Enter Item Name:", "e.g. Bread, Grocery Item");
    if (name) {
        try {
            await fetchAPI('/api/categories', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    parentCategory: cat.name,
                    type: name === 'Milk' ? 'milk' : 'general'
                })
            });
            openCategory(catId);
        } catch (err) {
            alert('Failed to add item: ' + err.message);
        }
    }
}

async function deleteCategory(catId) {
    const confirmed = await showConfirm('Delete this category? This will also delete all entries inside it.');
    if (confirmed) {
        try {
            await fetchAPI(`/api/categories/${catId}`, { method: 'DELETE' });
            showToast('Category deleted', 'success');

            // Context-aware refresh
            // Refresh the view
            if (STATE.view === 'subcategories' && STATE.activeCategory) {
                openCategory(STATE.activeCategory);
            } else {
                renderDashboard();
            }

        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
}



async function deleteSubcategory(catId, subName) {
    const confirmed = await showConfirm(`Are you sure you want to delete "${subName}"?`);
    if (confirmed) {
        STATE.subcategories[catId] = STATE.subcategories[catId].filter(s => s !== subName);
        // Also remove any data entries associated with this subcategory
        STATE.data = STATE.data.filter(d => !(d.category === catId && d.subCategory === subName));
        saveState();
        showToast('Subcategory deleted', 'success');
        openCategory(catId);
    }
}

// --- REFACTOR HELPERS ---
function editCategory(event, id, currentName) {
    if (event) event.stopPropagation();
    const card = event.target.closest('.category-card') || event.target.closest('.subcategory-card-item');
    if (!card) return;

    const span = card.querySelector('span');
    if (!span || span.style.display === 'none') return;

    // Hide span, show input
    span.style.display = 'none';

    // Check if input already exists (edge case)
    let input = card.querySelector('.category-rename-input');
    if (input) input.remove();

    input = document.createElement('input');
    input.type = 'text';
    input.value = currentName;
    input.className = 'category-rename-input';
    input.onclick = (e) => e.stopPropagation();

    // Save on Enter, Cancel on Esc
    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            input.blur(); // Triggers blur event which saves
        } else if (e.key === 'Escape') {
            cancelRename(span, input);
        }
    });

    // Save on Blur
    input.addEventListener('blur', async () => {
        await saveCategoryName(id, input.value.trim(), span, input, currentName);
    });

    card.appendChild(input);
    input.focus();
}

function cancelRename(span, input) {
    if (input) input.remove();
    span.style.display = 'block';
}

async function saveCategoryName(id, newName, span, input, oldName) {
    if (newName === oldName) {
        cancelRename(span, input);
        return;
    }

    if (!newName || newName.length === 0) {
        input.style.borderColor = 'var(--error)';
        return;
    }

    if (newName.length > 25) {
        showToast("Name too long (max 25 chars)", "error");
        input.style.borderColor = 'var(--error)';
        return;
    }

    try {
        // Optimistic UI Update
        input.remove();
        span.textContent = newName;
        span.style.display = 'block';

        // Update Backend
        await fetchAPI(`/api/categories/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ name: newName })
        });

        // Update Local State Reference
        const cat = STATE.categories.find(c => c._id === id || c.id === id);
        if (cat) cat.name = newName;

        // Refresh to ensure everything aligns (e.g., if used in other lists)
        // verify calling view? For now, we leave it as optimistic.

    } catch (e) {
        console.error("Rename failed", e);
        showToast("Failed to rename category", "error");
        span.textContent = oldName; // Revert
    }
}

// --- UI COMPONENTS ---

const MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

// --- NAVIGATION ---

// --- PAGE MAP ---

// --- UNIVERSAL FORM SYSTEM ---

/**
 * Returns the HTML for a standardized entry form.
 */
function getUniversalFormHTML(config) {
    const {
        title = 'Entry',
        onBack = 'closeModule()',
        amountValue = '',
        dateValue = new Date().toISOString().split('T')[0],
        itemNameLabel = 'Product Name',
        itemNameValue = '',
        itemNamePlaceholder = 'e.g. Bread, Car service',
        notesValue = '',
        customFieldsHTML = '',
        historyContainerId = 'formHistory',
        historyHeader = 'Recent History',
        showDelete = false,
        showItemName = true,
        isItemNameMandatory = true
    } = config;

    return `
        <div class="panel-header">
            <button class="close-circle" onclick="${onBack}">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <h3>${title}</h3>
            <div></div> <!-- Spacer for grid centering -->
        </div>
        <div class="panel-body">
            <div class="entry-view-container">
                <form id="universalForm">
                    <div class="form-group">
                        <label>Amount (Mandatory) ₹</label>
                        <input type="number" id="formAmount" placeholder="0.00" value="${amountValue}" required>
                    </div>
                    <div class="form-group">
                        <label>Date (Mandatory)</label>
                        <input type="date" id="formDate" value="${dateValue}" required>
                    </div>
                    
                    ${customFieldsHTML}
                    

                    <div class="form-group">
                        <label>Notes (Optional - Max 50 words)</label>
                        <textarea id="formNotes" rows="2" placeholder="Enter details..." oninput="this.value = this.value.split(/\s+/).slice(0, 50).join(' ')">${notesValue}</textarea>
                    </div>

                    <div>
                        <button type="submit" class="entry-full-btn save-btn">Save Entry</button>
                    </div>
                </form>
            </div>
            
            ${historyContainerId ? `
            <div class="entry-history-card">
                <div id="${historyContainerId}" class="history-scroller-wrapper"></div>
            </div>` : ''}
        </div>
    `;
}

/**
 * Common setup for universal forms (listeners, etc.)
 */
function setupUniversalForm(onSave, onDelete = null) {
    const amtInput = document.getElementById('formAmount');
    const totalDisp = document.getElementById('formTotalDisplay');

    if (amtInput && totalDisp) {
        amtInput.addEventListener('input', () => {
            const val = parseFloat(amtInput.value || 0);
            totalDisp.textContent = `₹${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        });
    }

    const form = document.getElementById('universalForm');
    if (form) {
        form.onsubmit = async (e) => {
            e.preventDefault();
            const btn = e.target.querySelector('.save-btn');
            if (btn) btn.classList.add('btn-loading');

            const entry = {
                amount: parseFloat(document.getElementById('formAmount').value),
                date: document.getElementById('formDate').value,
                itemName: document.getElementById('formItemName') ? document.getElementById('formItemName').value : '',
                notes: document.getElementById('formNotes').value
            };

            await onSave(entry, e);
            if (btn) btn.classList.remove('btn-loading');
        };
    }

    const delBtn = document.getElementById('formDeleteBtn');
    if (delBtn && onDelete) {
        delBtn.onclick = onDelete;
    }
}


async function renderDashboard() {
    STATE.view = 'dashboard';
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;
    const main = document.getElementById('mainContent');
    // REMOVED immediate class reset to prevent jump

    // Unified Header Update
    HeaderManager.update({ showBack: false });

    // --- PARALLEL FETCHING START ---
    // Start fetching entries immediately for the background
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    const entriesPromise = fetchAPI(`/api/entries?month=${monthStr}`).catch(e => {
        console.error("Failed to fetch entries", e);
        return [];
    });

    // Fetch categories for dashboard (Critical Path)
    // Optimization: Request only dashboard items from backend to reduce payload
    let categories = await fetchCategories('', true);
    // Use defaults if none found from API
    if (categories.length === 0) {
        // If API returns empty (new user?), falls back to local state or empty
        // logic below handles it
    } else {
        STATE.categories = categories; // Update local state
    }

    // Exclude subcategories of Misc/Savings from dashboard, and manual inject parent folders
    let dashboardList = categories.filter(c => c.parentCategory !== 'Miscellaneous' && c.parentCategory !== 'Savings');

    // Ensure Miscellaneous Folder exists
    if (!dashboardList.some(c => c.name === 'Miscellaneous')) {
        dashboardList.push({ name: 'Miscellaneous', id: 'miscellaneous', icon: 'more-horizontal', _id: 'miscellaneous' });
    }
    // Ensure Savings Folder exists
    if (!dashboardList.some(c => c.name === 'Savings')) {
        dashboardList.push({ name: 'Savings', id: 'savings', icon: 'more-horizontal', _id: 'savings' });
    }

    // --- SORTING LOGIC ---
    // 1. Extract Special Categories
    const milkCat = dashboardList.find(c => c.name === 'Milk');
    const miscCat = dashboardList.find(c => c.name === 'Miscellaneous');
    const savingsCat = dashboardList.find(c => c.name === 'Savings');

    // 2. Filter out special categories to get the general list
    let generalCats = dashboardList.filter(c =>
        c.name !== 'Milk' &&
        c.name !== 'Miscellaneous' &&
        c.name !== 'Savings'
    );

    // 3. Sort general categories Alphabetically (Case-Insensitive)
    generalCats.sort((a, b) => a.name.localeCompare(b.name));

    // 4. Reconstruct: [Milk] + [A-Z] + [Miscellaneous, Savings]
    // Use a fresh array to ensure exact order
    dashboardList = [];

    if (milkCat) dashboardList.push(milkCat);
    dashboardList.push(...generalCats);
    if (miscCat) dashboardList.push(miscCat);
    if (savingsCat) dashboardList.push(savingsCat);

    // Apply dashboard view classes NOW, just before rendering
    main.className = 'view-container dashboard-view';
    main.classList.remove('milk-view'); // Explicitly cleanup

    // RENDER IMMEDIATE UI (Categories + Loading State for Total)
    main.innerHTML = `
        <div class="category-grid">
            ${dashboardList.map(cat => `
                <div class="category-card" onclick="openCategory('${cat._id || cat.id}')">
                     <div class="card-menu-container">
                        <button class="card-menu-btn" onclick="toggleCardMenu(event, '${cat._id || cat.id}')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>
                        <div id="menu-${cat._id || cat.id}" class="card-dropdown-menu">
                            <button onclick="editCategory(event, '${cat._id || cat.id}', '${cat.name.replace(/'/g, "\\'")}')">Rename</button>
                            ${(cat.id !== 'miscellaneous' && cat.id !== 'savings' && !['Milk', 'EB Bill'].includes(cat.name)) ?
            `<button class="delete-option" onclick="handleDeleteCategory(event, '${cat._id || cat.id}')">Delete</button>` : ''}
                        </div>
                     </div>
                    <svg><use href="#icon-${cat.icon || 'more-horizontal'}"></use></svg>
                    <span>${cat.name}</span>
                </div>
            `).join('')}
            <div class="category-card add-card" onclick="promptAddCategory()">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add Category</span>
            </div>
        </div>

        <div class="stats-container">
            <div class="stat-card clickable-card" onclick="openModule('Spending Summary')">
                <h3>Total Monthly Spending</h3>
                <div class="value" id="dashboardTotalValue"><span style="font-size: 1rem; color: var(--text-muted);">Loading...</span></div>
                <div class="trend">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                    Current Month Status
                </div>
            </div>
        </div>
    `;

    // --- LAZY LOAD TOTAL ---
    // Now await the entries processing in the background
    try {
        const allEntries = await entriesPromise;
        const totalMonth = allEntries.reduce((sum, d) => sum + d.amount, 0);

        // Update UI if still in dashboard view
        // Safety check: element might be gone if user navigated away quickly
        const valueEl = document.getElementById('dashboardTotalValue');
        if (valueEl) {
            valueEl.innerText = `₹${totalMonth.toLocaleString()}`;
        }
    } catch (e) {
        console.error("Error updating dashboard total", e);
    }
}



async function openCategory(id, isBackgroundRefresh = false) {
    if (!isBackgroundRefresh) {
        STATE.view = 'subcategories';
        STATE.activeCategory = id;
        STATE.activeSubcategory = null;
    }

    // Standardize IDs for special categories
    if (id === 'miscellaneous') {
        const existing = STATE.categories.find(c => c.id === 'miscellaneous');
        if (!existing) {
            STATE.categories.push({ name: 'Miscellaneous', id: 'miscellaneous', _id: 'miscellaneous', icon: 'more-horizontal' });
        }
    }
    if (id === 'savings') {
        const existing = STATE.categories.find(c => c.id === 'savings' || c.name === 'Savings');
        if (!existing) {
            STATE.categories.push({ name: 'Savings', id: 'savings', _id: 'savings', icon: 'more-horizontal' });
        }
    }
    if (id === 'milk' || id === 'Milk') {
        const existing = STATE.categories.find(c => c.name === 'Milk' || c.id === 'milk');
        if (!existing) {
            STATE.categories.push({ name: 'Milk', id: 'milk', icon: 'truck', type: 'milk' });
        }
    }

    // id could be a name (for default categories) or _id (for custom)
    let cat = STATE.categories.find(c => c.id === id || c._id === id);
    if (!cat) {
        // Fetch specific category if not in state
        try {
            const categories = await fetchCategories();
            cat = categories.find(c => c.id === id || c._id === id);
            STATE.categories = categories;
        } catch (e) { console.error(e); }
    }

    if (!cat) return;

    // Unified Header Update
    let isMobile = window.innerWidth <= 768; // Use 'let' for flexibility
    HeaderManager.update({
        showBack: true,
        onBack: "renderDashboard()",
        hideMonthSelector: isMobile && !['Milk', 'Savings', 'Miscellaneous'].includes(cat.name) && cat.type !== 'milk'
    });

    // Fetch items/subcategories for this category
    const subs = await fetchCategories(cat.name);
    STATE.activeCategory = id;
    STATE.view = 'subcategories';


    const main = document.getElementById('mainContent');

    // SPECIAL CASE: If it's Milk, render directly to mainContent (Full Screen)
    if (cat.name === 'Milk' || cat.type === 'milk') {
        STATE.view = 'milkTracker'; // Set view for milk tracker
        const toolContainer = document.getElementById('categoryToolContainer') || main;
        // Clear main if we're rendering there
        if (toolContainer === main) {
            main.innerHTML = '<div id="categoryToolContainer"></div>';
            main.classList.remove('dashboard-view');
            main.classList.add('milk-view');
        }
        await renderMilkTracker(document.getElementById('categoryToolContainer'));
        return;
    }

    // Logic to auto-open module if no subcategories, BUT skip for Misc/Savings to view grid
    // Also skip if this is a background refresh to prevent re-opening modal
    const isLeaf = subs.length === 0 && cat.name !== 'Miscellaneous' && cat.name !== 'Savings';
    STATE.isLeaf = isLeaf;

    if (isLeaf && !isBackgroundRefresh) {
        STATE.isAutoOpened = true;
        openModule(cat.name, cat._id || cat.id);
        return;
    }

    // If not auto-opening, reset flag
    if (!isBackgroundRefresh) STATE.isAutoOpened = false;

    // Fetch Recent Expenses for this category (Grid view)
    let recentExpenses = [];
    try {
        const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
        // Add timestamp to prevent caching
        recentExpenses = await fetchAPI(`/api/entries?parentCategory=${encodeURIComponent(cat.name)}&month=${monthStr}&_t=${Date.now()}`);
    } catch (e) { console.error(e); }

    // Unified Header Update
    isMobile = window.innerWidth <= 768;
    HeaderManager.update({
        showBack: isMobile,
        onBack: 'renderDashboard',
        hideMonthSelector: isMobile && !['Milk', 'Savings', 'Miscellaneous'].includes(cat.name)
    });

    // Safety Net: Ensure Overlay is CLOSED when viewing a main category grid
    const overlay = document.getElementById('moduleOverlay');
    if (overlay && !isBackgroundRefresh) {
        overlay.classList.remove('active');
        overlay.classList.remove('drawer-mode');
        // Clear panel content to ensure no ID conflicts or ghost content
        const panel = document.getElementById('panelContent');
        if (panel) panel.innerHTML = '';
    }

    // Explicitly target the main tool container
    const toolContainer = document.getElementById('categoryToolContainer') || document.getElementById('mainContent');
    if (toolContainer) toolContainer.style.display = 'block';

    if (main) {
        main.classList.remove('dashboard-view');
        main.classList.remove('milk-view');
    }

    main.innerHTML = `
        <div class="category-overhaul-wrapper">
        <div class="overhaul-header" style="margin-bottom: 1rem;">
            <!-- Mobile Back Button (Far Left) -->
            <button class="icon-btn mobile-only" onclick="renderDashboard()" style="position: absolute; left: 0.5rem; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; z-index: 10; color: var(--primary) !important;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>

            <div class="overhaul-tabs-row">
                <div class="header-left-col">
                    <!-- Desktop Back Button -->
                    <button class="back-btn-v3 desktop-only" onclick="renderDashboard()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
                        Back
                    </button>
                </div>
                <div class="header-center-col">
                    <div style="height: 44px; display: flex; align-items: center; justify-content: center;">
                        <h2 class="category-title" style="margin: 0;">${cat.name}</h2>
                    </div>
                </div>
                <div class="header-right-col"></div>
            </div>
        </div>
        
        <div class="category-grid subcategory-grid">
            ${subs.map(sub => `
                <div class="category-card sub-card" onclick="openModule('${sub.name}', '${sub._id}')">
                    <div class="card-menu-container">
                        <button class="card-menu-btn" onclick="toggleCardMenu(event, '${sub._id}')">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                        </button>
                        <div id="menu-${sub._id}" class="card-dropdown-menu">
                            <button onclick="editCategory(event, '${sub._id}', '${sub.name.replace(/'/g, "\\'")}')">Rename</button>
                             ${(id === 'savings') ?
            `<button class="delete-option" onclick="handleDeleteCategory(event, '${sub._id}')">Delete</button>` :
            (id !== 'miscellaneous') ?
                `<button class="delete-option" onclick="handleDeleteSubcategory(event, '${id}', '${sub._id}', '${sub.name.replace(/'/g, "\\'")}')">Delete</button>` : ''}
                        </div>
                    </div>
                    <svg><use href="#icon-${getSubIconHelper(sub.name)}"></use></svg>
                    <span>${sub.name}</span>
                </div>
            `).join('')}
            <div class="category-card sub-card add-card" onclick="promptAddItem('${id}')">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span>Add Item</span>
            </div>
        </div>

        <div class="recent-expenses-container">
            <div class="recent-expenses-header">Recent Expenses in ${cat.name}</div>
            <div class="history-scroller">
                <div class="history-list">
                    ${recentExpenses.length > 0 ? recentExpenses.map(exp => `
                        <div class="history-item">
                            <div class="history-left">
                                <span class="history-date">${getRelativeDate(exp.date)}</span>
                                <div class="history-info">
                                    <span class="history-desc">${exp.itemName || exp.subCategory || 'New Entry'}</span>
                                    ${exp.notes ? `<span class="history-notes">${exp.notes}</span>` : ''}
                                </div>
                            </div>
                            <div class="history-right">
                                <span class="history-amount">₹${exp.amount.toLocaleString()}</span>
                                <button class="delete-btn" onclick="deleteCategoryEntry('${exp._id}', '${id}')">×</button>
                            </div>
                        </div>
                    `).join('') : `<p style="text-align: center; color: var(--text-muted); padding: 1.5rem 0;">No recent expenses in ${cat.name}.</p>`}
                </div>
            </div>
        </div>
        </div>
    `;
}


function openModule(subName, categoryId) {
    STATE.activeSubcategory = subName;

    // Default Modal/Overlay Mode (Always use for subcategories to avoid full-screen takeover)
    const overlay = document.getElementById('moduleOverlay');
    const panelTitle = document.getElementById('panelTitle');

    if (panelTitle) panelTitle.textContent = subName;
    if (overlay) overlay.classList.add('active');

    renderModuleContent(subName, categoryId, document.getElementById('panelContent'));
}


function closeModule(fallbackId) {
    const overlay = document.getElementById('moduleOverlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.classList.remove('drawer-mode');
        // Reset state
        STATE.activeSubcategory = null;

        // Force cleanup after transition
        setTimeout(() => {
            const panelContent = document.getElementById('panelContent');
            if (panelContent) panelContent.innerHTML = '';
            overlay.classList.remove('active'); // Redundant safety
        }, 300);
    }

    // Explicit fallback if provided (Robust navigation)
    if (fallbackId && fallbackId !== 'undefined' && fallbackId !== 'null') {
        openCategory(fallbackId);
        return;
    }

    // FIX: If we auto-opened a leaf category, closing it should go to dashboard
    if (STATE.isAutoOpened) {
        STATE.isAutoOpened = false;
        STATE.needsRefresh = false; // Fresh dashboard will have new totals
        renderDashboard();
        return;
    }

    // FIX: If we need refresh (e.g. added entry), reload current category if active
    if (STATE.needsRefresh && STATE.activeCategory) {
        STATE.needsRefresh = false;
        openCategory(STATE.activeCategory, true);
        return;
    }

    // Default: Return to Home (Dashboard)
    renderDashboard();
}

// --- THEME HANDLING ---
function toggleTheme() {
    const body = document.body;
    const isDark = body.classList.contains('dark-theme');
    const newTheme = isDark ? 'light-theme' : 'dark-theme';

    body.classList.remove('dark-theme', 'light-theme');
    body.classList.add(newTheme);

    // Save preference
    localStorage.setItem('PAPERLESS_THEME', newTheme);
    updateThemeIcon();
}

function updateThemeIcon() {
    const isDark = document.body.classList.contains('dark-theme');
    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');

    if (sunIcon && moonIcon) {
        if (isDark) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('PAPERLESS_THEME') || 'light-theme';
    document.body.classList.remove('dark-theme', 'light-theme');
    document.body.classList.add(savedTheme);
    updateThemeIcon();
}


async function renderModuleContent(subName, categoryId, container, customBackAction = null) {
    // Default back action
    const onBack = customBackAction || 'closeModule()';
    if (!container) {
        // Default to overlay if no container provided
        container = document.getElementById('panelContent');
        const overlay = document.getElementById('moduleOverlay');
        if (overlay) overlay.classList.add('active');
    }
    if (!container) return;

    // Reset wide view by default
    container.classList.remove('wide-view');
    const overlay = document.getElementById('moduleOverlay');
    if (overlay) overlay.classList.remove('drawer-mode');

    if (subName === 'Milk') {
        await renderMilkTracker(container);
    } else if (subName === 'EB Bill') {
        await renderEBBillForm(container, categoryId);
    } else if (subName === 'Spending Summary') {
        await renderSpendingSummary(container);
        // Check if Savings or Misc is the *Subcategory* being opened directly (rare but possible via shortcut)
        // Usually they are parents. If opened as a subname that equals parent name:
        if (subName === 'Miscellaneous') {
            await renderSubcategoryView(container, subName); // View list of items
        } else if (subName === 'Savings') {
            await renderSubcategoryView(container, subName);
        }
    } else {
        // Check if parent is Savings to use Savings Form
        const cat = STATE.categories.find(c => c._id === categoryId);
        if (cat && cat.parentCategory === 'Savings') {
            await renderSavingsForm(container, subName, categoryId);
        } else {
            const isMisc = cat && cat.parentCategory === 'Miscellaneous';
            // Only Miscellaneous needs to return to its category list. Others return to Dashboard (Home).
            // FIX: Pass the PARENT category name ('Miscellaneous') to avoid recursively opening the item itself.
            const backAction = isMisc ? `closeModule('Miscellaneous')` : 'closeModule()';
            await renderGenericForm(container, subName, categoryId, backAction, isMisc);
        }
    }
}


async function renderSpendingSummary(container) {
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    let grandTotal = 0;
    let allEntries = [];
    let categoryTotals = [];

    try {
        // Optimization: Use the new all-entries endpoint to fetch everything for the given month
        allEntries = await fetchAPI(`/api/entries?month=${monthStr}`);

        // Sort for the history view
        allEntries.sort((a, b) => new Date(a.date) - new Date(b.date));

        console.log("Debug: Spending Summary Entries", allEntries);
        grandTotal = allEntries.reduce((sum, e) => sum + e.amount, 0);

        // Calculate totals per parent category (dynamically)
        const categoriesMap = {};
        allEntries.forEach(e => {
            // Find parent name optimally
            const cat = STATE.categories.find(c => c._id === e.categoryId || c.id === e.categoryId);
            const parent = e.parentCategory || (cat ? cat.parentCategory || cat.name : 'Other');

            categoriesMap[parent] = (categoriesMap[parent] || 0) + e.amount;
            // Inject names for the transaction row display
            e.categoryName = parent;
        });

        categoryTotals = Object.entries(categoriesMap).map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);

    } catch (e) { console.error(e); }

    const overlay = document.getElementById('moduleOverlay');
    if (overlay) overlay.classList.add('drawer-mode');

    container.innerHTML = `
        <div class="spending-summary-panel">
            <div class="ss-header">
                <button class="close-circle" onclick="closeModule()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <h3 class="ss-title">Monthly Summary</h3>
                <div></div> <!-- Grid Spacer -->
            </div>


            <div class="ss-scroll-content">
                <div class="ss-total-box">
                    <span class="ss-total-label">TOTAL BUDGET SPENT</span>
                    <span class="ss-total-amount">₹${grandTotal.toLocaleString()}</span>
                </div>



                <div class="ss-history-section">
                    <h3 class="ss-section-title">Detailed Transaction History</h3>
                    <div class="ss-history-box">
                        ${allEntries.length > 0 ? allEntries.map(e => {
        const dateObj = new Date(e.date);
        const day = dateObj.getDate();
        const month = dateObj.toLocaleDateString('en-GB', { month: 'short' }).toUpperCase();
        return `
                                <div class="ss-history-row" style="cursor: pointer;" onclick="handleSummaryClick('${(e.categoryName || '').replace(/'/g, "\\'")}', '${e.categoryId}', '${(e.itemName || '').replace(/'/g, "\\'")}')">
                                    <div class="ss-date-pill">
                                        <span class="d">${day}</span>
                                        <span class="m">${month}</span>
                                    </div>
                                    <span class="ss-item-name">${e.itemName || e.notes || 'Expense'}</span>
                                    <span class="ss-item-amount">₹${e.amount.toLocaleString()}</span>
                                </div>
                            `;
    }).join('') : '<p style="text-align: center; color: var(--text-muted); padding: 1rem;">No transactions.</p>'}
                    </div>
                </div>
            </div>

            <!-- Sticky Footer with Export Action -->
            <div class="ss-footer">
                <button class="ss-export-hero-btn" onclick="exportToPDF()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Export Monthly Report
                </button>
            </div>
        </div>
    </div>
`;

}

function handleSummaryClick(parentName, categoryId, itemName) {
    if (parentName === 'Savings' || parentName === 'Miscellaneous' || parentName === 'Milk' || itemName === 'Milk') {
        const overlay = document.getElementById('moduleOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.classList.remove('drawer-mode');
        }

        STATE.activeSubcategory = null;

        // Resolve targetId robustly
        let targetId = categoryId;
        if (parentName === 'Savings') targetId = 'savings';
        else if (parentName === 'Miscellaneous') targetId = 'miscellaneous';
        else if (parentName === 'Milk' || itemName === 'Milk' || parentName === 'milk' || itemName === 'milk') {
            targetId = 'milk';
        }

        // Use a slightly longer delay and ensure drawer mode is removed for clean transition
        setTimeout(() => {
            const overlay = document.getElementById('moduleOverlay');
            if (overlay) overlay.classList.remove('drawer-mode');
            openCategory(targetId);
        }, 250); // 250ms delay for smoothness
    } else {
        const overlay = document.getElementById('moduleOverlay');
        if (overlay) overlay.classList.remove('drawer-mode');
        openModule(itemName || parentName, categoryId);
    }
}



async function renderEBBillForm(container, categoryId, customBackAction = null) {
    const onBack = customBackAction || 'closeModule()';
    // Unified Header Update
    HeaderManager.update({
        showBack: true,
        onBack: onBack,
        hideMonthSelector: true
    });

    const customFieldsHTML = `
        <div class="form-group">
            <label>Units Consumed (Optional)</label>
            <input type="number" id="ebUnits" placeholder="e.g. 150">
        </div>
    `;

    container.innerHTML = getUniversalFormHTML({
        title: 'EB Bill Entry',
        onBack: onBack,
        itemNameLabel: 'Item Name',
        itemNameValue: 'EB Bill',
        customFieldsHTML,
        historyContainerId: 'ebHistory',
        showItemName: false
    });

    renderSubcategoryHistory(document.getElementById('ebHistory'), 'EB Bill', categoryId);

    setupUniversalForm(async (entry) => {
        const units = document.getElementById('ebUnits').value;

        entry.categoryId = categoryId;
        entry.itemName = 'EB Bill';
        entry.notes = (entry.notes || '') +
            (units ? ` | Units: ${units}` : '');

        const success = await addEntry(entry);
        if (success) {
            renderEBBillForm(container, categoryId);
        }
    });
}


async function renderGenericForm(container, subName, categoryId, customBackAction = null, hideHistory = false) {
    const onBack = customBackAction || 'closeModule()';
    // Unified Header Update
    HeaderManager.update({
        showBack: true,
        onBack: onBack,
        // FIX: Show month selector if we are in Miscellaneous or if explicitly allowed
        hideMonthSelector: (STATE.activeCategory !== 'Miscellaneous' && STATE.activeCategory !== 'miscellaneous') && (categoryId !== 'misc' && categoryId !== 'miscellaneous')
    });

    const isDescriptive = subName === 'Small Spends' || subName === 'General Expense' || subName === 'Medical' || subName === 'Newspaper';

    // Check for mandatory exceptions (Goldchit, Lic)
    // User requested "for all categories make it as optional"
    const isMandatory = false;

    let customFieldsHTML = '';
    if (subName === 'Medical') {
        customFieldsHTML = `
            <div class="form-group">
                <label>Hospital / Doctor (Optional)</label>
                <input type="text" id="medHospital" placeholder="e.g. City Hospital">
            </div>
        `;
    }

    container.innerHTML = getUniversalFormHTML({
        title: `${subName} Entry`,
        onBack: onBack,
        itemNameLabel: isDescriptive ? 'Description' : 'Item Name',
        itemNamePlaceholder: isDescriptive ? 'What was this for?' : 'e.g. Bread, Car service',
        customFieldsHTML,
        historyContainerId: hideHistory ? null : 'genHistory',
        historyHeader: `Recent Expenses in ${subName}`,
        isItemNameMandatory: false // Force optional globally
    });

    if (!hideHistory) {
        renderSubcategoryHistory(document.getElementById('genHistory'), subName, categoryId);
    }

    setupUniversalForm(async (entry) => {
        // Enforce manual check removed - description is optional

        entry.categoryId = categoryId;
        if (!entry.itemName) entry.itemName = subName;

        // FIX: Add parentCategory so it appears in History Lists
        const cat = STATE.categories.find(c => c._id === categoryId || c.id === categoryId);
        if (cat) {
            entry.parentCategory = cat.parentCategory || cat.name;
        }

        if (subName === 'Medical') {
            const hosp = document.getElementById('medHospital').value;
            if (hosp) entry.notes = (entry.notes ? entry.notes + ' ' : '') + `(Hosp: ${hosp})`;
        }



        const success = await addEntry(entry);
        if (success) {
            // Small delay to ensure DB sync and forced fresh fetch
            setTimeout(() => {
                renderGenericForm(container, subName, categoryId, onBack, hideHistory);
            }, 200);
        }
    });
}


async function renderSubcategoryHistory(container, subName, categoryId) {
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    let history = [];
    try {
        history = await fetchAPI(`/api/entries?categoryId=${categoryId}&month=${monthStr}&_t=${Date.now()}`);
        // Sort by Date Ascending
        history.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) { console.error(e); }

    // Always clear and rebuild, but keep header if it was outside?
    // Actually getUniversalFormHTML puts the header INSIDE historyContainerId.

    if (history.length === 0) {
        container.innerHTML = `
            <div class="history-empty-state">
                <p>No entries for this month.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="history-scroller">
            <div class="history-list">
                ${history.map(h => `
                    <div class="history-item">
                        <div class="history-left">
                            <span class="history-date">${new Date(h.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                            <div class="history-info">
                                <span class="history-desc">${h.itemName || subName}</span>
                                ${h.notes ? `<span class="history-notes">${h.notes}</span>` : ''}
                            </div>
                        </div>
                        <div class="history-right">
                            <span class="history-amount">₹${h.amount.toLocaleString()}</span>
                            <button class="delete-btn" onclick="deleteEntry('${h._id}', '${subName}', '${categoryId}')">×</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}


async function deleteEntry(id, subName, categoryId) {
    const confirmed = await showConfirm('Do you want to delete this?');
    if (confirmed) {
        try {
            await fetchAPI(`/api/entries/${id}`, { method: 'DELETE' });
            showToast('Deleted successfully', 'success');
            // Refresh current view
            const overlay = document.getElementById('moduleOverlay');
            const isOverlay = overlay && overlay.classList.contains('active');
            const container = isOverlay ? document.getElementById('panelContent') : document.getElementById('categoryToolContainer');

            if (!container) return; // Refresh logic depends on container presence

            // Determine context for Back action
            let contextBack = 'closeModule()';
            if (STATE.activeCategory === 'miscellaneous' || STATE.activeCategory === 'savings') {
                contextBack = `openCategory('${STATE.activeCategory}')`;
            }

            if (subName === 'Milk') {
                renderMilkTracker(container);
            } else if (subName === 'EB Bill') {
                renderEBBillForm(container, categoryId, contextBack);
            } else {
                // Generic Form for others
                renderGenericForm(container, subName, categoryId, contextBack);
            }
        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
}


async function deleteCategoryEntry(id, categoryId) {
    const confirmed = await showConfirm('Do you want to delete this?');
    if (confirmed) {
        try {
            await fetchAPI(`/api/entries/${id}`, { method: 'DELETE' });
            showToast('Deleted successfully', 'success');
            openCategory(categoryId);
        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
}



async function renderMilkTracker(container, searchRange = null, page = 1) {
    STATE.view = 'milk';
    if (!STATE.milkSubView) STATE.milkSubView = 'calendar';
    STATE.currentMilkPage = page;


    // Unified Header Update (Inject Tabs and Month into App Header)
    const targetId = container && (container.id || (container.closest('#panelContent') ? 'panelContent' : 'categoryToolContainer'));
    const isOverlay = targetId === 'panelContent';

    // Unified Header Update (Inject Tabs and Month into App Header only if NOT in overlay)
    // Unified Header Update
    if (!isOverlay) {
        const isMobile = window.innerWidth <= 768;
        HeaderManager.update({
            showBack: isMobile, // Only show header back button on mobile
            onBack: "STATE.view='dashboard'; renderDashboard();",
            hideMonthSelector: true,
            subContentHTML: null,
            navRowHTML: null
        });
    }

    let milkDataArr = [];
    let milkStats = { totalLitres: 0, totalAmount: 0, averageSpend: 0, maxSpend: 0, minSpend: Infinity };

    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;

    try {
        let url = `/api/entries?type=milk`;
        if (searchRange) {
            url += `&start=${searchRange.from}&end=${searchRange.to}`;
        } else {
            url += `&month=${monthStr}`;
        }

        const res = await fetchAPI(url);
        if (res && res.entries) {
            milkDataArr = res.entries;
            STATE.milkCategoryId = res.categoryId;
            milkStats = {
                totalLitres: res.totalLitres || 0,
                totalAmount: res.totalAmount || 0,
                averageSpend: res.averageSpend || 0,
                maxSpend: milkDataArr.length > 0 ? Math.max(...milkDataArr.map(d => d.amount)) : 0,
                minSpend: milkDataArr.length > 0 ? Math.min(...milkDataArr.map(d => d.amount)) : 0
            };
            STATE.tempMilkData = milkDataArr;
        }
    } catch (e) {
        console.error("Milk Fetch Error:", e);
        // Ensure at least the UI structure renders
    }

    if (!container) {
        console.error("Milk Tracker: Target container not found!");
        return;
    }

    // --- SEARCH PAGINATION LOGIC ---
    let paginatedDates = [];
    let totalPages = 1;
    let searchRangeStr = 'null';

    if (searchRange && searchRange.from && searchRange.to) {
        const startDate = new Date(searchRange.from);
        const endDate = new Date(searchRange.to);
        const allDates = [];

        // Generate all dates in range
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            allDates.push(new Date(d));
        }

        const pageSize = 28; // 4 weeks roughly
        totalPages = Math.ceil(allDates.length / pageSize);

        // Ensure page is within bounds
        if (page < 1) page = 1;
        if (page > totalPages) page = totalPages;

        const startIndex = (page - 1) * pageSize;
        paginatedDates = allDates.slice(startIndex, startIndex + pageSize);
        searchRangeStr = JSON.stringify(searchRange).replace(/"/g, "&quot;");
    }


    container.innerHTML = `
        ${isOverlay ? `
        <div class="panel-header">
            <button class="close-circle" onclick="closeModule()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <h3>Milk Tracker</h3>
            <div></div> <!-- Grid Spacer -->
        </div>
        ` : ''}
        <div class="${isOverlay ? 'panel-body' : ''}">
            <div class="category-overhaul-wrapper">

            <div class="overhaul-header" style="${window.innerWidth <= 768 ? 'margin-bottom: 0.5rem;' : ''}">
                <div class="overhaul-tabs-row">
                    <div class="header-left-col" style="display: flex; justify-content: flex-start; min-width: 44px;">
                        <!-- Desktop Back Button -->
                        <button class="back-btn-v3 desktop-only" onclick="renderDashboard()">
                             <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
                             Back
                        </button>
                        <!-- Mobile Back Button (In Flow) -->
                         <button class="icon-btn mobile-only" onclick="renderDashboard()" style="color: var(--primary) !important; padding: 0;">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
                        </button>
                    </div>

                    <div class="header-center-col" style="flex: 1;">
                        <div class="tab-group v3">
                            <button class="tab-btn ${STATE.milkSubView === 'calendar' ? 'active' : ''}" onclick="STATE.milkSubView='calendar'; renderMilkTracker(document.getElementById('${targetId}'))">
                                <svg class="desktop-only" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                Calendar
                            </button>
                            <button class="tab-btn ${STATE.milkSubView === 'analysis' ? 'active' : ''}" onclick="STATE.milkSubView='analysis'; renderMilkTracker(document.getElementById('${targetId}'))">
                                <svg class="desktop-only" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                                Analysis
                            </button>
                        </div>
                    </div>

                    <div class="header-right-col" style="min-width: 44px;"></div>
                </div>
            </div>

            <div class="overhaul-main-card">
                <div class="overhaul-top-nav" style="${STATE.milkSubView === 'analysis' ? 'display: none;' : ''}">
                    <!-- Month Selector (Left) -->
                    <div class="milk-month-pill">
                        <button class="milk-nav-arrow" onclick="navMonth(-1)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                        </button>
                        <span class="milk-month-label">${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}</span>
                        <button class="milk-nav-arrow" onclick="navMonth(1)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                        </button>
                    </div>

                    <!-- Horizontal Search Form (Right) -->
                    <div class="milk-search-horizontal">
                        <div class="search-item">
                            <span class="label">From</span>
                            <input type="date" id="searchFrom" class="search-input" value="${searchRange?.from || ''}">
                        </div>
                        <div class="search-item">
                            <span class="label">To</span>
                            <input type="date" id="searchTo" class="search-input" value="${searchRange?.to || ''}">
                        </div>
                        <div class="search-actions">
                            <button class="search-btn apply" onclick="handleMilkSearch('${targetId}')">Apply</button>
                            <button class="search-btn clear" onclick="renderMilkTracker(document.getElementById('${targetId}'))">Clear</button>
                        </div>
                    </div>
                </div>

                <div class="overhaul-grid">
                    ${STATE.milkSubView === 'calendar' ? `
                        <div class="calendar-column v3">
                            <div class="milk-calendar-grid v3">
                                ${!searchRange ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => `<div class="day-header mobile-hide">${d}</div>`).join('') : ''}
                                ${!searchRange ? Array(new Date(STATE.selectedYear, STATE.selectedMonth, 1).getDay()).fill('').map(() => `<div class="milk-grid-spacer mobile-hide"></div>`).join('') : ''}
                                
                                ${searchRange ?
                paginatedDates.map(d => {
                    const dayData = milkDataArr.find(entry => new Date(entry.date).toDateString() === d.toDateString());
                    return renderDayCard(dayData, true, d.getDate(), d);
                }).join('') :
                Array.from({ length: new Date(STATE.selectedYear, STATE.selectedMonth + 1, 0).getDate() }, (_, i) => {
                    const day = i + 1;
                    const dayData = milkDataArr.find(entry => new Date(entry.date).getDate() === day);
                    return renderDayCard(dayData, false, day);
                }).join('')
            }
                            </div>
                            ${searchRange && totalPages > 1 ? `
                                <div class="pagination-footer">
                                    <button class="page-btn" ${page === 1 ? 'disabled' : ''} onclick="renderMilkTracker(document.getElementById('${targetId}'), ${searchRangeStr}, ${page - 1})">&lt;</button>
                                    ${Array.from({ length: totalPages }).map((_, i) => `
                                        <button class="page-btn ${i + 1 === page ? 'active' : ''}" onclick="renderMilkTracker(document.getElementById('${targetId}'), ${searchRangeStr}, ${i + 1})">${i + 1}</button>
                                    `).join('')}
                                    <button class="page-btn" ${page === totalPages ? 'disabled' : ''} onclick="renderMilkTracker(document.getElementById('${targetId}'), ${searchRangeStr}, ${page + 1})">&gt;</button>
                                </div>
                            ` : ''}
                        </div>
                    ` : `
                        <div class="analysis-column v3">
                            <div class="analysis-header">
                                <h2>Yearly Overview</h2>
                                <div class="custom-dropdown" id="yearSelectDropdown">
                                    <div class="dropdown-selected" onclick="toggleYearDropdown(event)">${STATE.selectedYear} <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-left: 8px;"><path d="m6 9 6 6 6-6"/></svg></div>
                                    <div class="dropdown-options">
                                        ${[2023, 2024, 2025, 2026].map(y => `
                                            <div class="dropdown-option ${y === STATE.selectedYear ? 'selected' : ''}" onclick="selectYear(${y})">${y}</div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                            
                            <div class="chart-card-outer">
                                <div class="chart-card-header">
                                    <h4>Monthly Spending</h4>
                                </div>
                                <div class="yearly-chart-area">
                                    <canvas id="milkAnalysisChart"></canvas>
                                </div>
                                <div class="yearly-stats-summary">
                                    <div class="y-stat">
                                        <span class="l">TOTAL SPENT</span>
                                        <span class="v" id="yTotalSpent">₹0</span>
                                    </div>
                                    <div class="y-stat">
                                        <span class="l">TOTAL LITRES</span>
                                        <span class="v" id="yTotalLitres">0.0 L</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `}

                    <div class="summary-column v3">
                        <div class="summary-inner">
                            <h2 class="summary-title">${searchRange ? 'Search Summary' : 'Monthly Summary'}</h2>
                            <div class="grand-total-display v3">
                                <span class="currency">₹</span>
                                <span class="amount">${milkStats.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <p class="last-month-compare">Last month: ₹0.00</p>

                            <div class="stats-boxes-grid">
                                <div class="stat-box-large">
                                    <div class="icon-circle">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path></svg>
                                    </div>
                                    <div class="box-info">
                                        <span class="box-label">TOTAL LITRES</span>
                                        <span class="box-value">${milkStats.totalLitres.toFixed(1)} L</span>
                                    </div>
                                </div>
                            </div>

                            <div class="stats-list-v3">
                                <div class="stat-row v3">
                                    <span>Most expensive:</span>
                                    <span class="val">₹${milkStats.maxSpend.toFixed(2)}</span>
                                </div>
                                <div class="stat-row v3">
                                    <span>Least expensive:</span>
                                    <span class="val">₹${(milkStats.minSpend === Infinity ? 0 : milkStats.minSpend).toFixed(2)}</span>
                                </div>
                            </div>

                            <button class="export-pdf-btn overhaul" onclick="exportToPDF()">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                                Export PDF
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            </div>
        </div>
    `;

    function renderDayCard(dayData, isSearchMode, dayNumber = null, specificDate = null) {
        const d = dayData ? new Date(dayData.date) : (specificDate || new Date(STATE.selectedYear, STATE.selectedMonth, dayNumber));
        const day = d.getDate();
        const dayHeaderStr = `${String(day).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}`;
        const today = new Date();
        const isToday = today.getDate() === day && today.getMonth() === d.getMonth() && today.getFullYear() === d.getFullYear();

        // Fixed onclick to always use the full date info
        const dateParam = `${d.getFullYear()}-${d.getMonth()}-${day}`;
        const clickAction = `openMilkFormByDate('${dateParam}', '${dayData?._id || ''}')`;

        return `
            <div class="day-card overhaul ${dayData ? 'has-data' : ''} ${isToday ? 'is-today' : ''}" onclick="${clickAction}">
                <div class="day-header-v4">
                    <span class="full-date">${String(day).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}</span>
                    <span class="day-name">${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}</span>
                </div>
                <div class="day-body-v4">
                    ${dayData ? `
                        <div class="data-view">
                            <span class="day-amount">₹${dayData.amount}</span>
                            <span class="day-qty">${(dayData.quantity || 0).toFixed(1)}L</span>
                        </div>
                    ` : `
                        <div class="add-view-v4">
                            <div class="add-icon-circle">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </div>
                            <span class="add-text">Add</span>
                        </div>
                    `}
                </div>
            </div>
        `;
    }

    // --- Fetch and Render Yearly Stats if Analysis View ---
    if (STATE.milkSubView === 'analysis') {
        try {
            // Fetch ALL entries for the selected year
            const startYear = `${STATE.selectedYear}-01-01`;
            const endYear = `${STATE.selectedYear}-12-31`;
            const res = await fetchAPI(`/api/entries?type=milk&start=${startYear}&end=${endYear}`);
            const yearEntries = res.entries || [];

            // Aggregate by month
            const monthStats = Array(12).fill(0).map(() => ({ amount: 0, litres: 0 }));
            yearEntries.forEach(e => {
                const date = new Date(e.date);
                const mIndex = date.getMonth();
                monthStats[mIndex].amount += e.amount;
                monthStats[mIndex].litres += (e.quantity || 0);
            });

            const yearlyTotalAmount = monthStats.reduce((sum, m) => sum + m.amount, 0);
            const yearlyTotalLitres = monthStats.reduce((sum, m) => sum + m.litres, 0);
            const maxMonthlyAmount = Math.max(...monthStats.map(m => m.amount));

            // Render Chart.js
            const chartArea = document.querySelector('.yearly-chart-area');
            const ctx = document.getElementById('milkAnalysisChart');

            if (typeof Chart === 'undefined') {
                if (chartArea) chartArea.innerHTML = '<div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--text-muted);">Chart.js not loaded</div>';
                console.error("Chart.js is not loaded.");
            } else if (ctx) {
                if (STATE.milkChart) STATE.milkChart.destroy();

                const isDark = document.body.classList.contains('dark-theme');
                const textColor = isDark ? '#94a3b8' : '#64748b';
                const gridColor = isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

                STATE.milkChart = new Chart(ctx, {
                    type: 'bar',
                    data: {
                        labels: MONTHS.map(m => m.substring(0, 3)),
                        datasets: [{
                            label: 'Monthly Spend (₹)',
                            data: monthStats.map(m => m.amount),
                            backgroundColor: '#6366f1',
                            borderRadius: 6,
                            barThickness: 'flex',
                            maxBarThickness: 30,
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: { duration: 1000, easing: 'easeOutQuart' },
                        plugins: {
                            legend: {
                                position: 'top',
                                align: 'end',
                                labels: {
                                    boxWidth: 15,
                                    boxHeight: 15,
                                    padding: 20,
                                    font: { family: 'Outfit', size: 12, weight: 600 },
                                    color: textColor
                                }
                            },
                            tooltip: {
                                backgroundColor: isDark ? '#1e293b' : '#ffffff',
                                titleColor: isDark ? '#f1f5f9' : '#1e293b',
                                bodyColor: isDark ? '#f1f5f9' : '#1e293b',
                                borderColor: gridColor,
                                borderWidth: 1,
                                padding: 12,
                                boxPadding: 6,
                                callbacks: {
                                    label: (context) => ` Spend: ₹${context.raw.toLocaleString()}`
                                }
                            }
                        },
                        scales: {
                            y: {
                                beginAtZero: true,
                                suggestedMax: 500,
                                grid: { color: gridColor, drawBorder: false },
                                border: { display: false },
                                ticks: {
                                    color: textColor,
                                    padding: 10,
                                    callback: function (value) { return '₹' + value; }
                                }
                            },
                            x: {
                                grid: { display: false, drawBorder: false },
                                border: { display: false },
                                ticks: {
                                    color: textColor,
                                    padding: 10
                                }
                            }
                        }
                    }
                });
            }

            // Update Stats
            document.getElementById('yTotalSpent').textContent = `₹${yearlyTotalAmount.toLocaleString()}`;
            document.getElementById('yTotalLitres').textContent = `${yearlyTotalLitres.toFixed(1)}L`;
            const activeMonths = monthStats.filter(m => m.amount > 0).length;

        } catch (e) { console.error("Error fetching yearly stats:", e); }
    }
}


async function handleMilkSearch(targetId) {
    console.log("handleMilkSearch triggered. TargetId:", targetId);

    // 1. Get Inputs
    const fromInput = document.getElementById('searchFrom');
    const toInput = document.getElementById('searchTo');

    if (!fromInput || !toInput) {
        console.error("Search inputs not found in DOM");
        showToast("Error: Search inputs missing", "error");
        return;
    }

    const from = fromInput.value;
    const to = toInput.value;
    console.log("Search Dates:", from, to);

    // 2. Validation
    if (!from || !to) {
        showToast("Please select both From and To dates", "warning");
        return;
    }

    if (new Date(from) > new Date(to)) {
        showToast("From date cannot be after To date", "error");
        return;
    }

    // 3. Find Container
    let container = null;
    if (targetId && typeof targetId === 'string' && document.getElementById(targetId)) {
        container = document.getElementById(targetId);
    }

    // Fallback detection
    if (!container) {
        console.warn("TargetID container not found, trying automatic detection...");
        const overlay = document.getElementById('moduleOverlay');
        const activeModal = document.querySelector('.milk-overhaul-wrapper');

        if (overlay && overlay.classList.contains('active')) {
            container = document.getElementById('panelContent');
        } else if (activeModal) {
            // Try to find the parent container of the wrapper
            container = activeModal.closest('#panelContent') || activeModal.closest('#categoryToolContainer') || activeModal.parentNode;
        } else {
            container = document.getElementById('categoryToolContainer');
        }
    }

    if (!container) {
        console.error("CRITICAL: Container not found for rendering.");
        showToast("System Error: Use refresh", "error");
        return;
    }

    // 4. Render
    try {
        console.log("Rendering Milk Tracker with search:", { from, to });
        await renderMilkTracker(container, { from, to });
        console.log("Render call completed.");
    } catch (e) {
        console.error("Render failure:", e);
        showToast("Search failed to render", "error");
    }
}

function shiftMonth(delta, containerId) {
    STATE.selectedMonth += delta;
    if (STATE.selectedMonth > 11) {
        STATE.selectedMonth = 0;
        STATE.selectedYear++;
    } else if (STATE.selectedMonth < 0) {
        STATE.selectedMonth = 11;
        STATE.selectedYear--;
    }

    closeMonthPicker();

    const container = document.getElementById(containerId);
    if (container) renderMilkTracker(container);
}



// Helper to open form by explicit date (prevents issues with selectedMonth/Year during search)
function openMilkFormByDate(dateStr, existingId) {
    const [y, m, d] = dateStr.split('-').map(Number);
    // Temporary set state for modal context
    const oldM = STATE.selectedMonth;
    const oldY = STATE.selectedYear;
    STATE.selectedMonth = m;
    STATE.selectedYear = y;

    openMilkForm(d, existingId, () => {
        STATE.selectedMonth = oldM;
        STATE.selectedYear = oldY;
    });
}

function openMilkForm(day, existingId, onClose = null) {
    const overlay = document.getElementById('moduleOverlay');
    const container = document.getElementById('panelContent');
    const existing = STATE.tempMilkData.find(d => d._id === existingId);

    const d = new Date(STATE.selectedYear, STATE.selectedMonth, day);
    const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    const dateStr = `${String(day).padStart(2, '0')}-${String(STATE.selectedMonth + 1).padStart(2, '0')}-${STATE.selectedYear}`;

    // Default values
    const mQty = existing?.morningLitres || 0;
    const nQty = existing?.nightLitres || 0;
    const price = existing?.pricePerLitre || 48; // Default to 48 if not set
    const notes = existing?.notes || '';

    overlay.classList.add('active');

    container.innerHTML = `
        <div class="milk-modal-header">
            <h3>${dateStr} — ${weekday}</h3>
        </div>
        <div class="panel-body milk-modal-body">
            <div class="milk-entry-v4">
                <div class="milk-body-v4">
                    <div class="milk-field-group full">
                        <label>
                            <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path><line x1="7" y1="7" x2="7.01" y2="7"></line></svg>
                            Price / L (₹)
                        </label>
                        <input type="number" id="milkPrice" value="${price}" step="0.5">
                    </div>
                    
                    <div class="milk-field-group row">
                        <div class="milk-input-col">
                            <label>
                                <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
                                Morning (L)
                            </label>
                            <input type="number" id="milkMorning" value="${mQty}" step="0.1">
                        </div>
                        <div class="milk-cost-col" id="morningCost">₹0.00</div>
                    </div>

                    <div class="milk-field-group row">
                        <div class="milk-input-col">
                            <label>
                                <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
                                Night (L)
                            </label>
                            <input type="number" id="milkNight" value="${nQty}" step="0.1">
                        </div>
                        <div class="milk-cost-col" id="nightCost">₹0.00</div>
                    </div>

                    <div class="milk-field-group full">
                        <label>
                            <svg class="field-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                            Notes (Max 50 words)
                        </label>
                        <input type="text" id="milkNotes" value="${notes}" placeholder="Notes..." oninput="this.value = this.value.split(/\s+/).slice(0, 50).join(' ')">
                    </div>
                </div>

                <div class="milk-total-section-v4">
                    <span class="total-label">Total</span>
                    <span class="total-amount" id="milkTotalDisplay">₹0.00</span>
                </div>

                <div class="milk-modal-footer">
                    <button class="footer-btn clear-text" id="milkClearBtn">Clear</button>
                    <div class="right-btns">
                        <button class="footer-btn action-btn secondary" id="milkCancelBtn">Cancel</button>
                        <button class="footer-btn action-btn primary" id="milkSaveBtn">Save</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Calculation Logic
    const priceInp = document.getElementById('milkPrice');
    const mornInp = document.getElementById('milkMorning');
    const nightInp = document.getElementById('milkNight');
    const mornCost = document.getElementById('morningCost');
    const nightCost = document.getElementById('nightCost');
    const totalDisp = document.getElementById('milkTotalDisplay');

    function updateCalculations() {
        const p = parseFloat(priceInp.value || 0);
        const m = parseFloat(mornInp.value || 0);
        const n = parseFloat(nightInp.value || 0);

        mornCost.textContent = `₹${(p * m).toFixed(2)}`;
        nightCost.textContent = `₹${(p * n).toFixed(2)}`;
        totalDisp.textContent = `₹${(p * (m + n)).toFixed(2)}`;
    }

    priceInp.oninput = updateCalculations;
    mornInp.oninput = updateCalculations;
    nightInp.oninput = updateCalculations;


    document.getElementById('milkClearBtn').onclick = async () => {
        if (existingId) {
            const confirmed = await showConfirm("Do you want to delete this?");
            if (confirmed) {
                try {
                    await fetchAPI(`/api/entries/${existingId}`, { method: 'DELETE' });
                    showToast('Entry cleared', 'success');

                    // Manually close overlay to prevent global state reset
                    const overlay = document.getElementById('moduleOverlay');
                    if (overlay) {
                        overlay.classList.remove('active');
                        overlay.classList.remove('drawer-mode');
                        setTimeout(() => {
                            const panelContent = document.getElementById('panelContent');
                            if (panelContent) panelContent.innerHTML = '';
                        }, 300);
                    }

                    renderMilkTracker(document.getElementById('categoryToolContainer'));
                    if (onClose) onClose();
                } catch (e) {
                    showToast('Failed to clear entry: ' + e.message, 'error');
                }
            }
        } else {
            mornInp.value = 0;
            nightInp.value = 0;
            document.getElementById('milkNotes').value = '';
            updateCalculations();
        }
    };

    document.getElementById('milkCancelBtn').onclick = () => {
        // Manually close overlay to prevent global state reset
        const overlay = document.getElementById('moduleOverlay');
        if (overlay) {
            overlay.classList.remove('active');
            overlay.classList.remove('drawer-mode');
            setTimeout(() => {
                const panelContent = document.getElementById('panelContent');
                if (panelContent) panelContent.innerHTML = '';
            }, 300);
        }
        if (onClose) onClose();
    };

    // Initial calculation
    updateCalculations();

    document.getElementById('milkSaveBtn').onclick = async () => {
        const p = parseFloat(priceInp.value || 0);
        const m = parseFloat(mornInp.value || 0);
        const n = parseFloat(nightInp.value || 0);
        const total = p * (m + n);

        const entry = {
            categoryId: STATE.milkCategoryId,
            amount: total,
            date: `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
            itemName: 'Milk',
            morningLitres: m,
            nightLitres: n,
            pricePerLitre: p,
            notes: document.getElementById('milkNotes').value,
            quantity: m + n // Total quantity for summary
        };

        try {
            if (existingId) {
                await fetchAPI(`/api/entries/${existingId}`, { method: 'PUT', body: JSON.stringify(entry) });
                showToast('Updated Successfully', 'success');
            } else {
                await addEntry(entry);
            }
            // Manually close overlay to prevent global state reset/redirect
            const overlay = document.getElementById('moduleOverlay');
            if (overlay) {
                overlay.classList.remove('active');
                overlay.classList.remove('drawer-mode');
                setTimeout(() => {
                    const panelContent = document.getElementById('panelContent');
                    if (panelContent) panelContent.innerHTML = '';
                }, 300);
            }
            renderMilkTracker(document.getElementById('categoryToolContainer'));
            if (onClose) onClose();
        } catch (e) {
            showToast('Save failed: ' + e.message, 'error');
        }
    };
}


// --- MONTH PICKER logic ---


function toggleGlobalMonthSelector(show) {
    const el = document.getElementById('monthPickerTrigger');
    if (el) {
        el.style.display = show ? 'flex' : 'none';
        if (show) el.style.visibility = 'visible';
    }
}

function initMonthSelector() {
    const wrapper = document.getElementById('monthPickerTrigger');
    if (!wrapper) return;

    // Inject Arrow Structure 
    wrapper.innerHTML = `
        <button class="month-nav-btn" onclick="navMonth(-1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <span id="currentMonthYear" onclick="document.getElementById('monthPickerModal').style.display='flex'">
            ${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}
        </span>
        <button class="month-nav-btn" onclick="navMonth(1)">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
        </button>
    `;
    updateMonthDisplay();
}

// Call on startup
initMonthSelector();

// Quick Nav Function
function navMonth(delta) {
    // Prevent bubbling if wrapped
    if (window.event) window.event.stopPropagation();

    let newM = STATE.selectedMonth + delta;
    let newY = STATE.selectedYear;

    if (newM > 11) {
        newM = 0;
        newY++;
    } else if (newM < 0) {
        newM = 11;
        newY--;
    }

    STATE.selectedYear = newY;
    setMonth(newM); // This handles state update and re-render
}

function updateMonthDisplay() {
    const display = document.getElementById('currentMonthYear');
    if (display) {
        const isMobile = window.innerWidth <= 768;
        // Mobile: "Jan" / Desktop: "January 2025"
        if (isMobile) {
            display.textContent = MONTHS[STATE.selectedMonth].substring(0, 3);
            // Optionally add year if space permits, but user asked for "Jan", "Feb"
        } else {
            display.textContent = `${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}`;
        }
    }

    const pickerYear = document.getElementById('pickerYear');
    if (pickerYear) pickerYear.textContent = STATE.selectedYear;

    renderMonthGrid();
}

function renderMonthGrid() {
    const grid = document.getElementById('monthGrid');
    grid.innerHTML = MONTHS.map((m, i) => `
            <button class="month-btn ${i === STATE.selectedMonth ? 'selected' : ''}"
        onclick="setMonth(${i})">
            ${m.substring(0, 3)}
        </button>
            `).join('');
}

function setMonth(m) {
    STATE.selectedMonth = m;
    closeMonthPicker();
    updateMonthDisplay();
    // Reload current view with new month context
    if (STATE.view === 'dashboard') {
        renderDashboard();
    } else if (STATE.view === 'subcategories' && STATE.activeCategory) {
        openCategory(STATE.activeCategory);
    } else if (STATE.view === 'milk') {
        const container = document.getElementById('categoryToolContainer') || document.getElementById('panelContent');
        if (container) renderMilkTracker(container);
    }

    // Also refresh side panel if active
    const overlay = document.getElementById('moduleOverlay');
    if (overlay && overlay.classList.contains('active') && STATE.activeSubcategory) {
        // Refresh the panel content with new month data
        renderModuleContent(STATE.activeSubcategory, STATE.activeCategory);

        // Update panel title with new month
        const dateStr = `${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}`;
        const titleEl = document.getElementById('panelTitle');
        if (titleEl) titleEl.textContent = `${STATE.activeSubcategory} - ${dateStr}`;
    }
}

function shiftMonth(delta, containerId) {
    STATE.selectedMonth += delta;
    if (STATE.selectedMonth > 11) {
        STATE.selectedMonth = 0;
        STATE.selectedYear++;
    } else if (STATE.selectedMonth < 0) {
        STATE.selectedMonth = 11;
        STATE.selectedYear--;
    }
    updateMonthDisplay();

    // Refresh the specific tracker in the provided container
    const container = document.getElementById(containerId);
    if (container) renderMilkTracker(container);
}

function changeYear(delta) {
    STATE.selectedYear += delta;
    updateMonthDisplay();
}

function openMonthPicker() {
    document.getElementById('monthPickerModal').classList.add('active');
}

function closeMonthPicker() {
    document.getElementById('monthPickerModal').classList.remove('active');
}

// --- UTILS & HELPERS ---

function getRelativeDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

// --- PDF EXPORT ---

async function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const monthName = MONTHS[STATE.selectedMonth];
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    const yearStr = STATE.selectedYear;

    let monthlyData = [];

    try {
        if (STATE.activeCategory) {
            // --- CONTEXTUAL EXPORT (Category Only) ---
            const cat = STATE.categories.find(c => c.id === STATE.activeCategory || c._id === STATE.activeCategory);
            const catName = cat ? cat.name : STATE.activeCategory;

            // SPECIAL HANDLING FOR MILK
            if (cat && (cat.name === 'Milk' || cat.type === 'milk')) {
                const res = await fetchAPI(`/api/entries?type=milk&month=${monthStr}`);
                monthlyData = res.entries || [];

                if (monthlyData.length === 0) {
                    showToast(`No Milk data to export for ${monthName}!`, 'info');
                    return;
                }

                // Header
                doc.setFontSize(22);
                doc.setTextColor(59, 130, 246); // Primary Blue
                doc.text("Paperless", 105, 20, { align: "center" });

                doc.setFontSize(14);
                doc.setTextColor(30, 41, 59);
                doc.text(`Milk Expense Report - ${monthName} ${yearStr}`, 105, 30, { align: "center" });

                // Calculate Stats
                const totalAmount = monthlyData.reduce((sum, d) => sum + d.amount, 0);
                const totalLitres = monthlyData.reduce((sum, d) => sum + (d.liters || 0), 0);

                doc.setFontSize(12);
                doc.text(`Total Cost: ₹${totalAmount.toLocaleString()}`, 14, 45);
                doc.text(`Total Liters: ${totalLitres}`, 14, 52);

                // Table
                const milkRows = monthlyData
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .map(d => [
                        new Date(d.date).toLocaleDateString('en-GB'),
                        `${d.liters} L`, // Specific Milk Column
                        `₹${d.amount.toLocaleString()}`
                    ]);

                doc.autoTable({
                    startY: 60,
                    head: [['Date', 'Quantity', 'Cost']],
                    body: milkRows,
                    theme: 'grid',
                    headStyles: { fillColor: [59, 130, 246] }
                });

                doc.save(`Paperless_Milk_${monthName}_${yearStr}.pdf`);
                return; // Stop here for Milk
            }

            // STANDARD CATEGORY EXPORT
            // Fetch only this category's data
            const res = await fetchAPI(`/api/entries?categoryId=${cat._id || cat.id}&month=${monthStr}`);
            // Depending on API structure, res might be array or { entries: [] }
            monthlyData = Array.isArray(res) ? res : (res.entries || []);

            if (monthlyData.length === 0) {
                showToast(`No data to export for ${catName} this month!`, 'info');
                return;
            }

            // Header
            doc.setFontSize(22);
            doc.setTextColor(59, 130, 246);
            doc.text("Paperless", 105, 20, { align: "center" });

            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text(`Category Report: ${catName} - ${monthName} ${yearStr}`, 105, 30, { align: "center" });

            // Stats
            const total = monthlyData.reduce((sum, d) => sum + d.amount, 0);
            doc.setFontSize(12);
            doc.text(`Total Spent: ₹${total.toLocaleString()}`, 14, 45);

            // Table
            const historyRows = monthlyData
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map(h => [
                    new Date(h.date).toLocaleDateString('en-GB'),
                    h.itemName || h.notes || h.subCategory || 'Item',
                    `₹${h.amount.toLocaleString()}`
                ]);

            doc.autoTable({
                startY: 55,
                head: [['Date', 'Item', 'Amount']],
                body: historyRows,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246] }
            });

            doc.save(`Paperless_${catName}_${monthName}_${yearStr}.pdf`);
            showToast(`${catName} report downloaded!`, "success");

        } else {
            // --- GLOBAL EXPORT (All Categories) ---
            const parents = ['Daily Expenses', 'Utilities & Bills', 'Groceries', 'House Maintenance', 'Education', 'Health', 'Transportation', 'Occasional & Events', 'Subscriptions', 'Miscellaneous', 'Savings', 'Milk'];
            const entriesResults = await Promise.all(parents.map(async p => {
                return await fetchAPI(`/api/entries?parentCategory=${encodeURIComponent(p)}&month=${monthStr}`);
            }));
            monthlyData = entriesResults.flat();

            if (monthlyData.length === 0) {
                showToast("No data to export for this month!", 'info');
                return;
            }

            // Header
            doc.setFontSize(22);
            doc.setTextColor(59, 130, 246);
            doc.text("Paperless", 105, 20, { align: "center" });

            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            doc.text(`Monthly Spending Report - ${monthName} ${yearStr}`, 105, 30, { align: "center" });

            // Category Summary
            const totalsByCategory = {};
            let grandTotal = 0;

            monthlyData.forEach(d => {
                const catName = d.parentCategory || d.category || 'Other';
                totalsByCategory[catName] = (totalsByCategory[catName] || 0) + d.amount;
                grandTotal += d.amount;
            });

            doc.setFontSize(12);
            doc.text("Category Summary", 14, 45);

            const summaryRows = Object.entries(totalsByCategory).map(([name, amount]) => [name, `₹${amount.toLocaleString()}`]);
            summaryRows.push([{ content: "Grand Total", styles: { fontStyle: 'bold' } }, { content: `₹${grandTotal.toLocaleString()}`, styles: { fontStyle: 'bold' } }]);

            doc.autoTable({
                startY: 50,
                head: [['Category', 'Amount']],
                body: summaryRows,
                theme: 'striped',
                headStyles: { fillColor: [59, 130, 246] }
            });

            // Detailed History
            doc.text("Detailed Expense History", 14, doc.lastAutoTable.finalY + 15);

            const historyRows = monthlyData
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map(h => [
                    new Date(h.date).toLocaleDateString('en-GB'),
                    h.itemName || h.notes || h.subCategory || 'Expense',
                    h.parentCategory || h.category || '-',
                    `₹${h.amount.toLocaleString()}`
                ]);

            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 20,
                head: [['Date', 'Item', 'Category', 'Amount']],
                body: historyRows,
                theme: 'grid',
                headStyles: { fillColor: [59, 130, 246] }
            });

            doc.save(`Paperless_Report_${monthName}_${yearStr}.pdf`);
            showToast("Monthly Report downloaded successfully!", "success");
        }
    } catch (e) {
        console.error("Error fetching data for PDF:", e);
        showToast("Failed to fetch data for PDF export.", 'error');
    }
}


// --- LOGIN & SESSION ---

function toggleAuthMode(e) {
    if (e) e.preventDefault();
    STATE.authMode = STATE.authMode === 'signIn' ? 'signUp' : 'signIn';

    const authTitle = document.getElementById('authTitle');
    const backToLogin = document.getElementById('backToLogin');
    const toggleText = document.getElementById('toggleText');
    const toggleBtn = document.getElementById('toggleAuthBtn');
    const googleAuthBtn = document.getElementById('googleAuthBtn');
    const googleBtnText = document.getElementById('googleBtnText');

    if (STATE.authMode === 'signUp') {
        if (authTitle) authTitle.textContent = 'Sign Up';

        if (googleAuthBtn) {
            googleAuthBtn.href = '/auth/google?mode=signup';
            if (googleBtnText) googleBtnText.textContent = 'Continue with Google';
        }

        if (backToLogin) backToLogin.style.display = 'block';
        if (toggleText) toggleText.textContent = 'Already have an account?';
        if (toggleBtn) toggleBtn.textContent = 'Sign In';
    } else {
        if (authTitle) authTitle.textContent = 'Login';

        if (googleAuthBtn) {
            googleAuthBtn.href = '/auth/google?mode=login';
            if (googleBtnText) googleBtnText.textContent = 'Continue with Google';
        }

        if (backToLogin) backToLogin.style.display = 'none';
        if (toggleText) toggleText.textContent = "Don't have account?";
        if (toggleBtn) toggleBtn.textContent = 'Sign Up';
    }
}

async function handleLogin(e) {
    if (e) e.preventDefault();
    console.log("Manual authentication is disabled. Use Google instead.");
}

function showSuccessLogo() {
    const overlay = document.getElementById('successOverlay');
    if (!overlay) {
        window.location.href = 'index.html';
        return;
    }
    overlay.style.display = 'flex';
    overlay.style.opacity = '1'; // Immediately visible
    overlay.style.visibility = 'visible';
    saveState();

    setTimeout(() => {
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.visibility = 'hidden';
            window.location.href = 'index.html';
        }, 500);
    }, 2000); // 2 seconds as requested
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // --- AUTH TOKEN HANDLING ---
    // URL params are now handled in checkAuth() at the top of the file
    // to ensure they are captured before URL cleaning and to handle initial redirects.

    // Only initialize dashboard elements if they exist
    const monthPickerTrigger = document.getElementById('monthPickerTrigger');
    if (monthPickerTrigger) {
        updateMonthDisplay();
        monthPickerTrigger.addEventListener('click', openMonthPicker);

        const prevYearBtn = document.getElementById('prevYear');
        if (prevYearBtn) prevYearBtn.addEventListener('click', () => changeYear(-1));

        const nextYearBtn = document.getElementById('nextYear');
        if (nextYearBtn) nextYearBtn.addEventListener('click', () => changeYear(1));

        const exportBtn = document.getElementById('exportPDF');
        if (exportBtn) exportBtn.addEventListener('click', exportToPDF);

        // Initial render if on home or index (as it is the new home)
        if (currentPage === 'home.html' || currentPage === 'index.html') {
            renderDashboard();
        }
    }

    // Always check for common elements
    const closePanel = document.getElementById('closePanel');
    if (closePanel) closePanel.addEventListener('click', closeModule);

    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        // Manual form submission handler
        loginForm.addEventListener('submit', handleLogin);

        const toggleAuthBtn = document.getElementById('toggleAuthBtn');
        if (toggleAuthBtn) toggleAuthBtn.addEventListener('click', toggleAuthMode);

        const backToLogin = document.getElementById('backToLogin');
        if (backToLogin) backToLogin.addEventListener('click', toggleAuthMode);
    }

    // Theme Toggle
    const themeBtn = document.getElementById('themeToggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Initialize Theme
    initTheme();

    // Close overlay if clicking purely on the overlay background
    window.addEventListener('click', (e) => {
        if (e.target.id === 'monthPickerModal') closeMonthPicker();
        if (e.target.id === 'moduleOverlay') closeModule();
        
        // Close context menus if clicking outside
        if (!e.target.closest('.card-menu-container')) {
            closeAllMenus();
        }
    });
});

// --- NEW HELPER FUNCTIONS FOR CONTEXT MENU ---
function toggleCardMenu(event, id) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }
    
    const menuId = `menu-${id}`;
    const menuEl = document.getElementById(menuId);
    if (!menuEl) return;
    
    // Check if currently open
    const parent = menuEl.closest('.card-menu-container');
    const wasOpen = parent.classList.contains('active');
    
    // Close all first
    closeAllMenus();
    
    // If it wasn't open, open it now
    if (!wasOpen) {
        parent.classList.add('active');
    }
}

function closeAllMenus() {
    document.querySelectorAll('.card-menu-container.active').forEach(el => el.classList.remove('active'));
}

function handleDeleteCategory(event, id) {
    if(event) {
        event.stopPropagation();
        event.preventDefault(); // Prevent menu close from immediately bubbling if inside button?
    }
    closeAllMenus();
    deleteCategory(id);
}

function handleDeleteSubcategory(event, catId, subId, subName) {
    if(event) {
        event.stopPropagation();
    }
    closeAllMenus();
    deleteSubcategory(catId, subName);
}

// --- NEW HELPER FUNCTIONS FOR MISC & SAVINGS ---


// New: Render Subcategory Grid (Cards)
// New: Render Subcategory Grid (Cards)
async function renderSubcategoryView(container, parentName) {
    // Enable wide view
    container.classList.add('wide-view');

    // Fetch *all* categories to find children (or use API filter)
    const categories = await fetchCategories(parentName);

    // Calculate total for Recent Expenses Check (Lazy way or separate fetch)
    let recentEntries = [];
    try {
        const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
        recentEntries = await fetchAPI(`/api/entries?parentCategory=${encodeURIComponent(parentName)}&month=${monthStr}&_t=${Date.now()}`);
    } catch (e) { console.error(e); }

    container.innerHTML = `
        <div class="panel-header">
            <button class="close-circle desktop-only" onclick="closeModule()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
            <button class="icon-btn mobile-only" onclick="renderDashboard()" style="position: absolute; left: 0.5rem; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; z-index: 10; color: var(--primary) !important;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
            </button>
            <h3>${parentName}</h3>
            <div></div> <!-- Grid Spacer -->
        </div>
        <div class="panel-body">
            <div class="subcategory-view-container">
            
            <div class="subcategory-grid">
                ${categories.map(cat => `
                    <div class="subcategory-card-item" onclick="openModule('${cat.name}', '${cat._id}')">
                         <button class="card-edit-btn" onclick="editCategory(event, '${cat._id}', '${cat.name.replace(/'/g, "\\'")}')">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"></path></svg>
                         </button>
                         ${(cat.type !== 'milk' && !['PPF', 'RD', 'LIC', 'GOLDCHIT', 'FD'].includes(cat.name) && !['Travel', 'Function / Gift', 'Donations', 'Happy Plates'].includes(cat.name)) ? `<button class="card-delete-btn" onclick="event.stopPropagation(); deleteCategory('${cat._id}')">&times;</button>` : ''}
                        <span>${cat.name}</span>
                    </div>
                `).join('')}
                <div class="subcategory-card-item add-new" onclick="promptAddCategory('${parentName}')">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    <span>Add Item</span>
                </div>
            </div>

            <div class="recent-expenses-container entry-history-card">
                <div class="recent-expenses-header">Recent Expenses in ${parentName}</div>
                ${recentEntries.length === 0 ? `
                    <div class="history-empty-state">
                        <p>No recent expenses.</p>
                    </div>
                ` : `
                    <div class="history-scroller">
                        <div class="history-list">
                            ${recentEntries.sort((a, b) => new Date(b.date) - new Date(a.date)).map(entry => `
                                 <div class="history-item">
                                    <div class="history-left">
                                        <span class="history-date">${new Date(entry.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                                        <div class="history-info">
                                            <span class="history-desc">${entry.itemName || entry.notes || entry.category}</span>
                                        </div>
                                    </div>
                                    <div class="history-right">
                                        <span class="history-amount">₹${entry.amount.toLocaleString()}</span>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `}
            </div>
        </div>
    `;
}

async function renderSavingsForm(container, subName, categoryId) {
    // FIX: Ensure Header shows Month Selector
    HeaderManager.update({
        showBack: true,
        onBack: `closeModule('Savings')`,
        hideMonthSelector: false
    });
    const customFieldsHTML = `
        <div class="form-group">
            <label>Organisation (Optional)</label>
            <input type="text" id="sOrg" placeholder="e.g. SBI, LIC, Chit Fund">
        </div>
    `;

    container.innerHTML = getUniversalFormHTML({
        title: `${subName} Entry`,
        onBack: `closeModule('Savings')`, // FIX: Return to Savings Grid, not self-recursion
        itemNameLabel: 'Investment Type', // Not shown but kept for fallback
        itemNameValue: subName,
        customFieldsHTML,
        historyContainerId: null, // Hide history for Savings
        showItemName: false
    });

    // renderSubcategoryHistory(document.getElementById('savingsHistory'), subName, categoryId);

    setupUniversalForm(async (entry) => {
        const org = document.getElementById('sOrg').value;
        entry.categoryId = categoryId;

        // Since input is hidden, manually set item name to the subcategory name
        entry.itemName = subName;

        if (org) entry.itemName = `${entry.itemName} (${org})`;

        // FIX: Ensure Savings entries appear in History
        entry.parentCategory = 'Savings';

        const success = await addEntry(entry);
        if (success) {
            renderSavingsForm(container, subName, categoryId);
        }
    });
}

// Update promptAddCategory to handle parent
window.promptAddCategory = async function (parentName = null) {
    const parent = typeof parentName === 'string' ? parentName : 'Daily Expenses'; // Default if null/event
    const name = await showPrompt(`Enter ${parent === 'Daily Expenses' ? 'Category' : 'Subcategory'} Name:`, "e.g. " + (parent === 'Daily Expenses' ? "Groceries" : "New Item"));
    if (!name) return;

    try {
        const payload = {
            name,
            type: 'general',
            parentCategory: parent
        };

        await fetchAPI('/api/categories', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        // Refresh based on context
        if (parent === 'Miscellaneous' || parent === 'Savings') {
            openCategory(parent.toLowerCase());
        } else {
            renderDashboard();
        }
    } catch (err) {
        alert(err.message);
    }
};

function toggleYearDropdown(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('yearSelectDropdown');
    if (dropdown) dropdown.classList.toggle('active');
}

function selectYear(year) {
    STATE.selectedYear = year;
    const dropdown = document.getElementById('yearSelectDropdown');
    if (dropdown) dropdown.classList.remove('active');

    const wrapper = document.querySelector('.milk-overhaul-wrapper');
    const container = wrapper ? wrapper.parentElement : document.getElementById('categoryToolContainer');
    renderMilkTracker(container);
}

// Global click handler to close dropdowns
window.addEventListener('click', (e) => {
    const dropdowns = document.querySelectorAll('.custom-dropdown');
    dropdowns.forEach(d => {
        if (!d.contains(e.target)) d.classList.remove('active');
    });
});
