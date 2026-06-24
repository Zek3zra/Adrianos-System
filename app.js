// Wait for the DOM to fully load before attaching events
document.addEventListener("DOMContentLoaded", () => {
    
    const btnLoginEmployee = document.getElementById('btn-login-employee');
    const btnLoginTL = document.getElementById('btn-login-tl');
    const btnRegister = document.getElementById('btn-register');

    // Inside your app.js
    btnLoginEmployee.addEventListener('click', () => {
        window.location.href = 'employee-login.html';
    });

    // Inside your app.js file
   

    btnLoginTL.addEventListener('click', () => {
        // Change from an alert to a redirect
        window.location.href = 'tl-login.html';
    });

    // Event listener for Registration - UPDATED TO REDIRECT
    btnRegister.addEventListener('click', () => {
        window.location.href = 'register.html';
    });
});