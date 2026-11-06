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
    categories: [],
    subcategories: {},
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

// ── IST DATE UTILITIES ───────────────────────────────────────────────────────
// Dates are stored in MongoDB as UTC. These helpers convert UTC → IST (Asia/Kolkata)
// for DISPLAY ONLY. All sorting, filtering, and DB operations remain on UTC.

const IST_TZ = 'Asia/Kolkata';

/**
 * Converts any date input to a plain Date whose local components
 * (getDate, getMonth, getFullYear, getDay) reflect IST wall-clock time.
 * Use this when you need IST day/month/year numbers for display.
 */
function toIST(dateInput) {
    const d = new Date(dateInput);
    const fmt = new Intl.DateTimeFormat('en-CA', {
        timeZone: IST_TZ,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    });
    const parts = Object.fromEntries(
        fmt.formatToParts(d)
           .filter(p => p.type !== 'literal')
           .map(p => [p.type, p.value])
    );
    // Clamp midnight hour reported as '24' by some engines
    const hour = parts.hour === '24' ? '00' : parts.hour;
    return new Date(`${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${parts.second}`);
}

/**
 * Short display format: '04 Feb' — used in history lists and summary pills.
 */
function formatISTShort(dateInput) {
    return new Date(dateInput).toLocaleDateString('en-GB', {
        timeZone: IST_TZ,
        day: '2-digit',
        month: 'short'
    });
}

/**
 * Date-only format for PDF tables: '04/02/2026'
 */
function formatISTDate(dateInput) {
    return new Date(dateInput).toLocaleDateString('en-GB', {
        timeZone: IST_TZ
    });
}

/**
 * Returns the IST date as a 'YYYY-MM-DD' string suitable for <input type="date"> pre-fill.
 */
function formatISTInput(dateInput) {
    const ist = toIST(dateInput);
    const y   = ist.getFullYear();
    const m   = String(ist.getMonth() + 1).padStart(2, '0');
    const day = String(ist.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

/**
 * Returns today's date in IST as 'YYYY-MM-DD' (for default form values).
 */
function todayIST() {
    return formatISTInput(new Date());
}

/**
 * Returns a Date object whose .getDate()/.getMonth()/.getFullYear()/.getDay()
 * reflect today in IST — used for "is today?" highlight comparisons.
 */
function todayISTObj() {
    return toIST(new Date());
}
// ────────────────────────────────────────────────────────────────────────────

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
        // semantic fix: Always default to current month/year on reload to ensure "auto update"
        // if (parsed.selectedMonth !== undefined) STATE.selectedMonth = parsed.selectedMonth;
        // if (parsed.selectedYear !== undefined) STATE.selectedYear = parsed.selectedYear;
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
        if (typeof action === 'function') {
            action();
        } else if (typeof window[action] === 'function') {
            window[action]();
        } else if (action === 'renderDashboard' || action.includes('renderDashboard')) {
            renderDashboard();
        } else {
            try {
                const actionStr = action.endsWith('()') ? action : `${action}()`;
                const fn = new Function(actionStr);
                fn();
            } catch (err) {
                console.error('Error executing back action:', err);
                renderDashboard();
            }
        }
        return;
    }

    // 4. Ultimate Fallback
    renderDashboard();
};

