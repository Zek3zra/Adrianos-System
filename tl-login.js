import { supabase } from './supabaseClient.js';

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');

    const ADMIN_USERNAME = 'AdrianosEst2021';
    const ADMIN_PASSWORD = 'Sonairda21';

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        errorMessage.textContent = '';
        loginBtn.textContent = 'Authenticating...';
        loginBtn.disabled = true;

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        // ADMIN LOGIN
        if (username === 'AdrianosEst2021' && password === 'Sonairda21') {
    sessionStorage.setItem('adrianosAdminAuth', 'true');
    sessionStorage.setItem('adrianosAdminLoginTime', String(Date.now()));
    sessionStorage.setItem('adrianosAdminUsername', username);

    window.location.replace('admin-dashboard.html');
    return;
}

        // REGULAR TEAM LEADER LOGIN
        try {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (profileError) {
                throw new Error("Invalid username or password.");
            }

            if (profileData.role === 'employee') {
                throw new Error("Access denied. Please use the Employee Login portal.");
            }

            sessionStorage.setItem('adrianosTlAuth', 'true');
            sessionStorage.setItem('adrianosTlUserId', profileData.id);
            sessionStorage.setItem('adrianosTlUsername', profileData.username);
            sessionStorage.setItem('adrianosTlRole', profileData.role);

            window.location.replace('tl-dashboard.html');

        } catch (error) {
            console.error('Login Error:', error);
            errorMessage.textContent = error.message || 'Invalid username or password. Please try again.';
            loginBtn.textContent = 'Login to Dashboard';
            loginBtn.disabled = false;
        }
    });
});