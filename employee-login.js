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

        try {
            // BYPASS: Just search the profiles table for a matching username and password
            const { data: profileData, error: profileError } = await supabase
                .from('profiles')
                .select('*')
                .eq('username', username)
                .eq('password', password)
                .single(); // .single() ensures we only get one result back

            // If no match is found, Supabase throws an error (PGRST116)
            if (profileError) {
                throw new Error("Invalid username or password.");
            }

            // Optional: Role check logic
            if (profileData.role === 'admin') {
                console.log("Admin logged in via Employee portal.");
            } else if (profileData.role === 'team_leader') {
                console.log("Team Leader logged in via Employee portal.");
            }

            // Success! Redirect to the dashboard
            window.location.href = 'employee-dashboard.html';

        } catch (error) {
            console.error('Login Error:', error);
            errorMessage.textContent = 'Invalid username or password. Please try again.';
        } finally {
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    });
});