const HeaderManager = {
    update: function (config) {
        // Store config globally for the handler
        window.currentBackAction = config.onBack;

        // Ensure nav slot container exists without destroying layout
        let navSlot = document.getElementById('headerNavSlot');
        const headerLeft = document.querySelector('.header-left');
        if (!navSlot && headerLeft) {
            navSlot = document.createElement('div');
            navSlot.id = 'headerNavSlot';
            navSlot.className = 'header-nav-slot';
            headerLeft.insertAdjacentElement('afterbegin', navSlot);
        }

        let menuBtn = document.getElementById('menuBtn');
        if (menuBtn && navSlot && menuBtn.parentElement !== navSlot) {
            navSlot.appendChild(menuBtn);
        }

        const subContentRow = document.getElementById('headerSubContent');
        const navRow = document.getElementById('headerNavRow');
        const logo = document.querySelector('.logo');
        const monthTrigger = document.getElementById('monthPickerTrigger');

        // 1. Reset
        const isMobile = window.innerWidth <= 768;

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

        // Toggle state of the single shared Navigation Button (#menuBtn)
        if (menuBtn) {
            const iconMenu = menuBtn.querySelector('.nav-icon-menu');
            const iconBack = menuBtn.querySelector('.nav-icon-back');

            if (config.showBack) {
                menuBtn.dataset.state = 'back';
                menuBtn.setAttribute('aria-label', 'Go Back');
                menuBtn.setAttribute('title', 'Go Back');
                if (iconMenu) iconMenu.style.display = 'none';
                if (iconBack) iconBack.style.display = 'block';
            } else {
                menuBtn.dataset.state = 'menu';
                menuBtn.setAttribute('aria-label', 'Open Menu');
                menuBtn.setAttribute('title', 'Open Menu');
                if (iconMenu) iconMenu.style.display = 'block';
                if (iconBack) iconBack.style.display = 'none';
            }
        }

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

// Scroll Header Hiding Logic
let lastScrollTop = 0;
window.addEventListener('scroll', () => {
    const isMobile = window.innerWidth <= 768;
    if (!isMobile) return;

    const header = document.querySelector('.app-header');
    if (!header) return;

    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

    // Hide on scroll down (if scrolled past 50px), Show on scroll up
    if (scrollTop > lastScrollTop && scrollTop > 50) {
        header.classList.add('header-hidden');
    } else {
        header.classList.remove('header-hidden');
    }
    lastScrollTop = scrollTop <= 0 ? 0 : scrollTop; // For Mobile or negative scrolling
}, { passive: true });

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
const isPublicPage = ['admin.html', 'get-started.html', 'success.html'].includes(currentPage);


if (!checkAuth() && !isAuthPage && !isPublicPage) {
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
    const name = await showPrompt("Enter Category Name:");
    if (name) {
        try {
            // New categories are always top-level (parentCategory: null)
            const newCategory = await fetchAPI('/api/categories', {
                method: 'POST',
                body: JSON.stringify({ name, parentCategory: null, type: 'general' })
            });

            showToast(`Category "${name}" added!`, 'success');
            renderDashboard();
        } catch (err) {
            showToast('Failed to add category: ' + err.message, 'error');
        }
    }
}

async function promptAddItem(catId) {
    const cat = STATE.categories.find(c => c.id === catId || c._id === catId);
    const name = await showPrompt("Enter Item Name:");
    if (name) {
        try {
            // For Miscellaneous and Savings, add as subcategory (with parentCategory set)
            await fetchAPI('/api/categories', {
                method: 'POST',
                body: JSON.stringify({
                    name,
                    parentCategory: cat.name,  // Parent is 'Miscellaneous' or 'Savings'
                    type: 'general'
                })
            });
            showToast(`"${name}" added to ${cat.name}!`, 'success');
            openCategory(catId);
        } catch (err) {
            showToast('Failed to add item: ' + err.message, 'error');
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
    closeAllMenus();
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
        dateValue = todayIST(),
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
                    <div class="form-row-split">
                        <div class="form-col-amount">
                            <div class="form-group">
                                <label>Amount (Mandatory) ₹</label>
                                <input type="number" id="formAmount" placeholder="0.00" value="${amountValue}" required>
                            </div>
                        </div>
                        <div class="form-col-payment">
                            <div class="form-group">
                                <label>Payment</label>
                                <!-- Custom Dropdown Trigger -->
                                <div class="custom-select-container" id="paymentCustomSelect">
                                    <input type="hidden" id="formPaymentMode" value="Cash">
                                    <button type="button" class="custom-select-trigger" onclick="togglePaymentDropdown(event)">
                                        <span id="paymentSelectedText">Cash</span>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                                    </button>
                                    
                                    <div class="custom-options-list" id="paymentOptionsList">
                                        <div class="custom-option selected" onclick="selectPaymentOption('Cash')">
                                            <span>Cash</span>
                                        </div>
                                        <div class="custom-option" onclick="selectPaymentOption('UPI')">
                                            <span>UPI</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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
                notes: document.getElementById('formNotes').value,
                paymentMode: document.getElementById('formPaymentMode') ? document.getElementById('formPaymentMode').value : 'Cash'
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



// --- ABOUT PAGE ---
function renderAbout() {
    STATE.view = 'about';
    STATE.activeCategory = null;

    // Update Header
    HeaderManager.update({
        showBack: true,
        onBack: 'renderDashboard',
        hideMonthSelector: true
    });

    const main = document.getElementById('mainContent');
    main.className = 'view-container about-view';
    main.innerHTML = `
        <div class="about-container">
            <!-- Header Section -->
            <div class="about-header">
                <h1 class="about-title">About Paperless</h1>
                <p class="about-subtitle">An easier way to keep track of everyday expenses.</p>
            </div>

            <hr class="about-divider" />

            <!-- What is Paperless? -->
            <section class="about-section">
                <h2 class="about-section-title">What is Paperless?</h2>
                <p class="about-text">
                    Paperless is a digital expense tracker built to make everyday expense recording simpler. Instead of maintaining expenses in notebooks or scattered notes, users can record, organize and review their expenses in one place.
                </p>
                <p class="about-text">
                    The idea behind Paperless came from a simple observation: many people still keep track of their monthly spending manually. While that works, reviewing expenses later can become difficult. Paperless brings the same habit into a simple digital format.
                </p>
            </section>

            <hr class="about-divider" />

            <!-- Why Paperless? -->
            <section class="about-section">
                <h2 class="about-section-title">Why Paperless?</h2>
                <p class="about-text">
                    Traditional expense tracking is often done using notebooks, diaries or phone notes. Although simple, it can make it difficult to understand spending patterns over time.
                </p>
                <p class="about-text">
                    Paperless was created to keep the same simplicity while making expenses easier to organize, search, review and understand.
                </p>

                <div class="about-why-grid">
                    <div class="about-why-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Record expenses quickly</span>
                    </div>
                    <div class="about-why-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Organize expenses by category</span>
                    </div>
                    <div class="about-why-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        <span>Review monthly spending and trends</span>
                    </div>
                </div>
            </section>

            <hr class="about-divider" />

            <!-- What you can do -->
            <section class="about-section">
                <h2 class="about-section-title">What you can do</h2>
                <div class="about-do-grid">
                    <div class="about-do-card">
                        <div class="about-do-header">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="12" y1="8" x2="12" y2="16"></line>
                                <line x1="8" y1="12" x2="16" y2="12"></line>
                            </svg>
                            <h3>Track Expenses</h3>
                        </div>
                        <p>Record daily expenses and keep them organized.</p>
                    </div>

                    <div class="about-do-card">
                        <div class="about-do-header">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="3" width="7" height="7"></rect>
                                <rect x="14" y="3" width="7" height="7"></rect>
                                <rect x="14" y="14" width="7" height="7"></rect>
                                <rect x="3" y="14" width="7" height="7"></rect>
                            </svg>
                            <h3>Manage Categories</h3>
                        </div>
                        <p>Group expenses based on how you spend your money.</p>
                    </div>

                    <div class="about-do-card">
                        <div class="about-do-header">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                                <line x1="16" y1="2" x2="16" y2="6"></line>
                                <line x1="8" y1="2" x2="8" y2="6"></line>
                                <line x1="3" y1="10" x2="21" y2="10"></line>
                            </svg>
                            <h3>View Monthly Reports</h3>
                        </div>
                        <p>Review your expenses month by month and understand where your money went.</p>
                    </div>

                    <div class="about-do-card">
                        <div class="about-do-header">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path>
                                <path d="M22 12A10 10 0 0 0 12 2v10z"></path>
                            </svg>
                            <h3>Analyze Spending</h3>
                        </div>
                        <p>Use visual insights to identify spending patterns.</p>
                    </div>
                </div>
            </section>

            <hr class="about-divider" />

            <!-- How it works -->
            <section class="about-section">
                <h2 class="about-section-title">How it works</h2>
                <div class="about-steps-grid">
                    <div class="about-step-card">
                        <span class="about-step-num">01</span>
                        <div class="about-step-info">
                            <h3>Add an expense</h3>
                            <p>Record the amount, category and relevant details.</p>
                        </div>
                    </div>
                    <div class="about-step-card">
                        <span class="about-step-num">02</span>
                        <div class="about-step-info">
                            <h3>Organize</h3>
                            <p>Your expenses are grouped and stored for easy access.</p>
                        </div>
                    </div>
                    <div class="about-step-card">
                        <span class="about-step-num">03</span>
                        <div class="about-step-info">
                            <h3>Review</h3>
                            <p>Check monthly totals, categories and spending patterns.</p>
                        </div>
                    </div>
                </div>
            </section>

            <hr class="about-divider" />

            <!-- The idea behind Paperless -->
            <section class="about-section">
                <h2 class="about-section-title">The idea behind Paperless</h2>
                <p class="about-text">
                    Paperless was built around a simple idea — managing expenses should not require maintaining a notebook or remembering where every expense was written down.
                </p>
                <p class="about-text">
                    The goal is not to make expense tracking complicated. It is to make a small everyday habit easier to maintain digitally.
                </p>
            </section>

            <hr class="about-divider" />

            <!-- Key Features -->
            <section class="about-section">
                <h2 class="about-section-title">Key Features</h2>
                <div class="about-features-grid">
                    <div class="about-feature-item">• Expense tracking</div>
                    <div class="about-feature-item">• Category-based organization</div>
                    <div class="about-feature-item">• Monthly reports</div>
                    <div class="about-feature-item">• Spending analytics</div>
                    <div class="about-feature-item">• User accounts</div>
                    <div class="about-feature-item">• Responsive interface</div>
                </div>
            </section>

            <hr class="about-divider" />

            <!-- What Paperless aims to do -->
            <section class="about-section">
                <div class="about-aims-card">
                    <h2 class="about-section-title" style="margin-bottom: 0.4rem;">What Paperless aims to do</h2>
                    <p class="about-text" style="margin-bottom: 0.4rem;">
                        Paperless aims to make personal expense tracking simple enough to become an everyday habit.
                    </p>
                    <p class="about-text" style="margin: 0;">
                        No complicated financial terminology. No unnecessary features. Just a straightforward way to record and understand your spending.
                    </p>
                </div>
            </section>

            <!-- Developer / Project Note -->
            <div class="about-note">
                <p><strong>A project built with a simple idea.</strong></p>
                <p>Paperless is a practical software project focused on solving an everyday problem through a simple web application.</p>
            </div>

            <div class="about-footer">
                <p>&copy; ${new Date().getFullYear()} Paperless. All rights reserved.</p>
            </div>
        </div>
    `;
}

// --- SETTINGS & BUDGET LIMITS ---

async function fetchBudget() {
    try {
        const res = await fetchAPI('/api/budget');
        if (res && res.success && res.budget) {
            STATE.budget = res.budget;
            return res.budget;
        }
        const defaultBudget = { overallBudget: 0, categoryBudgets: [] };
        STATE.budget = defaultBudget;
        return defaultBudget;
    } catch (err) {
        console.error('Error fetching budget settings:', err);
        return STATE.budget || { overallBudget: 0, categoryBudgets: [] };
    }
}

async function saveBudget(budgetData) {
    try {
        STATE.budget = budgetData;
        const res = await fetchAPI('/api/budget', {
            method: 'PUT',
            body: JSON.stringify(budgetData)
        });
        if (res && res.success) {
            if (res.budget) STATE.budget = res.budget;
            showToast('Budget limits saved successfully', 'success');
            return true;
        } else {
            showToast((res && res.message) || 'Failed to save budget limits', 'error');
            return false;
        }
    } catch (err) {
        console.error('Error saving budget settings:', err);
        showToast('Unable to save budget limits', 'error');
        return false;
    }
}

async function renderSettings() {
    STATE.view = 'settings';
    STATE.settingsSubView = 'menu';
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;

    HeaderManager.update({
        showBack: true,
        onBack: 'renderDashboard',
        hideMonthSelector: true
    });

    const main = document.getElementById('mainContent');
    if (!main) return;
    main.className = 'view-container settings-view';

    main.innerHTML = `
        <div class="settings-container">
            <div class="settings-header">
                <h1 class="settings-title">Settings</h1>
                <p class="settings-subtitle">Manage your account preferences and spending limits.</p>
            </div>

            <div class="settings-menu-list">
                <!-- 1. Budget Limits -->
                <div class="settings-menu-item" onclick="renderBudgetLimits()">
                    <div class="settings-item-left">
                        <div class="settings-item-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                            </svg>
                        </div>
                        <div class="settings-item-info">
                            <h3 class="settings-item-title">Budget Limits</h3>
                            <p class="settings-item-desc">Set overall & category monthly spending limits with automated tracking.</p>
                        </div>
                    </div>
                    <div class="settings-item-arrow">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>

                <!-- 2. Notifications -->
                <div class="settings-menu-item" onclick="renderNotifications()">
                    <div class="settings-item-left">
                        <div class="settings-item-icon">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                            </svg>
                        </div>
                        <div class="settings-item-info">
                            <h3 class="settings-item-title">Notifications</h3>
                            <p class="settings-item-desc">Manage your spending alerts and notification preferences.</p>
                        </div>
                    </div>
                    <div class="settings-item-arrow">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    </div>
                </div>
            </div>
        </div>
    `;
}

async function renderBudgetLimits() {
    STATE.view = 'settings';
    STATE.settingsSubView = 'budget';
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;

    HeaderManager.update({
        showBack: true,
        onBack: 'renderSettings',
        hideMonthSelector: false
    });

    const main = document.getElementById('mainContent');
    if (!main) return;
    main.className = 'view-container settings-view';

    // Immediate Loading State UI
    main.innerHTML = `
        <div class="settings-container">
            <div class="settings-card loading-card">
                <svg class="spinner" viewBox="0 0 50 50" style="width: 32px; height: 32px; animation: spin 1s linear infinite; margin-bottom: 12px; color: var(--primary);">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                <p style="margin:0; font-weight:500; color: var(--text-muted);">Loading Budget Limits...</p>
            </div>
        </div>
    `;

    // Fetch month entries, budget settings, and categories in parallel
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    const [entries, budgetData, categoriesData] = await Promise.all([
        fetchAPI(`/api/entries?month=${monthStr}`).catch(e => {
            console.error('Failed to fetch entries for budget:', e);
            return [];
        }),
        fetchBudget(),
        fetchCategories('', true).catch(e => {
            console.error('Failed to fetch categories for budget:', e);
            return STATE.categories || [];
        })
    ]);

    const categories = (categoriesData && categoriesData.length > 0) ? categoriesData : (STATE.categories || []);
    if (categories && categories.length > 0) {
        STATE.categories = categories;
    }

    const availableCategories = (categories || []).filter(c => c && c.name);
    availableCategories.sort((a, b) => a.name.localeCompare(b.name));

    const totalMonthSpent = (entries || []).reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

    const overallBudget = Number(budgetData?.overallBudget) || 0;
    const categoryBudgets = Array.isArray(budgetData?.categoryBudgets) ? budgetData.categoryBudgets : [];

    function calculateCategorySpending(catNameOrId) {
        if (!catNameOrId) return 0;
        const searchKey = String(catNameOrId).toLowerCase().trim();
        let total = 0;

        (entries || []).forEach(e => {
            let isMatch = false;

            if (e.categoryId && String(e.categoryId).toLowerCase() === searchKey) {
                isMatch = true;
            }

            if (!isMatch) {
                let entryCatName = '';
                if (e.itemName === 'Milk' || e.type === 'milk') {
                    entryCatName = 'milk';
                } else if (e.parentCategory) {
                    entryCatName = e.parentCategory.toLowerCase().trim();
                } else if (e.categoryId) {
                    const found = availableCategories.find(c => String(c._id) === String(e.categoryId) || String(c.id) === String(e.categoryId));
                    if (found) {
                        entryCatName = (found.parentCategory || found.name).toLowerCase().trim();
                    }
                }

                if (!entryCatName && e.categoryName) {
                    entryCatName = e.categoryName.toLowerCase().trim();
                }

                if (entryCatName === searchKey) {
                    isMatch = true;
                }

                if (!isMatch && e.categoryId) {
                    const found = availableCategories.find(c => String(c._id) === String(e.categoryId) || String(c.id) === String(e.categoryId));
                    if (found && found.name.toLowerCase().trim() === searchKey) {
                        isMatch = true;
                    }
                }
            }

            if (isMatch) {
                total += Number(e.amount) || 0;
            }
        });

        return total;
    }

    const monthName = MONTHS[STATE.selectedMonth];
    const yearNum = STATE.selectedYear;

    main.innerHTML = `
        <div class="settings-container budget-redesign-container">
            <!-- Hero Header -->
            <div class="settings-header budget-header-v2">
                <div>
                    <h1 class="settings-title">Budget & Spending Limits</h1>
                    <p class="settings-subtitle">Set monthly targets and track category limits for <span class="settings-month-badge">${monthName} ${yearNum}</span></p>
                </div>
            </div>

            <!-- 1. Overall Budget Hero Card -->
            <div class="budget-hero-card">
                <div class="budget-hero-header">
                    <div class="budget-hero-title">
                        <div class="hero-icon-box">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
                                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
                            </svg>
                        </div>
                        <div>
                            <h2>Overall Monthly Budget</h2>
                            <p>Total maximum spending threshold for ${monthName}</p>
                        </div>
                    </div>
                </div>

                <div class="budget-hero-body">
                    <!-- Custom Input with Quick Chips -->
                    <div class="budget-input-v2">
                        <label for="overallBudgetInput" class="budget-label-v2">Set Spending Target (₹)</label>
                        <div class="currency-wrapper-v2">
                            <div class="input-with-symbol-v2">
                                <span class="currency-symbol-v2">₹</span>
                                <input type="number" id="overallBudgetInput" class="settings-input-v2" placeholder="20,000" min="0" value="${overallBudget > 0 ? overallBudget : ''}">
                            </div>
                            <button type="button" id="saveSpendingTargetBtn" class="save-target-btn-v2" title="Save Spending Target">
                                <span>Save Target</span>
                            </button>
                        </div>
                        <div class="quick-preset-chips">
                            <span class="preset-chip" onclick="document.getElementById('overallBudgetInput').value=10000;">₹10k</span>
                            <span class="preset-chip" onclick="document.getElementById('overallBudgetInput').value=20000;">₹20k</span>
                            <span class="preset-chip" onclick="document.getElementById('overallBudgetInput').value=50000;">₹50k</span>
                            <span class="preset-chip" onclick="document.getElementById('overallBudgetInput').value=100000;">₹1 Lakh</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 2. Category Allocations Section -->
            <div class="budget-category-section">
                <div class="category-section-header">
                    <div>
                        <h2 class="category-section-title">Category Limits</h2>
                        <p class="category-section-desc">Assign specific monthly spending caps for individual categories.</p>
                    </div>
                    <button type="button" id="addCategoryBudgetBtn" class="add-cat-btn-v2">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="12" y1="5" x2="12" y2="19"></line>
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                        </svg>
                        <span>Add Category Limit</span>
                    </button>
                </div>

                <div id="categoryBudgetsContainer" class="category-budgets-list-v2">
                    ${categoryBudgets.length === 0 ? `
                        <div class="empty-category-v2" id="emptyCategoryBudgetsMsg">
                            <div class="empty-icon-v2">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                                </svg>
                            </div>
                            <h3>No Category Limits Configured</h3>
                            <p>Set specific caps on Food, Transport, Shopping, or Utilities to track expenses automatically.</p>
                        </div>
                    ` : ''}
                </div>
            </div>

            <!-- Sticky Save Bar -->
            <div class="budget-save-footer">
                <button type="button" id="saveBudgetBtn" class="save-budget-btn-v2">
                    <span>Save Changes</span>
                </button>
            </div>
        </div>
    `;

    const container = document.getElementById('categoryBudgetsContainer');

    if (categoryBudgets.length > 0 && container) {
        categoryBudgets.forEach(item => {
            const row = createCategoryBudgetRow(item);
            container.appendChild(row);
        });
    }

    function createCategoryBudgetRow(item = { categoryId: '', categoryName: '', limit: '' }) {
        const div = document.createElement('div');
        div.className = 'category-budget-row-v2';

        const selCatName = item.categoryName || '';
        const limitVal = item.limit !== undefined && item.limit !== null && item.limit !== '' ? item.limit : '';

        div.innerHTML = `
            <div class="cat-row-grid-v2">
                <div class="cat-select-wrapper-v2">
                    <select class="settings-select-v2 budget-category-select">
                        <option value="">-- Select Category --</option>
                        ${availableCategories.map(c => `
                            <option value="${c.name}" data-id="${c._id || c.id || ''}" ${c.name === selCatName ? 'selected' : ''}>
                                ${c.name}
                            </option>
                        `).join('')}
                    </select>
                </div>
                <div class="cat-limit-wrapper-v2">
                    <span class="cat-currency-symbol-v2">₹</span>
                    <input type="number" class="settings-input-v2 cat-limit-input-v2 budget-limit-input" placeholder="Limit e.g. 5000" min="0" value="${limitVal}">
                </div>
                <button type="button" class="cat-remove-btn-v2 budget-remove-btn" title="Remove Category Limit">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
        `;

        const removeBtn = div.querySelector('.budget-remove-btn');

        removeBtn.addEventListener('click', () => {
            div.remove();
            if (container) {
                const remainingRows = container.querySelectorAll('.category-budget-row-v2');
                if (remainingRows.length === 0) {
                    const emptyMsg = document.createElement('div');
                    emptyMsg.className = 'empty-category-v2';
                    emptyMsg.id = 'emptyCategoryBudgetsMsg';
                    emptyMsg.innerHTML = `
                        <div class="empty-icon-v2">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                            </svg>
                        </div>
                        <h3>No Category Limits Configured</h3>
                        <p>Set specific caps on Food, Transport, Shopping, or Utilities to track expenses automatically.</p>
                    `;
                    container.appendChild(emptyMsg);
                }
            }
        });

        return div;
    }

    const addBtn = document.getElementById('addCategoryBudgetBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const emptyMsg = document.getElementById('emptyCategoryBudgetsMsg');
            if (emptyMsg) emptyMsg.remove();

            if (container) {
                const newRow = createCategoryBudgetRow();
                container.appendChild(newRow);
                const selectEl = newRow.querySelector('.budget-category-select');
                if (selectEl) selectEl.focus();
            }
        });
    }

    const saveTargetBtn = document.getElementById('saveSpendingTargetBtn');
    if (saveTargetBtn) {
        saveTargetBtn.addEventListener('click', async () => {
            const overallVal = Number(document.getElementById('overallBudgetInput')?.value) || 0;

            const categoryRows = container ? container.querySelectorAll('.category-budget-row-v2, .category-budget-row') : [];
            const categoryBudgetsList = [];

            categoryRows.forEach(row => {
                const selectEl = row.querySelector('.budget-category-select');
                const limitEl = row.querySelector('.budget-limit-input');

                const catName = selectEl?.value?.trim();
                const selectedOption = selectEl?.options[selectEl.selectedIndex];
                const catId = selectedOption ? selectedOption.getAttribute('data-id') || '' : '';
                const limitNum = Number(limitEl?.value) || 0;

                if (catName && limitNum > 0) {
                    categoryBudgetsList.push({
                        categoryId: catId,
                        categoryName: catName,
                        limit: limitNum
                    });
                }
            });

            saveTargetBtn.disabled = true;
            saveTargetBtn.innerHTML = `
                <svg class="spinner" viewBox="0 0 50 50" style="width: 16px; height: 16px; animation: spin 1s linear infinite; margin-right: 4px;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                Saving...
            `;

            const success = await saveBudget({
                overallBudget: overallVal,
                categoryBudgets: categoryBudgetsList
            });

            saveTargetBtn.disabled = false;
            saveTargetBtn.innerHTML = `<span>Save Target</span>`;

            if (success) {
                renderBudgetLimits();
            }
        });
    }

    const saveBtn = document.getElementById('saveBudgetBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const overallVal = Number(document.getElementById('overallBudgetInput')?.value) || 0;

            const categoryRows = container ? container.querySelectorAll('.category-budget-row-v2, .category-budget-row') : [];
            const categoryBudgetsList = [];

            categoryRows.forEach(row => {
                const selectEl = row.querySelector('.budget-category-select');
                const limitEl = row.querySelector('.budget-limit-input');

                const catName = selectEl?.value?.trim();
                const selectedOption = selectEl?.options[selectEl.selectedIndex];
                const catId = selectedOption ? selectedOption.getAttribute('data-id') || '' : '';
                const limitNum = Number(limitEl?.value) || 0;

                if (catName && limitNum > 0) {
                    categoryBudgetsList.push({
                        categoryId: catId,
                        categoryName: catName,
                        limit: limitNum
                    });
                }
            });

            saveBtn.disabled = true;
            saveBtn.innerHTML = `
                <svg class="spinner" viewBox="0 0 50 50" style="width: 16px; height: 16px; animation: spin 1s linear infinite; margin-right: 6px;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                Saving...
            `;

            const success = await saveBudget({
                overallBudget: overallVal,
                categoryBudgets: categoryBudgetsList
            });

            saveBtn.disabled = false;
            saveBtn.innerHTML = `Save Changes`;

            if (success) {
                renderBudgetLimits();
            }
        });
    }
}

// --- PROFILE PAGE ---

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function getUserInitials(name) {
    if (!name || !name.trim()) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function renderNotifications() {
    STATE.view = 'settings';
    STATE.settingsSubView = 'notifications';
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;

    HeaderManager.update({
        showBack: true,
        onBack: 'renderSettings',
        backText: 'Back to Settings',
        hideMonthSelector: false
    });

    const main = document.getElementById('mainContent');
    if (!main) return;
    main.className = 'view-container settings-view';

    // Immediate Loading State UI
    main.innerHTML = `
        <div class="settings-container">
            <div class="settings-card loading-card">
                <svg class="spinner" viewBox="0 0 50 50" style="width: 32px; height: 32px; animation: spin 1s linear infinite; margin-bottom: 12px; color: var(--primary);">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                <p style="color: var(--text-muted); font-size: 0.95rem;">Loading notification preferences...</p>
            </div>
        </div>
    `;

    try {
        const data = await fetchAPI(`/api/notifications?month=${STATE.selectedMonth}&year=${STATE.selectedYear}`);

        if (!data || data.success === false) {
            throw new Error(data?.message || 'Failed to fetch notifications');
        }

        const prefs = data.preferences || {
            budgetAlerts: true,
            categoryAlerts: true,
            monthlySummary: true,
            unusualSpending: true,
            alertThreshold: 75
        };

        const notifications = data.notifications || [];

        renderNotificationsUI(prefs, notifications);

    } catch (err) {
        console.error('Fetch notifications error:', err);
        showToast('Unable to load notification settings', 'error');
        renderNotificationsUI({
            budgetAlerts: true,
            categoryAlerts: true,
            monthlySummary: true,
            unusualSpending: true,
            alertThreshold: 75
        }, []);
    }
}

function renderNotificationsUI(prefs, notifications) {
    const main = document.getElementById('mainContent');
    if (!main) return;

    const selectedThreshold = prefs.alertThreshold || 75;

    main.innerHTML = `
        <div class="settings-container notification-settings-container">
            <!-- Page Header -->
            <div class="settings-header">
                <h1 class="settings-title">Notifications</h1>
                <p class="settings-subtitle">Manage your spending alerts and notification preferences.</p>
            </div>

            <!-- Card 1: Notification Preferences -->
            <div class="settings-card notification-card">
                <div class="card-header-with-icon">
                    <div class="card-icon-wrapper">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                            <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                        </svg>
                    </div>
                    <div>
                        <h2 class="settings-card-title">Notification Preferences</h2>
                        <p class="settings-card-desc">Configure automated spending alerts and reports.</p>
                    </div>
                </div>

                <div class="notification-toggle-list">
                    <!-- A. Budget Limit Alerts -->
                    <div class="notification-toggle-row">
                        <div class="toggle-info">
                            <h3 class="toggle-title">Budget Limit Alerts</h3>
                            <p class="toggle-desc">Get notified when your spending reaches your configured budget limits.</p>
                        </div>
                        <label class="switch-toggle" for="budgetAlertsToggle">
                            <input type="checkbox" id="budgetAlertsToggle" ${prefs.budgetAlerts ? 'checked' : ''}>
                            <span class="switch-slider"></span>
                        </label>
                    </div>

                    <!-- B. Category Budget Alerts -->
                    <div class="notification-toggle-row">
                        <div class="toggle-info">
                            <h3 class="toggle-title">Category Budget Alerts</h3>
                            <p class="toggle-desc">Get notified when spending in a category approaches or exceeds its limit.</p>
                        </div>
                        <label class="switch-toggle" for="categoryAlertsToggle">
                            <input type="checkbox" id="categoryAlertsToggle" ${prefs.categoryAlerts ? 'checked' : ''}>
                            <span class="switch-slider"></span>
                        </label>
                    </div>

                    <!-- C. Monthly Spending Summary -->
                    <div class="notification-toggle-row">
                        <div class="toggle-info">
                            <h3 class="toggle-title">Monthly Spending Summary</h3>
                            <p class="toggle-desc">Receive a summary of your spending at the end of each month.</p>
                        </div>
                        <label class="switch-toggle" for="monthlySummaryToggle">
                            <input type="checkbox" id="monthlySummaryToggle" ${prefs.monthlySummary ? 'checked' : ''}>
                            <span class="switch-slider"></span>
                        </label>
                    </div>

                    <!-- D. Unusual Spending Alerts -->
                    <div class="notification-toggle-row">
                        <div class="toggle-info">
                            <h3 class="toggle-title">Unusual Spending Alerts</h3>
                            <p class="toggle-desc">Get notified when your spending is significantly higher than usual.</p>
                        </div>
                        <label class="switch-toggle" for="unusualSpendingToggle">
                            <input type="checkbox" id="unusualSpendingToggle" ${prefs.unusualSpending ? 'checked' : ''}>
                            <span class="switch-slider"></span>
                        </label>
                    </div>
                </div>

                <div class="settings-divider"></div>

                <!-- Alert Threshold Section -->
                <div class="threshold-section">
                    <h3 class="threshold-title">Alert Threshold</h3>
                    <p class="threshold-desc">Choose when you want to receive budget notifications.</p>

                    <div class="threshold-options-grid">
                        <label class="threshold-radio-card ${selectedThreshold === 50 ? 'selected' : ''}">
                            <input type="radio" name="alertThreshold" value="50" ${selectedThreshold === 50 ? 'checked' : ''}>
                            <span class="radio-circle"></span>
                            <span class="threshold-text">50% of budget used</span>
                        </label>

                        <label class="threshold-radio-card ${selectedThreshold === 75 ? 'selected' : ''}">
                            <input type="radio" name="alertThreshold" value="75" ${selectedThreshold === 75 ? 'checked' : ''}>
                            <span class="radio-circle"></span>
                            <span class="threshold-text">75% of budget used</span>
                        </label>

                        <label class="threshold-radio-card ${selectedThreshold === 90 ? 'selected' : ''}">
                            <input type="radio" name="alertThreshold" value="90" ${selectedThreshold === 90 ? 'checked' : ''}>
                            <span class="radio-circle"></span>
                            <span class="threshold-text">90% of budget used</span>
                        </label>

                        <label class="threshold-radio-card ${selectedThreshold === 100 ? 'selected' : ''}">
                            <input type="radio" name="alertThreshold" value="100" ${selectedThreshold === 100 ? 'checked' : ''}>
                            <span class="radio-circle"></span>
                            <span class="threshold-text">100% of budget used</span>
                        </label>
                    </div>
                </div>

                <div class="settings-actions">
                    <button type="button" id="saveNotificationPrefsBtn" class="save-budget-btn-v2">
                        <span>Save Changes</span>
                    </button>
                </div>
            </div>

            <!-- Card 2: Recent Notifications -->
            <div class="settings-card notification-card">
                <div class="card-header-with-icon" style="justify-content: space-between; align-items: center; width: 100%;">
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <div class="card-icon-wrapper">
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="16" y1="13" x2="8" y2="13"></line>
                                <line x1="16" y1="17" x2="8" y2="17"></line>
                                <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                        </div>
                        <div>
                            <h2 class="settings-card-title">Recent Notifications</h2>
                            <p class="settings-card-desc">Your alert log for ${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}</p>
                        </div>
                    </div>

                    ${notifications.some(n => !n.isRead) ? `
                        <button type="button" id="markAllReadBtn" class="mark-all-read-btn">
                            Mark all as read
                        </button>
                    ` : ''}
                </div>

                <div id="notificationsListContainer" class="notifications-list">
                    ${notifications.length === 0 ? `
                        <div class="empty-notifications-state">
                            <div class="empty-notifications-icon">
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                                </svg>
                            </div>
                            <h3>No notifications yet</h3>
                            <p>You're all caught up.</p>
                        </div>
                    ` : notifications.map(item => renderNotificationItemHTML(item)).join('')}
                </div>
            </div>
        </div>
    `;

    attachNotificationEventListeners();
}

function renderNotificationItemHTML(item) {
    const isUnread = !item.isRead;
    const dateObj = new Date(item.createdAt);
    const dateStr = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    let iconSvg = '';
    if (item.type === 'budget') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path></svg>`;
    } else if (item.type === 'category') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>`;
    } else if (item.type === 'summary') {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>`;
    } else {
        iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
    }

    return `
        <div class="notification-item ${isUnread ? 'unread' : ''}" data-id="${item._id}">
            <div class="notification-item-icon ${item.type}">
                ${iconSvg}
            </div>
            <div class="notification-item-content">
                <div class="notification-item-header">
                    <h4 class="notification-item-title">${escapeHtml(item.title)}</h4>
                    <span class="notification-item-time">${dateStr}</span>
                </div>
                <p class="notification-item-msg">${escapeHtml(item.message)}</p>
            </div>
            <div class="notification-item-actions">
                ${isUnread ? `
                    <button type="button" class="mark-read-btn" onclick="markSingleNotificationRead('${item._id}')" title="Mark as read">
                        <span class="unread-dot"></span>
                    </button>
                ` : ''}
                <button type="button" class="delete-note-btn" onclick="deleteSingleNotification('${item._id}')" title="Delete notification">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
    `;
}

function attachNotificationEventListeners() {
    const radioCards = document.querySelectorAll('.threshold-radio-card');
    radioCards.forEach(card => {
        const input = card.querySelector('input[type="radio"]');
        if (input) {
            input.addEventListener('change', () => {
                radioCards.forEach(c => c.classList.remove('selected'));
                if (input.checked) card.classList.add('selected');
            });
        }
    });

    const saveBtn = document.getElementById('saveNotificationPrefsBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
            const budgetAlerts = document.getElementById('budgetAlertsToggle')?.checked ?? true;
            const categoryAlerts = document.getElementById('categoryAlertsToggle')?.checked ?? true;
            const monthlySummary = document.getElementById('monthlySummaryToggle')?.checked ?? true;
            const unusualSpending = document.getElementById('unusualSpendingToggle')?.checked ?? true;

            const selectedRadio = document.querySelector('input[name="alertThreshold"]:checked');
            const alertThreshold = Number(selectedRadio?.value) || 75;

            saveBtn.disabled = true;
            saveBtn.innerHTML = `
                <svg class="spinner" viewBox="0 0 50 50" style="width: 18px; height: 18px; animation: spin 1s linear infinite; margin-right: 6px;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                Saving...
            `;

            try {
                const data = await fetchAPI('/api/notifications/preferences', {
                    method: 'PUT',
                    body: JSON.stringify({
                        budgetAlerts,
                        categoryAlerts,
                        monthlySummary,
                        unusualSpending,
                        alertThreshold
                    })
                });

                if (data && data.success) {
                    showToast('Notification preferences updated.', 'success');
                    setTimeout(() => renderNotifications(), 400);
                } else {
                    showToast(data?.message || 'Failed to save notification preferences', 'error');
                }
            } catch (err) {
                console.error('Save notification preferences error:', err);
                showToast('Server error saving notification preferences', 'error');
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerHTML = '<span>Save Changes</span>';
            }
        });
    }

    const markAllBtn = document.getElementById('markAllReadBtn');
    if (markAllBtn) {
        markAllBtn.addEventListener('click', async () => {
            try {
                const data = await fetchAPI('/api/notifications/read-all', { method: 'PUT' });
                if (data && data.success) {
                    showToast('All notifications marked as read', 'success');
                    renderNotifications();
                }
            } catch (err) {
                console.error('Mark all read error:', err);
            }
        });
    }
}

window.markSingleNotificationRead = async function(id) {
    try {
        const data = await fetchAPI(`/api/notifications/${id}/read`, { method: 'PUT' });
        if (data && data.success) {
            renderNotifications();
        }
    } catch (err) {
        console.error('Mark read error:', err);
    }
};

window.deleteSingleNotification = async function(id) {
    try {
        const data = await fetchAPI(`/api/notifications/${id}`, { method: 'DELETE' });
        if (data && data.success) {
            showToast('Notification removed.', 'info');
            renderNotifications();
        }
    } catch (err) {
        console.error('Delete notification error:', err);
    }
};

// --- BROWSER PUSH NOTIFICATIONS ---
async function checkAndShowPushNotifications() {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;
    if (!STATE.isLoggedIn) return;

    try {
        const data = await fetchAPI(`/api/notifications?month=${STATE.selectedMonth}&year=${STATE.selectedYear}`);
        if (data && data.success && data.notifications) {
            let shownIds = [];
            try {
                shownIds = JSON.parse(localStorage.getItem('shown_notifications') || '[]');
            } catch (e) {
                shownIds = [];
            }

            let newlyShown = false;

            data.notifications.forEach(note => {
                if (!note.isRead && !shownIds.includes(note._id)) {
                    // Show standard OS push notification in notification bar
                    const pushNote = new Notification(note.title || 'Paperless Alert', {
                        body: note.message,
                        icon: '/Logo2.png',
                        badge: '/Logo2.png',
                        requireInteraction: true
                    });

                    pushNote.onclick = function() {
                        window.focus();
                        renderNotifications();
                        pushNote.close();
                    };

                    shownIds.push(note._id);
                    newlyShown = true;
                }
            });

            if (newlyShown) {
                localStorage.setItem('shown_notifications', JSON.stringify(shownIds));
            }
        }
    } catch (err) {
        console.error('Error checking push notifications:', err);
    }
}

function getUserInitials(name) {
    if (!name || !name.trim()) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) {
        return parts[0].substring(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatMemberSince(dateStr) {
    if (!dateStr) return 'N/A';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return 'N/A';
        return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch (e) {
        return 'N/A';
    }
}

async function renderProfile() {
    STATE.view = 'profile';
    STATE.activeCategory = null;

    HeaderManager.update({
        showBack: true,
        onBack: 'renderDashboard',
        hideMonthSelector: true
    });

    const main = document.getElementById('mainContent');
    main.className = 'view-container profile-view-wrapper profile-view';
    main.innerHTML = `
        <div class="profile-view">
            <div class="profile-loading-state">
                <div class="profile-spinner"></div>
                <p style="color: var(--text-muted); font-weight: 500;">Loading profile information...</p>
            </div>
        </div>
    `;

    try {
        const res = await fetchAPI('/api/user/profile');
        if (!res || !res.success || !res.user) {
            throw new Error(res?.message || 'Unable to load profile.');
        }

        const user = res.user;
        STATE.currentUser = user; // Cache profile in STATE

        const initials = getUserInitials(user.name);
        const memberSinceFormatted = formatMemberSince(user.createdAt);
        const loginMethod = user.authProvider || (user.googleId ? 'Google' : 'Email & Password');

        const avatarHtml = user.profilePic
            ? `<img src="${escapeHtml(user.profilePic)}" class="profile-avatar" alt="${escapeHtml(user.name)}" />`
            : `<div class="profile-avatar-fallback">${escapeHtml(initials)}</div>`;

        main.innerHTML = `
            <div class="profile-view">
                <!-- Profile Header -->
                <div class="profile-header-card">
                    <div class="profile-avatar-wrapper">
                        ${avatarHtml}
                    </div>
                    <h2 class="profile-name">${escapeHtml(user.name)}</h2>
                    <p class="profile-email">${escapeHtml(user.email)}</p>
                    <button class="profile-edit-btn" onclick="openEditProfileModal()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                        </svg>
                        Edit Profile
                    </button>
                </div>

                <!-- Personal Information -->
                <div class="profile-section-card">
                    <h3 class="profile-section-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                            <circle cx="12" cy="7" r="4"></circle>
                        </svg>
                        Personal Information
                    </h3>
                    <div class="profile-field-grid">
                        <div class="profile-field-row">
                            <div class="profile-field-info">
                                <span class="profile-field-label">Full Name</span>
                                <span class="profile-field-value">${escapeHtml(user.name)}</span>
                            </div>
                            <button class="profile-field-edit-btn" onclick="openEditProfileModal()">Edit</button>
                        </div>
                        <div class="profile-field-row">
                            <div class="profile-field-info">
                                <span class="profile-field-label">Email Address</span>
                                <span class="profile-field-value">${escapeHtml(user.email)}</span>
                            </div>
                        </div>
                        <div class="profile-field-row">
                            <div class="profile-field-info">
                                <span class="profile-field-label">Phone Number</span>
                                <span class="profile-field-value ${user.phone ? '' : 'empty'}">${user.phone ? escapeHtml(user.phone) : 'Not added'}</span>
                            </div>
                            <button class="profile-field-edit-btn" onclick="openEditProfileModal()">Edit</button>
                        </div>
                    </div>
                </div>

                <!-- Account Information -->
                <div class="profile-section-card">
                    <h3 class="profile-section-title">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                            <line x1="16" y1="2" x2="16" y2="6"></line>
                            <line x1="8" y1="2" x2="8" y2="6"></line>
                            <line x1="3" y1="10" x2="21" y2="10"></line>
                        </svg>
                        Account Information
                    </h3>
                    <div class="profile-field-grid">
                        <div class="profile-field-row">
                            <div class="profile-field-info">
                                <span class="profile-field-label">Member Since</span>
                                <span class="profile-field-value">${escapeHtml(memberSinceFormatted)}</span>
                            </div>
                        </div>
                        <div class="profile-field-row">
                            <div class="profile-field-info">
                                <span class="profile-field-label">Login Method</span>
                                <span class="profile-badge">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                                    </svg>
                                    ${escapeHtml(loginMethod)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Error rendering profile:', err);
        main.innerHTML = `
            <div class="profile-view">
                <div class="profile-error-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-bottom: 0.75rem;">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <h3 style="color: var(--text-main); margin-bottom: 0.5rem;">Failed to load profile</h3>
                    <p style="color: var(--text-muted); margin-bottom: 1.25rem;">${escapeHtml(err.message || 'Error communicating with server.')}</p>
                    <button class="profile-edit-btn" onclick="renderProfile()">Retry</button>
                </div>
            </div>
        `;
    }
}

function openEditProfileModal() {
    const user = STATE.currentUser || {};
    STATE.tempProfilePic = user.profilePic || '';

    const overlay = document.getElementById('moduleOverlay');
    const panelContent = document.getElementById('panelContent');

    if (!overlay || !panelContent) return;

    const initials = getUserInitials(user.name);
    const hasPic = !!STATE.tempProfilePic;

    panelContent.innerHTML = `
        <div class="profile-modal-container">
            <div class="profile-modal-header">
                <h2>Edit Profile</h2>
                <button class="close-circle" onclick="closeModule()" aria-label="Close modal">
                    <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <use href="#icon-x"></use>
                    </svg>
                </button>
            </div>

            <form class="profile-edit-form" onsubmit="event.preventDefault(); saveProfileChanges();">
                <!-- Avatar Upload Section -->
                <div class="profile-upload-section">
                    <div id="profilePreviewContainer">
                        ${hasPic
                            ? `<img src="${escapeHtml(STATE.tempProfilePic)}" id="profilePicPreview" class="profile-preview-avatar" alt="Preview" />`
                            : `<div id="profilePicPreviewFallback" class="profile-avatar-fallback" style="width:84px; height:84px; font-size:1.8rem;">${escapeHtml(initials)}</div>`
                        }
                    </div>
                    <input type="file" id="profilePicInput" accept="image/png, image/jpeg, image/jpg, image/webp" style="display:none;" onchange="handleProfilePicChange(event)" />
                    <div class="profile-upload-controls">
                        <button type="button" class="upload-btn" onclick="document.getElementById('profilePicInput').click()">Choose Photo</button>
                        <button type="button" class="remove-btn" id="removePicBtn" onclick="handleRemoveProfilePic()" style="${hasPic ? '' : 'display:none;'}">Remove</button>
                    </div>
                </div>

                <!-- Inputs -->
                <div class="profile-input-group">
                    <label for="editProfileName">Full Name</label>
                    <input type="text" id="editProfileName" class="profile-input" value="${escapeHtml(user.name || '')}" placeholder="Enter your full name" required maxlength="100" />
                </div>

                <div class="profile-input-group">
                    <label for="editProfileEmail">Email Address (Read-only)</label>
                    <input type="email" id="editProfileEmail" class="profile-input" value="${escapeHtml(user.email || '')}" readonly />
                </div>

                <div class="profile-input-group">
                    <label for="editProfilePhone">Phone Number (Optional)</label>
                    <input type="tel" id="editProfilePhone" class="profile-input" value="${escapeHtml(user.phone || '')}" placeholder="e.g. +91 98765 43210" maxlength="25" />
                </div>

                <!-- Actions -->
                <div class="profile-modal-actions">
                    <button type="button" class="profile-modal-cancel" onclick="closeModule()">Cancel</button>
                    <button type="submit" class="profile-modal-save" id="saveProfileBtn">Save Changes</button>
                </div>
            </form>
        </div>
    `;

    overlay.classList.add('active');
}

function handleProfilePicChange(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    const validTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
        showToast('Invalid file format. Please upload PNG, JPG, or WEBP.', 'error');
        return;
    }

    if (file.size > 5 * 1024 * 1024) {
        showToast('Image size exceeds 5MB limit.', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        const base64Data = e.target.result;
        STATE.tempProfilePic = base64Data;

        const container = document.getElementById('profilePreviewContainer');
        if (container) {
            container.innerHTML = `<img src="${escapeHtml(base64Data)}" id="profilePicPreview" class="profile-preview-avatar" alt="Preview" />`;
        }

        const removeBtn = document.getElementById('removePicBtn');
        if (removeBtn) removeBtn.style.display = 'inline-block';
    };
    reader.onerror = function () {
        showToast('Error reading image file.', 'error');
    };
    reader.readAsDataURL(file);
}

function handleRemoveProfilePic() {
    STATE.tempProfilePic = '';

    const user = STATE.currentUser || {};
    const name = document.getElementById('editProfileName')?.value || user.name || '';
    const initials = getUserInitials(name);

    const container = document.getElementById('profilePreviewContainer');
    if (container) {
        container.innerHTML = `<div id="profilePicPreviewFallback" class="profile-avatar-fallback" style="width:90px; height:90px; font-size:2rem;">${escapeHtml(initials)}</div>`;
    }

    const removeBtn = document.getElementById('removePicBtn');
    if (removeBtn) removeBtn.style.display = 'none';

    // Clear input element value
    const input = document.getElementById('profilePicInput');
    if (input) input.value = '';
}

async function saveProfileChanges() {
    const nameInput = document.getElementById('editProfileName');
    const phoneInput = document.getElementById('editProfilePhone');
    const saveBtn = document.getElementById('saveProfileBtn');

    const name = nameInput ? nameInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';

    if (!name) {
        showToast('Full Name cannot be empty.', 'error');
        if (nameInput) nameInput.focus();
        return;
    }

    if (phone && !/^[+\d\s()-]{5,25}$/.test(phone)) {
        showToast('Please enter a valid phone number.', 'error');
        if (phoneInput) phoneInput.focus();
        return;
    }

    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';
    }

    try {
        const payload = {
            name,
            phone,
            profilePic: STATE.tempProfilePic
        };

        const res = await fetchAPI('/api/user/profile', {
            method: 'PUT',
            body: JSON.stringify(payload)
        });

        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to update profile');
        }

        showToast('Profile updated successfully!', 'success');
        closeModule();

        // Refresh profile page UI immediately
        renderProfile();
    } catch (err) {
        console.error('Error saving profile:', err);
        showToast(err.message || 'Error updating profile', 'error');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Save Changes';
        }
    }
}

