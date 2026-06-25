import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');

    const ADMIN_USERNAME = 'AdrianosEst2021';
    const ADMIN_PASSWORD = 'Sonairda21';

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        setLoading(true);
        errorMessage.textContent = '';

        try {
            clearLoginSession();

            if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
                sessionStorage.setItem('adrianosAdminAuth', 'true');
                sessionStorage.setItem('adrianosAdminLoginTime', String(Date.now()));
                sessionStorage.setItem('adrianosAdminUsername', username);

                window.location.replace('admin-dashboard.html');
                return;
            }

            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single();

            if (profileError || !profileData) {
                throw new Error('Invalid username or password.');
            }

            if (profileData.role !== 'team_leader') {
                throw new Error('Access denied. Team Leader account only.');
            }

            sessionStorage.setItem('adrianosTlAuth', 'true');
            sessionStorage.setItem('adrianosTlUserId', profileData.id);
            sessionStorage.setItem('adrianosTlUsername', profileData.username || '');
            sessionStorage.setItem('adrianosTlRole', profileData.role);

            sessionStorage.setItem('adrianosLoggedUserId', profileData.id);
            sessionStorage.setItem('adrianosLoggedUsername', profileData.username || '');
            sessionStorage.setItem('adrianosLoggedRole', profileData.role);

            window.location.replace('tl-dashboard.html');
        } catch (error) {
            console.error('TL login failed:', error);
            errorMessage.textContent = error.message || 'Login failed. Please try again.';
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        loginBtn.disabled = isLoading;
        loginBtn.textContent = isLoading ? 'Authenticating...' : 'Login';
    }

    function clearLoginSession() {
        const keys = [
            'adrianosAdminAuth',
            'adrianosAdminLoginTime',
            'adrianosAdminUsername',
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
});
