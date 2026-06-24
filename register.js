import { supabase } from './supabaseClient.js';

document.addEventListener("DOMContentLoaded", () => {
    const registerForm = document.getElementById('registerForm');
    const submitBtn = document.getElementById('submitBtn');
    const errorMessage = document.getElementById('errorMessage');

    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault(); 

        errorMessage.textContent = '';
        submitBtn.textContent = 'Registering...';
        submitBtn.disabled = true;

        const fullName = document.getElementById('fullName').value.trim();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;
        const email = document.getElementById('email').value.trim(); // Grab the email
        const phone = document.getElementById('phone').value.trim();
        const address = document.getElementById('address').value.trim();
        const birthday = document.getElementById('birthday').value;
        const dateStarted = document.getElementById('dateStarted').value;
        const emergencyName = document.getElementById('emergencyName').value.trim();
        const emergencyNumber = document.getElementById('emergencyNumber').value.trim();
        
        const combinedEmergencyContact = `${emergencyName} - ${emergencyNumber}`;

        if (username.length < 8 || password.length < 8) {
            errorMessage.textContent = 'Username and Password must be at least 8 characters long.';
            submitBtn.textContent = 'Register';
            submitBtn.disabled = false;
            return;
        }

        try {
            // Direct database insert - no auth, no rate limits
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        username: username,
                        password: password, 
                        email: email, // Insert the email strictly as data
                        full_name: fullName,
                        phone_number: phone,
                        address: address,
                        birthday: birthday,
                        date_started: dateStarted,
                        emergency_contact: combinedEmergencyContact
                    }
                ]);

            if (profileError) {
                if (profileError.code === '23505') {
                    throw new Error("That username is already taken.");
                }
                throw profileError;
            }

            alert('Registration successful! Redirecting to login...');
            window.location.href = 'index.html';

        } catch (error) {
            console.error('Registration Error:', error);
            errorMessage.textContent = error.message || 'An error occurred during registration.';
        } finally {
            submitBtn.textContent = 'Register';
            submitBtn.disabled = false;
        }
    });
});