// --- ANALYTICS PAGE ---
async function renderAnalytics() {
    STATE.view = 'analytics';
    STATE.activeCategory = null;

    // Update Header (Show Month Selector)
    const isMobile = window.innerWidth <= 768;
    HeaderManager.update({
        showBack: true,
        onBack: 'renderDashboard',
        hideMonthSelector: false // Always show month selector for analytics
    });

    const main = document.getElementById('mainContent');
    main.className = 'view-container analytics-view';

    // Loading State
    main.innerHTML = `
        <div class="loading-state-container" style="height: 60vh; display:flex; flex-direction:column; align-items:center; justify-content:center; color: var(--text-muted);">
             <svg class="spinner" viewBox="0 0 50 50" style="width: 40px; height: 40px; animation: spin 1s linear infinite; margin-bottom: 16px;">
                <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
            </svg>
             <p>Analyzing expenses...</p>
        </div>
    `;

    try {
        // 1. Fetch Data
        // Current Month
        const currentMonthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
        const currentMonthData = await fetchAPI(`/api/entries?month=${currentMonthStr}`);

        // Monthly Trend (12 Months)
        const trendData = await fetchAPI('/api/entries/monthly-trend').catch(err => {
            console.error('Failed to fetch monthly trend:', err);
            return [];
        });

        // Previous Month
        let prevM = STATE.selectedMonth - 1;
        let prevY = STATE.selectedYear;
        if (prevM < 0) { prevM = 11; prevY--; }
        const prevMonthStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}`;
        const prevMonthData = await fetchAPI(`/api/entries?month=${prevMonthStr}`);

        // 2. Process Data

        // Chart 1: Monthly Spending Trend across 12 months for selected year
        const shortMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sept', 'Oct', 'Nov', 'Dec'];
        const yearShort = String(STATE.selectedYear).slice(-2);
        const trendMap = {};
        if (Array.isArray(trendData)) {
            trendData.forEach(t => {
                if (t && t.month) trendMap[t.month] = t;
            });
        }

        const trendLabels = [];
        const trendValues = [];
        const trendMonthNums = [];

        for (let m = 1; m <= 12; m++) {
            const key = `${STATE.selectedYear}-${String(m).padStart(2, '0')}`;
            trendLabels.push(`${shortMonthNames[m - 1]} ${yearShort}`);
            trendValues.push(trendMap[key] ? (trendMap[key].total || 0) : 0);
            trendMonthNums.push(m);
        }

        const currentTotal = currentMonthData.reduce((sum, e) => sum + e.amount, 0);
        const yearTotal = trendValues.reduce((sum, v) => sum + v, 0);

        // Chart 2: Category Distribution (Current Month)
        // Need to map IDs to Names if necessary, but fetch API usually populates names or we have STATE.categories
        // Wait, entries might have categoryName or we look it up.
        // Let's ensure we have categories loaded
        if (STATE.categories.length === 0) await fetchCategories();

        const categoryStats = {};
        currentMonthData.forEach(e => {
            // Priority: categoryName -> itemName (for Milk) -> subCategory -> "Other"
            // Actually better to use parent Category for the Pie chart as per requirement "Category-wise Expense Distribution"

            let catName = 'Other';
            if (e.itemName === 'Milk' || e.type === 'milk') catName = 'Milk';
            else if (e.parentCategory) catName = e.parentCategory;
            else if (e.categoryId) {
                const cat = STATE.categories.find(c => c._id === e.categoryId || c.id === e.categoryId);
                if (cat) catName = cat.parentCategory || cat.name;
            }

            // Normalize
            if (!catName) catName = 'Other';

            if (!categoryStats[catName]) categoryStats[catName] = 0;
            categoryStats[catName] += e.amount;
        });

        // Chart 3: Spending Trend (Current Month)
        const daysInMonth = new Date(STATE.selectedYear, STATE.selectedMonth + 1, 0).getDate();
        const dailyTrend = new Array(daysInMonth).fill(0);

        currentMonthData.forEach(e => {
            const d = toIST(e.date).getDate(); // 1-31 — extracted in IST
            if (d >= 1 && d <= daysInMonth) {
                dailyTrend[d - 1] += e.amount;
            }
        });

        // 3. Render Structure
        const currentMonthName = MONTHS[STATE.selectedMonth];
        const prevMonthName = MONTHS[prevM];

        // Empty State Handler
        const hasAnyYearData = trendValues.some(v => v > 0);
        const hasAnyHistoryData = Array.isArray(trendData) && trendData.some(t => (t.total || 0) > 0);
        if (!hasAnyYearData && !hasAnyHistoryData && currentMonthData.length === 0) {
            main.innerHTML = `
                <div class="analytics-empty-state">
                    <div class="empty-icon">
                        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>
                    </div>
                    <h3>No Data Available</h3>
                    <p>There are no expenses recorded yet.</p>
                    <button class="action-btn primary" onclick="renderDashboard()">Go to Dashboard</button>
                </div>
            `;
            return;
        }

        main.innerHTML = `
            <div class="analytics-container">
                <div class="analytics-header-row">
                    <h2>Analytics & Insights</h2>
                    <p class="subtitle">Overview for ${currentMonthName} ${STATE.selectedYear}</p>
                </div>

                <div class="charts-grid">
                    <!-- Monthly Spending Trend (12 Months, Clickable) -->
                    <div class="chart-card">
                        <div class="chart-header">
                            <div>
                                <h3>Monthly Spending Trend</h3>
                                <p style="font-size: 0.78rem; color: var(--text-muted); margin-top: 2px;">Click bar to view category breakdown</p>
                            </div>
                            <p>Year Total: <span style="font-weight: 700; color: var(--primary);">₹${yearTotal.toLocaleString('en-IN')}</span></p>
                        </div>
                        <div class="chart-canvas-wrapper">
                            <canvas id="comparisonChart"></canvas>
                        </div>
                    </div>

                    <!-- Category Distribution -->
                    <div class="chart-card">
                        <div class="chart-header">
                            <h3>Expense Distribution</h3>
                            <p>${currentMonthName} ${STATE.selectedYear}</p>
                        </div>
                        <div class="chart-canvas-wrapper">
                            <canvas id="distributionChart"></canvas>
                        </div>
                    </div>

                    <!-- Daily Trend -->
                    <div class="chart-card full-width">
                        <div class="chart-header">
                            <h3>Spending Trend</h3>
                            <p>Daily breakdown for ${currentMonthName} ${STATE.selectedYear}</p>
                        </div>
                        <div class="chart-canvas-wrapper wide">
                            <canvas id="trendChart"></canvas>
                        </div>
                    </div>
                </div>
            </div>
        `;

        // 4. Initialize Charts
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: { family: 'Outfit', size: 12 },
                        boxWidth: 12,
                        padding: 15,
                        color: document.body.classList.contains('dark-theme') ? '#9ca3af' : '#64748b'
                    }
                },
                tooltip: {
                    mode: 'index',
                    intersect: false,
                    backgroundColor: document.body.classList.contains('dark-theme') ? '#1e293b' : '#ffffff',
                    titleColor: document.body.classList.contains('dark-theme') ? '#f1f5f9' : '#0f172a',
                    bodyColor: document.body.classList.contains('dark-theme') ? '#cbd5e1' : '#334155',
                    borderColor: document.body.classList.contains('dark-theme') ? '#334155' : '#e2e8f0',
                    borderWidth: 1,
                    padding: 10,
                    callbacks: {
                        label: function (context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed.y);
                            } else if (context.parsed !== null) {
                                // For Pie charts where data is parsed differently
                                label += new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(context.parsed);
                            }
                            return label;
                        }
                    }
                }
            }
        };

        const textColor = document.body.classList.contains('dark-theme') ? '#cbd5e1' : '#64748b';
        const gridColor = document.body.classList.contains('dark-theme') ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)';

        // Chart 1: Monthly Spending Trend (12 Months, Clickable)
        const isDark = document.body.classList.contains('dark-theme');
        const barBg = isDark ? 'rgba(96, 165, 250, 0.55)' : 'rgba(99, 102, 241, 0.65)';
        const barBorder = isDark ? 'rgba(96, 165, 250, 1)' : 'rgba(99, 102, 241, 1)';
        const barHoverBg = isDark ? 'rgba(124, 106, 247, 0.8)' : 'rgba(79, 70, 229, 0.85)';
        const barHoverBorder = isDark ? 'rgba(124, 106, 247, 1)' : 'rgba(79, 70, 229, 1)';

        new Chart(document.getElementById('comparisonChart'), {
            type: 'bar',
            data: {
                labels: trendLabels,
                datasets: [{
                    label: 'Monthly Spending',
                    data: trendValues,
                    backgroundColor: barBg,
                    borderColor: barBorder,
                    borderWidth: 1,
                    borderRadius: 4,
                    hoverBackgroundColor: barHoverBg,
                    hoverBorderColor: barHoverBorder,
                    barPercentage: 0.65
                }]
            },
            options: {
                ...commonOptions,
                onClick: (evt, elements) => {
                    if (!elements || !elements.length) return;
                    const index = elements[0].index;
                    const clickedMonth = trendMonthNums[index];
                    if (clickedMonth && typeof openUserMonthBreakdownModal === 'function') {
                        openUserMonthBreakdownModal(STATE.selectedYear, clickedMonth);
                    }
                },
                onHover: (event, chartElement) => {
                    event.native.target.style.cursor = chartElement[0] ? 'pointer' : 'default';
                },
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const val = context.parsed.y !== null ? context.parsed.y : context.raw;
                                return `₹${Number(val).toLocaleString('en-IN')} (Click to view breakdown)`;
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: {
                            color: textColor,
                            callback: v => '₹' + Number(v).toLocaleString('en-IN')
                        }
                    },
                    x: {
                        grid: { color: gridColor },
                        ticks: { color: textColor, font: { size: 10 } }
                    }
                }
            }
        });

        // Chart 2: Distribution
        const catLabels = Object.keys(categoryStats);
        const catValues = Object.values(categoryStats);

        // Dynamic Colors
        const palette = [
            '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
            '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#64748b'
        ];

        new Chart(document.getElementById('distributionChart'), {
            type: 'doughnut',
            data: {
                labels: catLabels,
                datasets: [{
                    data: catValues,
                    backgroundColor: palette.slice(0, catLabels.length),
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                ...commonOptions,
                plugins: {
                    ...commonOptions.plugins,
                    legend: { display: true, position: 'bottom', labels: { ...commonOptions.plugins.legend.labels, boxWidth: 10 } }
                }
            }
        });

        // Chart 3: Trend
        new Chart(document.getElementById('trendChart'), {
            type: 'line',
            data: {
                labels: Array.from({ length: daysInMonth }, (_, i) => i + 1),
                datasets: [{
                    label: 'Daily Spending',
                    data: dailyTrend,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4, // Smooth curve
                    pointRadius: 2,
                    pointHoverRadius: 5
                }]
            },
            options: {
                ...commonOptions,
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor, maxTicksLimit: 10 } // Limit x-axis labels
                    }
                }
            }
        });

    } catch (e) {
        console.error("Analytics Error:", e);
        main.innerHTML = `<div class="error-state"><p>Failed to load analytics data.</p><button onclick="renderAnalytics()">Retry</button></div>`;
    }
}

async function openUserMonthBreakdownModal(year, month) {
    const modal = document.getElementById('userMonthBreakdownModal');
    const titleEl = document.getElementById('userMonthBreakdownTitle');
    const subEl = document.getElementById('userMonthBreakdownSub');
    const contentEl = document.getElementById('userMonthBreakdownContent');
    if (!modal) return;

    titleEl.textContent = 'Loading…';
    subEl.textContent = 'Category & Subcategory Breakdown';
    contentEl.innerHTML = `
        <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
            <div class="spinner" style="width: 26px; height: 26px; margin: 0 auto 10px; border: 3px solid var(--border); border-top-color: var(--primary); border-radius: 50%; animation: spin 1s linear infinite;"></div>
            <div style="font-size: 0.9rem;">Loading category breakdown…</div>
        </div>
    `;
    modal.classList.add('active');

    try {
        const data = await fetchAPI(`/api/entries/monthly-breakdown?year=${year}&month=${month}`);
        if (!data || !data.success) throw new Error(data?.message || 'Failed to fetch breakdown');

        titleEl.textContent = data.monthName || `${month}/${year}`;
        const formattedTotal = '₹' + Number(data.totalSpending || 0).toLocaleString('en-IN');
        subEl.innerHTML = `Total Spending: <span style="font-weight: 700; color: var(--primary);">${formattedTotal}</span> &bull; ${data.entryCount || 0} entries`;

        const { parentGroups = [], standalone = [], totalSpending = 0 } = data;

        if (!parentGroups.length && !standalone.length) {
            contentEl.innerHTML = `
                <div style="text-align: center; padding: 36px 16px; color: var(--text-muted);">
                    <div style="font-size: 1.8rem; margin-bottom: 8px; opacity: 0.6;">📅</div>
                    <div style="font-size: 0.95rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">No spending in ${escapeHtml(data.monthName || `${month}/${year}`)}</div>
                    <div style="font-size: 0.82rem;">Total spending for this month is ₹0</div>
                </div>
            `;
            return;
        }

        let rowsHtml = '';

        // 1. Parent categories with subcategories
        for (const g of parentGroups) {
            const gTotal = '₹' + Number(g.total || 0).toLocaleString('en-IN');
            rowsHtml += `
                <tr style="background: var(--primary-light); border-bottom: 1px solid var(--border);">
                    <td style="padding: 10px 14px; font-weight: 700; color: var(--text-main);">
                        <span style="display: inline-block; padding: 2px 8px; border-radius: 6px; background: rgba(245, 158, 11, 0.15); color: #f59e0b; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase;">${escapeHtml(g.parentName)}</span>
                    </td>
                    <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: var(--text-main); font-size: 0.95rem;">
                        ${gTotal}
                    </td>
                </tr>
            `;

            for (const sub of (g.subcategories || [])) {
                const subTotal = '₹' + Number(sub.total || 0).toLocaleString('en-IN');
                rowsHtml += `
                    <tr style="border-bottom: 1px solid var(--border);">
                        <td style="padding: 8px 14px 8px 30px; font-weight: 500; color: var(--text-muted); font-size: 0.88rem;">
                            <span style="color: var(--text-muted); opacity: 0.6; margin-right: 6px;">↳</span>${escapeHtml(sub.name)}
                        </td>
                        <td style="padding: 8px 14px; text-align: right; font-weight: 600; color: var(--success, #10b981); font-size: 0.88rem;">
                            ${subTotal}
                        </td>
                    </tr>
                `;
            }
        }

        // 2. Standalone categories (no parent)
        for (const s of standalone) {
            const sTotal = '₹' + Number(s.total || 0).toLocaleString('en-IN');
            rowsHtml += `
                <tr style="border-bottom: 1px solid var(--border);">
                    <td style="padding: 11px 14px; font-weight: 500; color: var(--text-main);">
                        ${escapeHtml(s.name)}
                    </td>
                    <td style="padding: 11px 14px; text-align: right; font-weight: 600; color: var(--success, #10b981); font-size: 0.95rem;">
                        ${sTotal}
                    </td>
                </tr>
            `;
        }

        const totalFormatted = '₹' + Number(totalSpending || 0).toLocaleString('en-IN');

        contentEl.innerHTML = `
            <table style="width: 100%; border-collapse: collapse;">
                <thead>
                    <tr>
                        <th style="padding: 10px 14px; text-align: left; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); background: var(--bg-color);">Category / Subcategory</th>
                        <th style="padding: 10px 14px; text-align: right; font-size: 0.75rem; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid var(--border); background: var(--bg-color);">Amount Spent</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr style="background: var(--primary-light);">
                        <td style="padding: 12px 14px; font-weight: 700; color: var(--text-main); font-size: 0.95rem;">Total Spending</td>
                        <td style="padding: 12px 14px; text-align: right; font-weight: 700; color: var(--primary); font-size: 1.05rem;">${totalFormatted}</td>
                    </tr>
                </tfoot>
            </table>
        `;
    } catch (err) {
        console.error('Error opening user month breakdown modal:', err);
        contentEl.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--error, #ef4444);">Failed to load monthly breakdown.</div>`;
    }
}

