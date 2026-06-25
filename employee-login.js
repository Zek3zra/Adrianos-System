import { supabase } from './supabaseClient.js';

const EMPLOYEE_DASHBOARD_PAGE = 'employee-dashboard.html';
const MAIN_MENU_PAGE = 'index.html';

const ALLOWED_EMPLOYEE_PORTAL_ROLES = ['employee', 'team_leader'];

const SESSION_KEYS = [
    'adrianosLoggedAuth',
    'adrianosLoggedUserId',
    'adrianosLoggedUsername',
    'adrianosLoggedRole',
    'adrianosLoggedFullName',
    'adrianosEmployeeAuth',
    'adrianosEmployeeUserId',
    'adrianosEmployeeUsername',
    'adrianosEmployeeRole',
    'adrianosEmployeeFullName',
    'adrianosTlAuth',
    'adrianosTlUserId',
    'adrianosTlUsername',
    'adrianosTlRole',
    'adrianosAuthUser'
];

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const togglePasswordBtn = document.getElementById('togglePasswordBtn');

    clearOldLoginSession();

    loginForm.addEventListener('submit', async event => {
        event.preventDefault();

        const username = usernameInput.value.trim();
        const password = passwordInput.value;

        setError('');

        if (!username || !password) {
            setError('Please enter your username and password.');
            return;
        }

        setLoading(true);

        try {
            const profile = await loginEmployeeOrTeamLeader(username, password);
            saveEmployeeSession(profile);
            window.location.replace(EMPLOYEE_DASHBOARD_PAGE);
        } catch (error) {
            console.error('Employee login failed:', error);
            setError(error.message || 'Invalid username or password. Please try again.');
        } finally {
            setLoading(false);
        }
    });

    togglePasswordBtn.addEventListener('click', () => {
        const isHidden = passwordInput.type === 'password';
        passwordInput.type = isHidden ? 'text' : 'password';
        togglePasswordBtn.textContent = isHidden ? 'Hide' : 'Show';
        togglePasswordBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
    });

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        loginBtn.textContent = isLoading ? 'Logging in...' : 'Login';
        usernameInput.disabled = isLoading;
        passwordInput.disabled = isLoading;
        togglePasswordBtn.disabled = isLoading;
    }

    function setError(message) {
        errorMessage.textContent = message;
    }
});

async function loginEmployeeOrTeamLeader(username, password) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .maybeSingle();

    if (error) {
        throw new Error('Could not connect to the account database.');
    }

    if (!data) {
        throw new Error('Invalid username or password. Please try again.');
    }

    const role = normalizeRole(data.role);

    if (!ALLOWED_EMPLOYEE_PORTAL_ROLES.includes(role)) {
        throw new Error('This login page is only for employee and team leader accounts.');
    }

    return {
        ...data,
        role
    };
}

function saveEmployeeSession(profile) {
    clearOldLoginSession();

    const sessionUser = {
        id: profile.id,
        username: profile.username || '',
        role: normalizeRole(profile.role),
        full_name: profile.full_name || '',
        login_portal: 'employee',
        logged_in_at: new Date().toISOString()
    };

    sessionStorage.setItem('adrianosLoggedAuth', 'true');
    sessionStorage.setItem('adrianosLoggedUserId', String(sessionUser.id));
    sessionStorage.setItem('adrianosLoggedUsername', sessionUser.username);
    sessionStorage.setItem('adrianosLoggedRole', sessionUser.role);
    sessionStorage.setItem('adrianosLoggedFullName', sessionUser.full_name);

    sessionStorage.setItem('adrianosEmployeeAuth', 'true');
    sessionStorage.setItem('adrianosEmployeeUserId', String(sessionUser.id));
    sessionStorage.setItem('adrianosEmployeeUsername', sessionUser.username);
    sessionStorage.setItem('adrianosEmployeeRole', sessionUser.role);
    sessionStorage.setItem('adrianosEmployeeFullName', sessionUser.full_name);

    sessionStorage.setItem('adrianosAuthUser', JSON.stringify(sessionUser));
}

function clearOldLoginSession() {
    SESSION_KEYS.forEach(key => sessionStorage.removeItem(key));
}

function normalizeRole(role) {
    const cleanRole = String(role || 'employee')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');

    if (cleanRole === 'teamleader' || cleanRole === 'team_lead' || cleanRole === 'tl') {
        return 'team_leader';
    }

    return cleanRole;
}
