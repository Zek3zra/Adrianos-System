import { supabase } from './supabaseClient.js';

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        errorMessage.textContent = '';
        loginBtn.textContent = 'Authenticating...';
        loginBtn.disabled = true;

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        // 1. HARDCODED ADMIN BYPASS
        if (username === 'reymnicolecatalan' && password === 'adrianos4evs') {
            window.location.href = 'admin-dashboard.html';
            return; // Stops the function here so it doesn't check the database
        }

        // 2. REGULAR TEAM LEADER DATABASE CHECK
        try {
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single(); 

            // If no match is found
            if (profileError) {
                throw new Error("Invalid username or password.");
            }

            // Block regular employees from using the management portal
            if (profileData.role === 'employee') {
                throw new Error("Access Denied. Please use the Employee Login portal.");
            }

            // If they pass the checks, send them to the TL dashboard
            window.location.href = 'tl-dashboard.html';

        } catch (error) {
            console.error('Login Error:', error);
            errorMessage.textContent = error.message || 'Invalid username or password. Please try again.';
        } finally {
            loginBtn.textContent = 'Login to Dashboard';
            loginBtn.disabled = false;
        }
    });
});