function closeUserMonthBreakdownModal() {
    const modal = document.getElementById('userMonthBreakdownModal');
    if (!modal) return;
    modal.classList.remove('active');
}
window.openUserMonthBreakdownModal = openUserMonthBreakdownModal;
window.closeUserMonthBreakdownModal = closeUserMonthBreakdownModal;

async function renderDashboard() {
    STATE.view = 'dashboard';
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;
    STATE.activeCategory = null;
    STATE.activeSubcategory = null;
    const main = document.getElementById('mainContent');
    // REMOVED immediate class reset to prevent jump
    if (main) main.classList.remove('compact-view');

    // Unified Header Update
    HeaderManager.update({ showBack: false });

    // --- PARALLEL FETCHING START ---
    // Start fetching entries immediately for the background
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    const entriesPromise = fetchAPI(`/api/entries?month=${monthStr}`).catch(e => {
        console.error("Failed to fetch entries", e);
        return [];
    });

    // RENDER LOADING STATE IMMEDIATELY
    // Only if not already present or if we want to ensure feedback
    main.innerHTML = `
        <div class="category-grid" id="dashboardLoadingGrid">
             <div class="loading-state-container" style="grid-column: 1/-1; display:flex; flex-direction:column; align-items:center; justify-content:center; padding: 3rem; color: var(--text-muted); min-height: 200px;">
                 <svg class="spinner" viewBox="0 0 50 50" style="width: 32px; height: 32px; animation: spin 1s linear infinite; margin-bottom: 12px;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                 <p style="margin:0; font-weight:500;">Loading categories...</p>
             </div>
        </div>
        
        <div class="stats-container">
            <div class="stat-card">
                <h3>Total Monthly Spending</h3>
                <div class="value" id="dashboardTotalValue"><span style="font-size: 1rem; color: var(--text-muted);">Loading...</span></div>
                <div class="trend">
                     <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline></svg>
                    Current Month Status
                </div>
            </div>
        </div>
    `;

    // Fetch categories for dashboard (Critical Path)
    // Now fetches top-level categories (parentCategory: null) and parent categories (isParent: true)
    let categories = await fetchCategories('', true);
    // Use defaults if none found from API
    if (categories.length === 0) {
        // If API returns empty (new user?), will be seeded automatically on next request
    } else {
        STATE.categories = categories; // Update local state
    }

    // With the new structure, all dashboard categories come from API
    // No need to filter out Misc/Savings or inject them manually
    let dashboardList = categories;

    // --- SORTING LOGIC ---
    // 1. Extract Special Categories
    const milkCat = dashboardList.find(c => c.name === 'Milk');
    const miscCat = dashboardList.find(c => c.name === 'Miscellaneous' && c.isParent);
    const savingsCat = dashboardList.find(c => c.name === 'Savings' && c.isParent);

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
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="6" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="18" r="1.5"></circle></svg>
                        </button>
                        <div id="menu-${cat._id || cat.id}" class="card-dropdown-menu">
                            <button onclick="editCategory(event, '${cat._id || cat.id}', '${cat.name.replace(/'/g, "\\'")}')">Rename</button>
                            ${(!cat.isParent && cat.name !== 'Milk') ?
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

    // COMPACT VIEW TOGGLE REMOVED - Applied only on success now

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

    // Force-find or Create Cat for Special IDs if missing
    if (!cat) {
        if (id === 'miscellaneous') cat = { name: 'Miscellaneous', id: 'miscellaneous', _id: 'miscellaneous', icon: 'more-horizontal' };
        else if (id === 'savings') cat = { name: 'Savings', id: 'savings', _id: 'savings', icon: 'more-horizontal' };
        else if (id === 'milk') cat = { name: 'Milk', id: 'milk', type: 'milk', icon: 'truck' };
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
        // For top-level categories, use the category name or ID
        // For parent categories (Misc/Savings), entries are associated with subcategories
        if (cat.isParent) {
            // For parent categories, fetch entries for all their subcategories
            recentExpenses = await fetchAPI(`/api/entries?parentCategory=${encodeURIComponent(cat.name)}&month=${monthStr}&_t=${Date.now()}`);
        } else {
            // For top-level categories, they might not have a parentCategory set
            // So we need to find entries by category name or _id
            recentExpenses = await fetchAPI(`/api/entries?categoryId=${cat._id}&month=${monthStr}&_t=${Date.now()}`);
            // If that fails, try by name (for backward compatibility)
            if (recentExpenses.length === 0) {
                recentExpenses = await fetchAPI(`/api/entries?parentCategory=${encodeURIComponent(cat.name)}&month=${monthStr}&_t=${Date.now()}`);
            }
        }
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
        main.classList.remove('dashboard-view');
        main.classList.remove('milk-view');
        // Apply Compact View
        if (cat.name === 'Savings' || cat.name === 'Miscellaneous') main.classList.add('compact-view');
        else main.classList.remove('compact-view');
    }

    main.innerHTML = `
        <div class="category-overhaul-wrapper">
        <div class="overhaul-header" style="margin: 0.25rem 0 0.25rem 0; ${window.innerWidth <= 768 ? 'margin-bottom: 0.5rem;' : ''}">
            <div class="overhaul-tabs-row">
                <div class="header-left-col" style="display: flex; justify-content: flex-start; min-width: 44px;">
                    <!-- Desktop Back Button -->
                    <button class="back-btn-v3 desktop-only" onclick="renderDashboard()">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"></path><path d="M12 19l-7-7 7-7"></path></svg>
                        Back
                    </button>
                    <!-- Mobile Back Button Removed (Now in main header) -->
                </div>
                <div class="header-center-col" style="flex: 1;">
                    <!-- Title Removed as per request -->
                </div>
                <div class="header-right-col" style="min-width: 44px;"></div>
            </div>
        </div>
        
        <div class="category-grid subcategory-grid">
            ${subs.map(sub => `
                <div class="category-card sub-card" onclick="openModule('${sub.name}', '${sub._id}')">
                    <div class="card-menu-container">
                        <button class="card-menu-btn" onclick="toggleCardMenu(event, '${sub._id}')">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="12" r="1.2"></circle><circle cx="12" cy="12" r="1.2"></circle><circle cx="18" cy="12" r="1.2"></circle></svg>
                        </button>
                        <div id="menu-${sub._id}" class="card-dropdown-menu">
                            <button onclick="editCategory(event, '${sub._id}', '${sub.name.replace(/'/g, "\\'")}')">Rename</button>
                             ${(sub.name !== 'Miscellaneous' && sub.name !== 'Savings') ?
            `<button class="delete-option" onclick="handleDeleteCategory(event, '${sub._id}')">Delete</button>` : ''}
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

        <div class="recent-expenses-container overhaul-v2" style="max-height: 250px; min-height: auto; margin-top: 0.5rem; padding: 1rem 1.5rem; overflow: hidden;">
            <div class="recent-expenses-header">Recent Expenses in ${cat.name}</div>
            <div class="history-scroller" style="max-height: 180px; overflow-y: auto;">
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
                            <div class="history-right" style="position: relative;">
                                <span class="history-amount">₹${exp.amount.toLocaleString()}</span>
                                <div class="card-menu-container" style="position: relative; flex-shrink: 0; margin-left: 0.5rem; top: auto; right: auto;">
                                     <button class="card-menu-btn" style="opacity: 1;" onclick="toggleHistoryMenu(event, '${exp._id}', '${id}', '${(exp.itemName || exp.subCategory || 'New Entry').replace(/'/g, "\\'")}')">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join('') : `<p style="text-align: center; color: var(--text-muted); padding: 0.5rem 0;">No recent expenses in ${cat.name}.</p>`}
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

    // Do not navigate to Dashboard if closing modal from Profile, About, Friends, Settings, or custom views
    if (STATE.view === 'profile' || STATE.view === 'about' || STATE.view === 'friends' || STATE.view === 'friend-details' || STATE.view === 'settings') {
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
    STATE.activeCategory = null; // Reset active category so global export is triggered
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    let allEntries = [];

    // Reset filter state on fresh render
    STATE.summaryFilter = STATE.summaryFilter || 'All';

    try {
        allEntries = await fetchAPI(`/api/entries?month=${monthStr}`);
        allEntries.sort((a, b) => new Date(a.date) - new Date(b.date));
    } catch (e) {
        console.error(e);
    }

    const overlay = document.getElementById('moduleOverlay');
    if (overlay) overlay.classList.add('drawer-mode');

    container.innerHTML = `
        <div class="spending-summary-panel">
            <div class="ss-header">
                <button class="close-circle" onclick="closeModule()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
                <h3 class="ss-title">Monthly Summary</h3>
                <div></div> <!-- Spacer -->
            </div>

            <div class="ss-scroll-content" id="ssContentArea">
                <!-- Content injected via helper -->
            </div>

            <div class="ss-footer">
                <button class="ss-export-hero-btn" onclick="exportToPDF(true)">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 8px;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    Export Report
                </button>
            </div>
        </div>
    `;

    // Store globally for filtering access
    STATE.currentMonthEntries = allEntries;
    renderSummaryList();
}

function filterSummary(filterType) {
    STATE.summaryFilter = filterType;
    renderSummaryList(); // Re-render content
}

function toggleFilterMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('filterMenu');
    if (menu) {
        const isActive = menu.classList.contains('active');
        // Close others if needed
        document.querySelectorAll('.filter-menu').forEach(m => m.classList.remove('active'));

        if (!isActive) {
            menu.classList.add('active');
        }
    }
}

function togglePaymentDropdown(e) {
    if (e) e.stopPropagation();
    const list = document.getElementById('paymentOptionsList');
    if (list) {
        // Close others
        document.querySelectorAll('.custom-options-list').forEach(l => {
            if (l !== list) l.classList.remove('active');
        });
        list.classList.toggle('active');
    }
}

function selectPaymentOption(val) {
    const input = document.getElementById('formPaymentMode');
    const display = document.getElementById('paymentSelectedText');
    const list = document.getElementById('paymentOptionsList');

    if (input) input.value = val;
    if (display) display.textContent = val;

    if (list) {
        list.classList.remove('active');
        // Update visual selection
        const options = list.querySelectorAll('.custom-option');
        options.forEach(opt => {
            if (opt.textContent.trim().startsWith(val)) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });
    }
}

// Close Dropdowns on outside click (Generic)
document.addEventListener('click', (e) => {
    // Payment Dropdown
    if (!e.target.closest('.custom-select-container')) {
        const list = document.getElementById('paymentOptionsList');
        if (list) list.classList.remove('active');
    }

    // Summary Filter Menu
    if (!e.target.closest('.filter-icon-btn') && !e.target.closest('.filter-menu')) {
        document.querySelectorAll('.filter-menu').forEach(m => m.classList.remove('active'));
    }
});

function renderSummaryList() {
    const filter = STATE.summaryFilter;
    let filteredEntries = STATE.currentMonthEntries;

    if (filter === 'UPI') {
        filteredEntries = filteredEntries.filter(e => e.paymentMode === 'UPI');
    } else if (filter === 'Cash') {
        filteredEntries = filteredEntries.filter(e => e.paymentMode === 'Cash' || !e.paymentMode);
    }

    const grandTotal = filteredEntries.reduce((sum, e) => sum + e.amount, 0);

    // --- Aggregation Logic for Milk ---
    let milkEntries = filteredEntries.filter(e => e.itemName === 'Milk' || e.subCategory === 'Milk' || e.type === 'milk');
    let otherEntries = filteredEntries.filter(e => !(e.itemName === 'Milk' || e.subCategory === 'Milk' || e.type === 'milk'));

    let totalMilkAmount = milkEntries.reduce((sum, e) => sum + e.amount, 0);
    let finalDisplayList = [...otherEntries];

    // Create synthetic entry if milk exists (and filter allows it)
    if (totalMilkAmount > 0) {
        const aggregatedMilk = {
            _id: 'aggregated-milk',
            itemName: 'Milk',
            amount: totalMilkAmount,
            date: null, // Marker for aggregation
            categoryId: (milkEntries[0] && milkEntries[0].categoryId) || 'milk',
            categoryName: 'Milk',
            paymentMode: 'Cash', // Default assumption or mixed
            isAggregated: true
        };
        // User Requirement: "it should be in first"
        finalDisplayList.unshift(aggregatedMilk);
    }

    // Parent category mapping for standard entries
    finalDisplayList.forEach(e => {
        if (!e.isAggregated) {
            const cat = STATE.categories.find(c => c._id === e.categoryId || c.id === e.categoryId);
            const parent = e.parentCategory || (cat ? cat.parentCategory || cat.name : 'Other');
            e.categoryName = parent;
        }
    });

    const contentArea = document.getElementById('ssContentArea');
    if (contentArea) {
        contentArea.innerHTML = `
            <div class="ss-total-box">
                <span class="ss-total-label">TOTAL SPENT (${filter === 'All' ? 'ALL' : filter.toUpperCase()})</span>
                <span class="ss-total-amount">₹${grandTotal.toLocaleString()}</span>
            </div>

            <div class="ss-history-section">
                <div class="ss-history-header">
                    <h3 class="ss-section-title" style="margin: 0;">Detailed Transaction History</h3>
                    <div style="position: relative;">
                         <button class="filter-icon-btn" onclick="toggleFilterMenu(event)">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="${filter !== 'All' ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>
                        </button>
                        <div class="filter-menu" id="filterMenu">
                            <button class="filter-option ${filter === 'All' ? 'selected' : ''}" onclick="filterSummary('All')">All Transactions</button>
                            <button class="filter-option ${filter === 'UPI' ? 'selected' : ''}" onclick="filterSummary('UPI')">UPI Only</button>
                            <button class="filter-option ${filter === 'Cash' ? 'selected' : ''}" onclick="filterSummary('Cash')">Cash Only</button>
                        </div>
                    </div>
                </div>
                <div class="ss-history-box">
                    ${finalDisplayList.length > 0 ? finalDisplayList.map(e => {

            let dateHTML = '';

            if (e.isAggregated) {
                // For aggregated Milk, hide date strictly
                dateHTML = `
                    <div class="ss-date-pill" style="opacity: 0;">
                         <span class="d">-</span>
                         <span class="m">-</span>
                    </div>
                 `;
            } else {
                const dateObj = toIST(e.date);
                const day = dateObj.getDate();
                const month = dateObj.toLocaleString('en-US', { month: 'short', timeZone: IST_TZ }).toUpperCase();
                dateHTML = `
                    <div class="ss-date-pill">
                        <span class="d">${day}</span>
                        <span class="m">${month}</span>
                    </div>
                 `;
            }

            // Default to Cash if missing
            const mode = e.paymentMode || 'Cash';

            return `
                            <div class="ss-history-row" style="cursor: pointer;" onclick="handleSummaryClick('${(e.categoryName || '').replace(/'/g, "\\'")}', '${e.categoryId}', '${(e.itemName || '').replace(/'/g, "\\'")}')">
                                ${dateHTML}
                                <div style="display: flex; flex-direction: column; flex: 1; margin-left: 1rem;">
                                    <div style="display: flex; align-items: center;">
                                        <span class="ss-item-name">${e.itemName || e.notes || 'Expense'}</span>
                                        <span class="payment-mode-badge ${mode.toLowerCase()}">${mode}</span>
                                    </div>
                                </div>
                                <span class="ss-item-amount">₹${e.amount.toLocaleString()}</span>
                            </div>
                        `;
        }).join('') : `
                        <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
                            No entries for this month.
                        </div>
                    `}
                </div>
            </div>
        `;
    }
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
        // Fix: Ensure generic module opens cleanly
        setTimeout(() => {
            openModule(itemName || parentName, categoryId);
        }, 100);
    }
}



async function renderEBBillForm(container, categoryId, customBackAction = null, existingEntry = null) {
    const onBack = customBackAction || 'closeModule()';
    // Unified Header Update
    HeaderManager.update({
        showBack: true,
        onBack: onBack,
        hideMonthSelector: true
    });

    const units = (existingEntry && existingEntry.notes && existingEntry.notes.match(/Units: (\d+)/)?.[1]) || '';
    const noteClean = existingEntry ? existingEntry.notes.replace(/\s*\|\s*Units: \d+/, '') : '';

    const customFieldsHTML = `
        <div class="form-group">
            <label>Units Consumed (Optional)</label>
            <input type="number" id="ebUnits" placeholder="e.g. 150" value="${units}">
        </div>
    `;

    // Pre-fill values
    const amountVal = existingEntry ? existingEntry.amount : '';
    const dateVal = existingEntry ? formatISTInput(existingEntry.date) : todayIST();

    container.innerHTML = getUniversalFormHTML({
        title: existingEntry ? 'Edit EB Bill' : 'EB Bill Entry',
        onBack: onBack,
        itemNameLabel: 'Item Name',
        itemNameValue: 'EB Bill',
        amountValue: amountVal,
        dateValue: dateVal,
        notesValue: noteClean,
        customFieldsHTML,
        historyContainerId: existingEntry ? null : 'ebHistory',
        showItemName: false
    });

    if (existingEntry && existingEntry.paymentMode) {
        setTimeout(() => selectPaymentOption(existingEntry.paymentMode), 0);
    }

    if (!existingEntry) {
        renderSubcategoryHistory(document.getElementById('ebHistory'), 'EB Bill', categoryId);
    }

    setupUniversalForm(async (entry) => {
        const units = document.getElementById('ebUnits').value;

        entry.categoryId = categoryId;
        entry.itemName = 'EB Bill';
        entry.notes = (entry.notes || '') +
            (units ? ` | Units: ${units}` : '');

        if (existingEntry) {
            try {
                await fetchAPI(`/api/entries/${existingEntry._id}`, {
                    method: 'PUT',
                    body: JSON.stringify(entry)
                });
                showToast('Entry updated successfully', 'success');
                closeModule();
                renderDashboard();
            } catch (err) {
                showToast('Update failed: ' + err.message, 'error');
            }
        } else {
            const success = await addEntry(entry);
            if (success) {
                const histContainer = document.getElementById('ebHistory');
                if (histContainer) {
                    await renderSubcategoryHistory(histContainer, 'EB Bill', categoryId);
                    document.getElementById('universalForm').reset();
                    const today = todayIST();
                    if (document.getElementById('formDate')) document.getElementById('formDate').value = today;
                } else {
                    renderEBBillForm(container, categoryId);
                }
            }
        }
    });
}


async function renderGenericForm(container, subName, categoryId, customBackAction = null, hideHistory = false, existingEntry = null) {
    const onBack = customBackAction || 'closeModule()';
    // Unified Header Update
    HeaderManager.update({
        showBack: true,
        onBack: onBack,
        // FIX: Show month selector if we are in Miscellaneous or if explicitly allowed
        hideMonthSelector: (STATE.activeCategory !== 'Miscellaneous' && STATE.activeCategory !== 'miscellaneous') && (categoryId !== 'misc' && categoryId !== 'miscellaneous')
    });

    const isDescriptive = subName === 'Small Spends' || subName === 'General Expense' || subName === 'Medical' || subName === 'Newspaper';

    let customFieldsHTML = '';
    if (subName === 'Medical') {
        customFieldsHTML = `
            <div class="form-group">
                <label>Hospital / Doctor (Optional)</label>
                <input type="text" id="medHospital" placeholder="e.g. City Hospital" value="${(existingEntry && existingEntry.notes && existingEntry.notes.match(/\(Hosp: (.*)\)/)?.[1]) || ''}">
            </div>
        `;
    }

    // Pre-fill values
    const amountVal = existingEntry ? existingEntry.amount : '';
    const dateVal = existingEntry ? formatISTInput(existingEntry.date) : todayIST();
    const notesVal = existingEntry ? existingEntry.notes.replace(/\s*\(Hosp: .*\)/, '') : ''; // Remove hosp tag if present
    const itemNameVal = existingEntry ? (existingEntry.itemName || '') : '';

    container.innerHTML = getUniversalFormHTML({
        title: existingEntry ? `Edit ${subName}` : `${subName} Entry`,
        onBack: onBack,
        amountValue: amountVal,
        dateValue: dateVal,
        notesValue: notesVal,
        itemNameValue: itemNameVal,
        itemNameLabel: isDescriptive ? 'Description' : 'Item Name',
        itemNamePlaceholder: isDescriptive ? 'What was this for?' : 'e.g. Bread, Car service',
        customFieldsHTML,
        historyContainerId: (hideHistory || existingEntry) ? null : 'genHistory', // Hide history in edit mode
        historyHeader: `Recent Expenses in ${subName}`,
        isItemNameMandatory: false
    });

    // Handle Payment Mode Pre-selection
    if (existingEntry && existingEntry.paymentMode) {
        setTimeout(() => selectPaymentOption(existingEntry.paymentMode), 0);
    }

    if (!hideHistory && !existingEntry) {
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

        if (existingEntry) {
            // UPDATE LOGIC
            try {
                await fetchAPI(`/api/entries/${existingEntry._id}`, {
                    method: 'PUT',
                    body: JSON.stringify(entry)
                });
                showToast('Entry updated successfully', 'success');
                closeModule();

                // Refresh
                if (STATE.view === 'subcategories' && STATE.activeCategory) {
                    openCategory(STATE.activeCategory, true);
                } else {
                    renderDashboard();
                }
            } catch (err) {
                showToast('Update failed: ' + err.message, 'error');
            }

        } else {
            // CREATE LOGIC
            const success = await addEntry(entry);
            if (success) {
                // SMART REFRESH: Only update the history list
                const histContainer = document.getElementById('genHistory');
                if (histContainer && !hideHistory) {
                    await renderSubcategoryHistory(histContainer, subName, categoryId);

                    // Clear form values manually
                    document.getElementById('universalForm').reset();
                    // Restore defaults/dates if needed (retain date, reset amount)
                    const today = todayIST();
                    if (document.getElementById('formDate')) document.getElementById('formDate').value = today;

                } else {
                    renderGenericForm(container, subName, categoryId, onBack, hideHistory);
                }
            }
        }
    });
}


async function renderSubcategoryHistory(container, subName, categoryId) {
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;

    // Loading State
    container.innerHTML = `
        <div class="history-loading-state" style="display: flex; align-items: center; justify-content: center; height: 200px; color: var(--text-muted);">
            <div style="text-align: center;">
                <svg class="spinner" viewBox="0 0 50 50" style="width: 24px; height: 24px; animation: spin 1s linear infinite; margin-bottom: 8px;">
                    <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5"></circle>
                </svg>
                <p style="font-size: 0.9rem; margin: 0;">Loading entries...</p>
            </div>
        </div>
    `;

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
                            <span class="history-date">${formatISTShort(h.date)}</span>
                            <div class="history-info">
                                <span class="history-desc">${h.itemName || subName}</span>
                                ${h.notes ? `<span class="history-notes">${h.notes}</span>` : ''}
                            </div>
                        </div>
                        <div class="history-right" style="position: relative;">
                            <span class="history-amount">₹${h.amount.toLocaleString()}</span>
                            <div class="card-menu-container" style="position: relative; flex-shrink: 0; margin-left: 0.5rem; top: auto; right: auto;">
                                 <button class="card-menu-btn" style="opacity: 1;" onclick="toggleHistoryMenu(event, '${h._id}', '${categoryId}', '${(h.itemName || subName).replace(/'/g, "\\'")}')">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>
                                </button>
                            </div>
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

            // SMART REFRESH: If history list exists, just update it to prevent form blink/reset
            const genHistory = document.getElementById('genHistory');
            const ebHistory = document.getElementById('ebHistory');

            if (genHistory && document.body.contains(genHistory) && subName !== 'Milk' && subName !== 'EB Bill') {
                await renderSubcategoryHistory(genHistory, subName, categoryId);
                return;
            }
            if (ebHistory && document.body.contains(ebHistory) && subName === 'EB Bill') {
                await renderSubcategoryHistory(ebHistory, 'EB Bill', categoryId);
                return;
            }

            // Fallback: Full Refresh
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
                        <!-- Mobile Back Button Removed (Now in main header) -->
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
                    <!-- Month Selector & Price Box (Left) -->
                    <div class="milk-controls-left">
                        <div class="milk-month-pill">
                            <button class="milk-nav-arrow" onclick="navMonth(-1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
                            </button>
                            <span class="milk-month-label">${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}</span>
                            <button class="milk-nav-arrow" onclick="navMonth(1)">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>
                            </button>
                        </div>

                        <div class="milk-price-pill" title="Set default milk price per litre for ${MONTHS[STATE.selectedMonth]} ${STATE.selectedYear}">
                            <span class="price-pill-label">Price / L:</span>
                            <span class="price-currency-symbol">₹</span>
                            <input type="number" id="monthlyPriceInput" class="monthly-price-input" 
                                   value="${getMilkPriceForMonth(STATE.selectedYear, STATE.selectedMonth)}" 
                                   step="0.5" min="0" placeholder="48"
                                   onchange="handleMonthlyPriceChange(this.value, '${targetId}')"
                                   onkeydown="if(event.key==='Enter') { this.blur(); }">
                        </div>
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
                    const dayData = milkDataArr.find(entry => toIST(entry.date).toDateString() === toIST(d).toDateString());
                    return renderDayCard(dayData, true, d.getDate(), d);
                }).join('') :
                Array.from({ length: new Date(STATE.selectedYear, STATE.selectedMonth + 1, 0).getDate() }, (_, i) => {
                    const day = i + 1;
                    const dayData = milkDataArr.find(entry => toIST(entry.date).getDate() === day);
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
        const d = dayData ? toIST(dayData.date) : (specificDate ? toIST(specificDate) : new Date(STATE.selectedYear, STATE.selectedMonth, dayNumber));
        const day = d.getDate();
        const dayHeaderStr = `${String(day).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]}`;
        const today = todayISTObj();
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



function getMilkPriceForMonth(year, month) {
    const key = `MILK_PRICE_${year}_${month}`;
    const stored = localStorage.getItem(key);
    if (stored !== null && stored !== undefined && !isNaN(parseFloat(stored))) {
        return parseFloat(stored);
    }
    const defaultPrice = localStorage.getItem('MILK_DEFAULT_PRICE');
    if (defaultPrice !== null && defaultPrice !== undefined && !isNaN(parseFloat(defaultPrice))) {
        return parseFloat(defaultPrice);
    }
    return 48;
}

async function handleMonthlyPriceChange(val, targetId) {
    const parsed = parseFloat(val);
    if (isNaN(parsed) || parsed < 0) {
        showToast('Please enter a valid price', 'warning');
        return;
    }

    const key = `MILK_PRICE_${STATE.selectedYear}_${STATE.selectedMonth}`;
    localStorage.setItem(key, parsed);
    localStorage.setItem('MILK_DEFAULT_PRICE', parsed);

    // Update existing entries in the current month to use the new price
    if (STATE.tempMilkData && STATE.tempMilkData.length > 0) {
        const updatePromises = STATE.tempMilkData.map(async (entry) => {
            const m = entry.morningLitres || 0;
            const n = entry.nightLitres || 0;
            const totalQty = entry.quantity || (m + n);
            const newTotalAmount = parsed * totalQty;

            const updatedEntry = {
                ...entry,
                pricePerLitre: parsed,
                amount: newTotalAmount
            };

            try {
                await fetchAPI(`/api/entries/${entry._id}`, {
                    method: 'PUT',
                    body: JSON.stringify(updatedEntry)
                });
            } catch (err) {
                console.error(`Failed to update price for entry ${entry._id}`, err);
            }
        });

        await Promise.all(updatePromises);
        showToast(`Updated price to ₹${parsed}/L for all entries in ${MONTHS[STATE.selectedMonth]}`, 'success');
    } else {
        showToast(`Price set to ₹${parsed}/L for ${MONTHS[STATE.selectedMonth]}`, 'info');
    }

    const targetEl = document.getElementById(targetId) || document.getElementById('categoryToolContainer');
    if (targetEl) {
        renderMilkTracker(targetEl);
    }
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
    const price = existing?.pricePerLitre || getMilkPriceForMonth(STATE.selectedYear, STATE.selectedMonth);
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
    } else if (STATE.view === 'analytics') {
        renderAnalytics();
    } else if (STATE.view === 'settings') {
        if (STATE.settingsSubView === 'budget') {
            renderBudgetLimits();
        } else if (STATE.settingsSubView === 'notifications') {
            renderNotifications();
        } else {
            renderSettings();
        }
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
    return formatISTShort(dateString);
}

// --- PDF EXPORT ---

async function exportToPDF(forceGlobal = false) {
    const isGlobalExport = forceGlobal === true || !STATE.activeCategory;
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    const monthName = MONTHS[STATE.selectedMonth];
    const monthStr = `${STATE.selectedYear}-${String(STATE.selectedMonth + 1).padStart(2, '0')}`;
    const yearStr = STATE.selectedYear;

    let monthlyData = [];

    try {
        if (!isGlobalExport && STATE.activeCategory) {
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
                const getMilkQty = (d) => {
                    if (d.quantity !== undefined && d.quantity !== null && !isNaN(d.quantity) && Number(d.quantity) > 0) {
                        return Number(d.quantity);
                    }
                    const m = Number(d.morningLitres || 0);
                    const n = Number(d.nightLitres || 0);
                    return m + n;
                };

                const totalAmount = monthlyData.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
                const totalLitres = monthlyData.reduce((sum, d) => sum + getMilkQty(d), 0);

                doc.setFontSize(12);
                doc.text(`Total Cost: Rs. ${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 45);
                doc.text(`Total Litres: ${totalLitres.toFixed(1)} L`, 14, 52);

                // Table
                const milkRows = monthlyData
                    .sort((a, b) => new Date(a.date) - new Date(b.date))
                    .map(d => [
                        formatISTDate(d.date),
                        `${getMilkQty(d).toFixed(1)} L`, // Specific Milk Column
                        `Rs. ${Number(d.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    ]);

                doc.autoTable({
                    startY: 60,
                    head: [['Date', 'Quantity', 'Cost']],
                    body: milkRows,
                    theme: 'grid',
                    headStyles: { fillColor: [59, 130, 246] }
                });

                doc.save(`Paperless_Milk_${monthName}_${yearStr}.pdf`);
                showToast(`Milk report for ${monthName} downloaded!`, "success");
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
            const total = monthlyData.reduce((sum, d) => sum + (Number(d.amount) || 0), 0);
            doc.setFontSize(12);
            doc.text(`Total Spent: Rs. ${total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 14, 45);

            // Table
            const historyRows = monthlyData
                .sort((a, b) => new Date(a.date) - new Date(b.date))
                .map(h => [
                    formatISTDate(h.date),
                    h.itemName || h.notes || h.subCategory || 'Item',
                    `Rs. ${Number(h.amount || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
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
            let allRaw = [];
            if (STATE.currentMonthEntries && STATE.currentMonthEntries.length > 0) {
                allRaw = [...STATE.currentMonthEntries];
            } else {
                const res = await fetchAPI(`/api/entries?month=${monthStr}`);
                allRaw = Array.isArray(res) ? res : (res.entries || []);
            }

            // Ensure categories are cached in STATE
            if (!STATE.categories || STATE.categories.length === 0) {
                try {
                    STATE.categories = await fetchCategories();
                } catch (e) { console.error(e); }
            }

            // Helper for category name resolution
            const resolveCatName = (d) => {
                if (!d) return 'General';
                let cat = null;
                if (STATE.categories && STATE.categories.length > 0) {
                    cat = STATE.categories.find(c => 
                        (c._id && d.categoryId && c._id.toString() === d.categoryId.toString()) ||
                        (c.id && d.categoryId && c.id.toString() === d.categoryId.toString()) ||
                        (c.name && d.categoryName && c.name.toLowerCase() === d.categoryName.toLowerCase()) ||
                        (c.name && d.category && c.name.toLowerCase() === d.category.toLowerCase())
                    );
                }
                if (cat) {
                    if (cat.parentCategory && ['Miscellaneous', 'Savings'].includes(cat.parentCategory)) {
                        return `${cat.parentCategory} → ${cat.name}`;
                    }
                    return cat.name;
                }
                if (d.parentCategory && ['Miscellaneous', 'Savings'].includes(d.parentCategory)) {
                    return d.parentCategory;
                }
                return d.categoryName || d.parentCategory || d.category || 'General';
            };

            const resolveItemName = (d) => {
                if (!d) return 'Expense';
                if (d.itemName && d.itemName.trim() && d.itemName !== 'Expense') return d.itemName.trim();
                if (d.notes && d.notes.trim()) return d.notes.trim();
                if (d.subCategory && d.subCategory.trim()) return d.subCategory.trim();
                return resolveCatName(d);
            };

            // FILTER LOGIC FOR PDF - Respect STATE.summaryFilter
            const filter = STATE.summaryFilter || 'All';
            if (filter === 'UPI') {
                allRaw = allRaw.filter(e => e.paymentMode === 'UPI');
            } else if (filter === 'Cash') {
                allRaw = allRaw.filter(e => e.paymentMode === 'Cash' || !e.paymentMode);
            }
            monthlyData = allRaw;

            if (monthlyData.length === 0) {
                showToast(`No ${filter} transactions to export!`, 'info');
                return;
            }

            // Header
            doc.setFontSize(22);
            doc.setTextColor(59, 130, 246);
            doc.text("Paperless", 105, 20, { align: "center" });

            doc.setFontSize(14);
            doc.setTextColor(30, 41, 59);
            const reportTitle = filter === 'All' ? 'Monthly Spending Report' : `Monthly Spending Report (${filter})`;
            doc.text(`${reportTitle} - ${monthName} ${yearStr}`, 105, 30, { align: "center" });

            // Category Summary
            const totalsByCategory = {};
            let grandTotal = 0;

            monthlyData.forEach(d => {
                const catName = resolveCatName(d);
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
                    formatISTDate(h.date),
                    resolveItemName(h),
                    resolveCatName(h),
                    h.paymentMode || 'Cash',
                    `₹${h.amount.toLocaleString()}`
                ]);

            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 20,
                head: [['Date', 'Item', 'Category', 'Mode', 'Amount']],
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

async function initAdminLink() {
    const adminLink = document.getElementById('adminPanelLink');
    if (!adminLink || !STATE.isLoggedIn) return;

    try {
        const profile = await fetchAPI('/api/user/profile');
        if (profile?.user?.isAdmin) {
            adminLink.style.display = '';
        }
    } catch {
        // Non-admin or profile unavailable — keep link hidden
    }
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // Request notification permission on first user click
    document.addEventListener('click', () => {
        if ('Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    }, { once: true });

    // Initial check for push notifications on login/load
    setTimeout(checkAndShowPushNotifications, 2000);
    // Periodically check for new notifications every 60 seconds
    setInterval(checkAndShowPushNotifications, 60000);

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

    initAdminLink();

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
    if (event) {
        event.stopPropagation();
        event.preventDefault(); // Prevent menu close from immediately bubbling if inside button?
    }
    closeAllMenus();
    deleteCategory(id);
}

function handleDeleteSubcategory(event, catId, subId, subName) {
    if (event) {
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
                         ${(cat.type !== 'milk' && !['PPF', 'RD', 'LIC', 'Gold Chit', 'GOLDCHIT', 'FD'].includes(cat.name) && !['Travel', 'Function/Gift', 'Function / Gift', 'Donations', 'Happy Plates', 'Dress', 'Items'].includes(cat.name)) ? `<button class="card-delete-btn" onclick="event.stopPropagation(); deleteCategory('${cat._id}')">&times;</button>` : ''}
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
                                        <span class="history-date">${formatISTShort(entry.date)}</span>
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
    let parent = typeof parentName === 'string' ? parentName : null; // Default if null/event
    if (parent && !['Miscellaneous', 'Savings'].includes(parent)) {
        parent = null;
    }
    const name = await showPrompt(`Enter ${!parent ? 'Category' : 'Subcategory'} Name:`, "e.g. " + (!parent ? "Snacks" : "New Item"));
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

// --- HISTORY CONTEXT MENU HELPERS ---

window.toggleHistoryMenu = function (event, entryId, categoryId, itemName) {
    if (event) {
        event.stopPropagation();
        event.preventDefault();
    }

    const btn = event.currentTarget;
    const rect = btn.getBoundingClientRect();

    // Singleton Menu
    let menu = document.getElementById('global-history-menu');

    // Toggle logic
    if (menu && menu.dataset.triggerId === entryId && menu.style.display !== 'none') {
        menu.remove();
        return;
    }

    // Remove existing if any (different ID)
    if (menu) menu.remove();

    menu = document.createElement('div');
    menu.id = 'global-history-menu';
    menu.className = 'card-dropdown-menu'; // Reuse class for styling
    menu.style.position = 'fixed';
    menu.style.zIndex = '40000';
    menu.style.width = '140px';
    document.body.appendChild(menu);

    // Update Content
    const safeItemName = (itemName || '').replace(/'/g, "\\'");

    menu.innerHTML = `
        <button onclick="handleEditEntry(event, '${entryId}', '${categoryId}')">Edit</button>
        <button class="delete-option" onclick="handleDeleteEntry(event, '${entryId}', '${safeItemName}', '${categoryId}')">Delete</button>
    `;

    menu.dataset.triggerId = entryId;
    menu.style.display = 'flex';
    menu.style.overflow = 'visible'; // Ensure no clipping

    // Calculate Position (Right-aligned to button)
    let left = rect.right - 140;
    let top = rect.bottom + 5;

    // Mobile safety
    if (left < 10) left = 10;

    // Y safety (pop up if near bottom)
    if (top + 100 > window.innerHeight) {
        top = rect.top - 80;
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
};

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    // Check if click is outside the menu AND outside any trigger button
    if (!e.target.closest('.card-menu-btn') && !e.target.closest('#global-history-menu')) {
        const menu = document.getElementById('global-history-menu');
        if (menu) menu.remove();
    }
});


window.handleDeleteEntry = async function (event, entryId, itemName, categoryId) {
    if (event) event.stopPropagation();

    const menu = document.getElementById('global-history-menu');
    if (menu) menu.remove();

    const confirmed = await showConfirm(`Do you want to delete this entry?`);

    if (confirmed) {
        try {
            await fetchAPI(`/api/entries/${entryId}`, { method: 'DELETE' });
            showToast('Deleted successfully', 'success');

            if (STATE.view === 'subcategories' && STATE.activeCategory) {
                openCategory(STATE.activeCategory, true);
            } else {
                renderDashboard();
            }

        } catch (err) {
            showToast('Delete failed: ' + err.message, 'error');
        }
    }
};

window.handleEditEntry = async function (event, entryId, categoryId) {
    if (event) event.stopPropagation();

    const menu = document.getElementById('global-history-menu');
    if (menu) menu.remove();

    try {
        const entry = await fetchAPI(`/api/entries/${entryId}`);
        if (!entry) throw new Error("Entry not found");

        const subName = entry.subCategory || entry.itemName || 'Entry';

        // Ensure module overlay is active
        let container = document.getElementById('panelContent');
        const overlay = document.getElementById('moduleOverlay');
        if (overlay) overlay.classList.add('active');

        // Route to correct form
        if (subName === 'EB Bill') {
            await renderEBBillForm(container, categoryId, null, entry);
        } else if (entry.type === 'milk' || subName === 'Milk') {
            const d = toIST(entry.date);
            const dateParam = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            openMilkFormByDate(dateParam, entry._id);
        } else {
            await renderGenericForm(container, subName, categoryId, null, false, entry);
        }

    } catch (err) {
        console.error(err);
        showToast('Failed to load entry for editing', 'error');
    }
};
// --- SIDE DRAWER LOGIC ---

function openDrawer() {
    const drawer = document.getElementById('sideDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.add('open');
    if (overlay) overlay.classList.add('active');
}

function closeDrawer() {
    const drawer = document.getElementById('sideDrawer');
    const overlay = document.getElementById('drawerOverlay');
    if (drawer) drawer.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
}

// Drawer Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const menuBtn = document.getElementById('menuBtn');
    const closeBtn = document.getElementById('closeDrawerBtn');
    const overlay = document.getElementById('drawerOverlay');

    if (menuBtn) {
        menuBtn.addEventListener('click', (e) => {
            if (menuBtn.dataset.state === 'back') {
                window.handleHeaderBack(e);
            } else {
                openDrawer();
            }
        });
    }
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
    if (overlay) overlay.addEventListener('click', closeDrawer);

    // Close on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDrawer();
            if (typeof closeUserMonthBreakdownModal === 'function') {
                closeUserMonthBreakdownModal();
            }
        }
    });
});

// ==========================================================================
// FRIENDS FEATURE SYSTEM
// ==========================================================================

async function renderFriends() {
    STATE.view = 'friends';
    STATE.activeCategory = null;

    HeaderManager.update({
        showBack: true,
        onBack: 'renderDashboard',
        hideMonthSelector: true
    });

    const main = document.getElementById('mainContent');
    main.className = 'view-container friends-view-wrapper';
    main.innerHTML = `
        <div class="friends-container">
            <div class="friends-header-bar">
                <div class="friends-title-group">
                    <h1>Settlements</h1>
                    <p>Track payments made on behalf of others</p>
                </div>
                <button class="btn-add-friend" onclick="openAddFriendModal()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Contact
                </button>
            </div>

            <div id="friendsListContent">
                <div class="profile-loading-state">
                    <div class="profile-spinner"></div>
                    <p style="color: var(--text-muted); font-weight: 500;">Loading contacts...</p>
                </div>
            </div>
        </div>
    `;

    try {
        const res = await fetchAPI('/api/friends');
        if (!res || !res.success) {
            throw new Error(res?.message || 'Unable to fetch contacts');
        }

        const container = document.getElementById('friendsListContent');
        if (!container) return;

        const friends = res.friends || [];
        const totalOutstanding = res.totalOutstanding || 0;

        if (friends.length === 0) {
            container.innerHTML = `
                <div class="friends-empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                    </svg>
                    <p>No contacts added yet. Add people you commonly pay for and keep track of payments made on their behalf.</p>
                    <button class="btn-add-friend" style="margin-top: 0.5rem;" onclick="openAddFriendModal()">
                        + Add Contact
                    </button>
                </div>
            `;
            return;
        }

        const formattedTotal = totalOutstanding.toLocaleString('en-IN', { maximumFractionDigits: 2 });

        let html = `
            <div class="friends-outstanding-banner">
                <div class="friends-outstanding-info">
                    <span class="friends-outstanding-label">Total Outstanding</span>
                    <span class="friends-outstanding-amount">₹${formattedTotal}</span>
                </div>
                <div style="font-size: 0.88rem; color: var(--text-muted); font-weight: 500;">
                    ${friends.filter(f => f.outstandingBalance > 0).length} contact(s) with pending balance
                </div>
            </div>

            <div class="friends-list-grid">
        `;

        friends.forEach(friend => {
            const initial = friend.name ? friend.name.charAt(0).toUpperCase() : '?';
            const owes = friend.outstandingBalance > 0;
            const balanceText = owes
                ? `₹${friend.outstandingBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
                : 'Settled';
            const statusLabel = owes ? 'You paid for ' + escapeHtml(friend.name.split(' ')[0]) : 'Status';
            const balanceClass = owes ? 'owes' : 'settled';

            html += `
                <div class="friend-card">
                    <div class="friend-info">
                        <div class="friend-avatar">${escapeHtml(initial)}</div>
                        <div class="friend-details-text">
                            <h3>${escapeHtml(friend.name)}</h3>
                            <p>
                                <span>${escapeHtml(friend.email)}</span>
                                ${friend.phone ? `<span>• ${escapeHtml(friend.phone)}</span>` : ''}
                            </p>
                        </div>
                    </div>
                    <div class="friend-balance-group">
                        <div class="friend-balance-box">
                            <span class="friend-balance-status">${statusLabel}</span>
                            <span class="friend-balance-value ${balanceClass}">${balanceText}</span>
                        </div>
                        <button class="btn-view-friend" onclick="renderFriendDetails('${friend._id}')">
                            View Details
                        </button>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        container.innerHTML = html;

    } catch (err) {
        console.error('renderFriends error:', err);
        const container = document.getElementById('friendsListContent');
        if (container) {
            container.innerHTML = `
                <div class="profile-error-state">
                    <p style="color: var(--error); font-weight: 600;">Error: ${escapeHtml(err.message)}</p>
                    <button class="btn-add-friend" style="margin-top: 1rem;" onclick="renderFriends()">Retry</button>
                </div>
            `;
        }
    }
}

async function renderFriendDetails(friendId) {
    STATE.view = 'friend-details';
    STATE.activeCategory = null;

    HeaderManager.update({
        showBack: true,
        onBack: 'renderFriends',
        hideMonthSelector: true
    });

    const main = document.getElementById('mainContent');
    main.className = 'view-container friends-view-wrapper';
    main.innerHTML = `
        <div class="friends-container">
            <div class="profile-loading-state">
                <div class="profile-spinner"></div>
                <p style="color: var(--text-muted); font-weight: 500;">Loading settlement details...</p>
            </div>
        </div>
    `;

    try {
        const res = await fetchAPI(`/api/friends/${friendId}/transactions`);
        if (!res || !res.success || !res.friend) {
            throw new Error(res?.message || 'Unable to fetch settlement details');
        }

        const friend = res.friend;
        const transactions = res.transactions || [];
        const owes = friend.outstandingBalance > 0;
        const initial = friend.name ? friend.name.charAt(0).toUpperCase() : '?';
        const formattedOutstanding = friend.outstandingBalance.toLocaleString('en-IN', { maximumFractionDigits: 2 });

        let txHtml = '';
        if (transactions.length === 0) {
            txHtml = `
                <div class="friends-empty-state" style="padding: 2rem 1rem;">
                    <p>You haven't recorded any payments for this contact yet.</p>
                    <button class="btn-add-amount" style="margin-top: 0.5rem;" onclick="openAddFriendPaymentModal('${friend._id}')">
                        + Add Amount
                    </button>
                </div>
            `;
        } else {
            txHtml = transactions.map(t => {
                const isPayment = t.type === 'payment';
                const formattedDate = new Date(t.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
                const formattedAmt = t.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 });
                const typeLabel = isPayment ? 'Payment' : 'Settlement';
                const badgeClass = isPayment ? 'payment' : 'settlement';
                const amtClass = isPayment ? 'payment' : 'settlement';
                const amtPrefix = isPayment ? '+' : '-';

                return `
                    <div class="transaction-item-card">
                        <div class="transaction-item-left">
                            <div class="transaction-badge ${badgeClass}">${typeLabel.charAt(0)}</div>
                            <div class="transaction-item-meta">
                                <h4>${escapeHtml(t.description || (isPayment ? 'Payment made for contact' : 'Settlement'))}</h4>
                                <p>
                                    <span>${formattedDate}</span>
                                    ${isPayment && t.emailSent ? `<span class="email-tag">Email Sent</span>` : ''}
                                </p>
                            </div>
                        </div>
                        <div class="transaction-item-amount ${amtClass}">
                            ${amtPrefix}₹${formattedAmt}
                        </div>
                    </div>
                `;
            }).join('');
        }

        main.innerHTML = `
            <div class="friends-container">
                <div class="friend-detail-card">
                    <div class="friend-info">
                        <div class="friend-avatar" style="width: 56px; height: 56px; font-size: 1.4rem;">${escapeHtml(initial)}</div>
                        <div class="friend-details-text">
                            <h2 style="font-size: 1.35rem; font-weight: 700; margin: 0 0 0.2rem 0; color: var(--text-main);">${escapeHtml(friend.name)}</h2>
                            <p>
                                <span>${escapeHtml(friend.email)}</span>
                                ${friend.phone ? `<span>• ${escapeHtml(friend.phone)}</span>` : ''}
                            </p>
                        </div>
                    </div>
                    <div class="friend-detail-actions">
                        <button class="btn-add-amount" onclick="openAddFriendPaymentModal('${friend._id}')">
                            + Add Amount
                        </button>
                        ${owes ? `<button class="btn-settle-up" onclick="openSettleUpModal('${friend._id}', ${friend.outstandingBalance})">Settle Up</button>` : ''}
                        <button class="btn-friend-danger" title="Delete Contact" onclick="confirmDeleteFriend('${friend._id}', '${escapeHtml(friend.name)}')">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>

                <div class="friends-outstanding-banner">
                    <div class="friends-outstanding-info">
                        <span class="friends-outstanding-label">Current Outstanding</span>
                        <span class="friends-outstanding-amount">₹${formattedOutstanding}</span>
                    </div>
                    <div style="font-size: 0.88rem; color: var(--text-muted); font-weight: 500;">
                        ${owes ? 'Contact owes you this balance' : 'All payments settled!'}
                    </div>
                </div>

                <div class="transaction-history-section">
                    <h3 class="transaction-history-title">Transaction History</h3>
                    <div style="display: flex; flex-direction: column; gap: 0.65rem;">
                        ${txHtml}
                    </div>
                </div>
            </div>
        `;

    } catch (err) {
        console.error('renderFriendDetails error:', err);
        main.innerHTML = `
            <div class="friends-container">
                <div class="profile-error-state">
                    <p style="color: var(--error); font-weight: 600;">Error: ${escapeHtml(err.message)}</p>
                    <button class="btn-add-friend" style="margin-top: 1rem;" onclick="renderFriends()">Back to Settlements</button>
                </div>
            </div>
        `;
    }
}

function openAddFriendModal() {
    const overlay = document.getElementById('moduleOverlay');
    const panelContent = document.getElementById('panelContent');
    if (!overlay || !panelContent) return;

    panelContent.innerHTML = `
        <div class="friend-modal-card">
            <div class="friend-modal-header">
                <div class="friend-modal-title-box">
                    <h3>Add Contact</h3>
                    <p>Enter details of the person you pay for</p>
                </div>
                <button type="button" class="close-circle" onclick="closeModule()" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <form onsubmit="saveNewFriend(event)">
                <div class="friend-modal-body">
                    <div class="friend-field-group">
                        <label for="friendNameInput">Full Name *</label>
                        <input type="text" id="friendNameInput" class="friend-modal-input" placeholder="e.g. Ravi Kumar" required maxlength="100" />
                    </div>
                    <div class="friend-field-group">
                        <label for="friendEmailInput">Email Address *</label>
                        <input type="email" id="friendEmailInput" class="friend-modal-input" placeholder="e.g. ravi@gmail.com" required />
                        <span class="friend-input-hint">Notifications will be sent to this email address</span>
                    </div>
                    <div class="friend-field-group">
                        <label for="friendPhoneInput">Phone Number (Optional)</label>
                        <input type="tel" id="friendPhoneInput" class="friend-modal-input" placeholder="e.g. 9876543210" />
                    </div>
                </div>
                <div class="friend-modal-actions">
                    <button type="button" class="friend-modal-cancel" onclick="closeModule()">Cancel</button>
                    <button type="submit" class="friend-modal-save" id="btnSaveFriend">Add Contact</button>
                </div>
            </form>
        </div>
    `;

    overlay.classList.add('active');
}

async function saveNewFriend(event) {
    event.preventDefault();
    const btn = document.getElementById('btnSaveFriend');
    const name = document.getElementById('friendNameInput')?.value.trim();
    const email = document.getElementById('friendEmailInput')?.value.trim();
    const phone = document.getElementById('friendPhoneInput')?.value.trim();

    if (!name) {
        showToast('Contact name is required.', 'error');
        return;
    }
    if (!email) {
        showToast('Email address is required.', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Adding...';
    }

    try {
        const res = await fetchAPI('/api/friends', {
            method: 'POST',
            body: JSON.stringify({ name, email, phone })
        });

        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to add contact.');
        }

        showToast('Contact added successfully!', 'success');
        closeModule();
        renderFriends();
    } catch (err) {
        showToast(err.message || 'Error adding contact', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Add Contact';
        }
    }
}

function openAddFriendPaymentModal(friendId) {
    const overlay = document.getElementById('moduleOverlay');
    const panelContent = document.getElementById('panelContent');
    if (!overlay || !panelContent) return;

    const todayStr = new Date().toISOString().split('T')[0];

    panelContent.innerHTML = `
        <div class="friend-modal-card">
            <div class="friend-modal-header">
                <div class="friend-modal-title-box">
                    <h3>Add Payment for Contact</h3>
                    <p>Record money you paid on their behalf</p>
                </div>
                <button type="button" class="close-circle" onclick="closeModule()" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <form onsubmit="saveFriendPayment(event, '${friendId}')">
                <div class="friend-modal-body">
                    <div class="friend-field-group">
                        <label for="paymentAmountInput">Amount (₹) *</label>
                        <input type="number" step="0.01" min="0.01" id="paymentAmountInput" class="friend-modal-input" placeholder="e.g. 500" required />
                    </div>
                    <div class="friend-field-group">
                        <label for="paymentDescInput">Description *</label>
                        <input type="text" id="paymentDescInput" class="friend-modal-input" placeholder="e.g. Dinner, Movie, Cab" required />
                    </div>
                    <div class="friend-field-group">
                        <label for="paymentDateInput">Date</label>
                        <input type="date" id="paymentDateInput" class="friend-modal-input" value="${todayStr}" />
                    </div>
                    <div class="friend-checkbox-card">
                        <input type="checkbox" id="sendEmailCheckbox" checked />
                        <label for="sendEmailCheckbox">
                            <span class="checkbox-title">Send email notification to contact</span>
                            <span class="checkbox-sub">An email summary will be delivered to their inbox</span>
                        </label>
                    </div>
                </div>
                <div class="friend-modal-actions">
                    <button type="button" class="friend-modal-cancel" onclick="closeModule()">Cancel</button>
                    <button type="submit" class="friend-modal-save" id="btnSavePayment">Add Payment</button>
                </div>
            </form>
        </div>
    `;

    overlay.classList.add('active');
}

async function saveFriendPayment(event, friendId) {
    event.preventDefault();
    const btn = document.getElementById('btnSavePayment');
    const amount = document.getElementById('paymentAmountInput')?.value;
    const description = document.getElementById('paymentDescInput')?.value.trim();
    const date = document.getElementById('paymentDateInput')?.value;
    const sendEmail = document.getElementById('sendEmailCheckbox')?.checked;

    if (!amount || parseFloat(amount) <= 0) {
        showToast('Please enter a valid amount.', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Saving...';
    }

    try {
        const res = await fetchAPI(`/api/friends/${friendId}/payment`, {
            method: 'POST',
            body: JSON.stringify({ amount, description, date, sendEmail })
        });

        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to record payment.');
        }

        if (res.emailSent === false && sendEmail) {
            showToast('Payment recorded, but the email notification could not be sent.', 'warning');
        } else {
            showToast('Payment recorded successfully!', 'success');
        }

        closeModule();
        renderFriendDetails(friendId);
    } catch (err) {
        showToast(err.message || 'Error recording payment', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Add Payment';
        }
    }
}

function openSettleUpModal(friendId, currentOutstanding) {
    const overlay = document.getElementById('moduleOverlay');
    const panelContent = document.getElementById('panelContent');
    if (!overlay || !panelContent) return;

    const todayStr = new Date().toISOString().split('T')[0];
    const defaultAmount = currentOutstanding || 0;

    panelContent.innerHTML = `
        <div class="friend-modal-card">
            <div class="friend-modal-header">
                <div class="friend-modal-title-box">
                    <h3>Settle Payment</h3>
                    <p>Current outstanding: ₹${defaultAmount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</p>
                </div>
                <button type="button" class="close-circle" onclick="closeModule()" title="Close">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            <form onsubmit="saveFriendSettlement(event, '${friendId}')">
                <div class="friend-modal-body">
                    <div class="friend-field-group">
                        <label for="settleAmountInput">Settlement Amount (₹) *</label>
                        <input type="number" step="0.01" min="0.01" max="${defaultAmount}" id="settleAmountInput" class="friend-modal-input" value="${defaultAmount}" required />
                    </div>
                    <div class="friend-field-group">
                        <label for="settleDateInput">Date</label>
                        <input type="date" id="settleDateInput" class="friend-modal-input" value="${todayStr}" />
                    </div>
                </div>
                <div class="friend-modal-actions">
                    <button type="button" class="friend-modal-cancel" onclick="closeModule()">Cancel</button>
                    <button type="submit" class="friend-modal-save" style="background: var(--success);" id="btnSaveSettle">Mark as Settled</button>
                </div>
            </form>
        </div>
    `;

    overlay.classList.add('active');
}

async function saveFriendSettlement(event, friendId) {
    event.preventDefault();
    const btn = document.getElementById('btnSaveSettle');
    const amount = document.getElementById('settleAmountInput')?.value;
    const date = document.getElementById('settleDateInput')?.value;

    if (!amount || parseFloat(amount) <= 0) {
        showToast('Please enter a valid settlement amount.', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Settling...';
    }

    try {
        const res = await fetchAPI(`/api/friends/${friendId}/settle`, {
            method: 'POST',
            body: JSON.stringify({ amount, date })
        });

        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to record settlement.');
        }

        showToast('Settlement recorded successfully!', 'success');
        closeModule();
        renderFriendDetails(friendId);
    } catch (err) {
        showToast(err.message || 'Error recording settlement', 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Mark as Settled';
        }
    }
}

async function confirmDeleteFriend(friendId, friendName) {
    if (!confirm(`Are you sure you want to delete ${friendName}? All transaction history for this contact will be deleted.`)) {
        return;
    }

    try {
        const res = await fetchAPI(`/api/friends/${friendId}`, {
            method: 'DELETE'
        });

        if (!res || !res.success) {
            throw new Error(res?.message || 'Failed to delete contact.');
        }

        showToast('Contact removed.', 'success');
        renderFriends();
    } catch (err) {
        showToast(err.message || 'Error deleting contact', 'error');
    }
}
