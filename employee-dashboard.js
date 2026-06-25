import { supabase } from './supabaseClient.js';

const LOGIN_PAGE = 'employee-login.html';
const ALLOWED_DASHBOARD_ROLES = ['employee', 'team_leader'];

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

const daysOfWeek = [
    { key: 'Mon', label: 'Monday', short: 'Mon' },
    { key: 'Tue', label: 'Tuesday', short: 'Tue' },
    { key: 'Wed', label: 'Wednesday', short: 'Wed' },
    { key: 'Thu', label: 'Thursday', short: 'Thu' },
    { key: 'Fri', label: 'Friday', short: 'Fri' },
    { key: 'Sat', label: 'Saturday', short: 'Sat' },
    { key: 'Sun', label: 'Sunday', short: 'Sun' }
];

document.addEventListener('DOMContentLoaded', () => {
    const pageLoader = document.getElementById('pageLoader');
    const logoutBtn = document.getElementById('logoutBtn');
    const navSubtitle = document.getElementById('navSubtitle');

    const profilePhoto = document.getElementById('profilePhoto');
    const profileInitials = document.getElementById('profileInitials');
    const photoInput = document.getElementById('photoInput');
    const uploadPhotoBtn = document.getElementById('uploadPhotoBtn');
    const removePhotoBtn = document.getElementById('removePhotoBtn');

    const roleBadge = document.getElementById('roleBadge');
    const profileName = document.getElementById('profileName');
    const profileUsername = document.getElementById('profileUsername');
    const profileBranch = document.getElementById('profileBranch');
    const profileStarted = document.getElementById('profileStarted');
    const profilePhone = document.getElementById('profilePhone');
    const profileEmail = document.getElementById('profileEmail');

    const scheduleGrid = document.getElementById('scheduleGrid');
    const refreshScheduleBtn = document.getElementById('refreshScheduleBtn');

    const profileView = document.getElementById('profileView');
    const profileForm = document.getElementById('profileForm');
    const editProfileBtn = document.getElementById('editProfileBtn');
    const cancelEditBtn = document.getElementById('cancelEditBtn');
    const saveProfileBtn = document.getElementById('saveProfileBtn');

    const fullNameInput = document.getElementById('fullNameInput');
    const phoneInput = document.getElementById('phoneInput');
    const emailInput = document.getElementById('emailInput');
    const birthdayInput = document.getElementById('birthdayInput');
    const dateStartedInput = document.getElementById('dateStartedInput');
    const addressInput = document.getElementById('addressInput');
    const emergencyInput = document.getElementById('emergencyInput');

    const toast = document.getElementById('toast');

    let currentUser = null;
    let currentBranch = null;

    initDashboard();

    async function initDashboard() {
        try {
            await loadCurrentUser();
            await loadBranch();
            renderDashboard();
            await loadSchedule();
        } catch (error) {
            console.error('Employee dashboard failed:', error);
            alert(error.message || 'Session expired or account not found. Please login again.');
            clearLoginSession();
            window.location.replace(LOGIN_PAGE);
        } finally {
            pageLoader.classList.add('hidden');
        }
    }

    async function loadCurrentUser() {
        const sessionIdentity = getSessionIdentity();

        if (!sessionIdentity.userId && !sessionIdentity.username) {
            throw new Error('Session expired or account not found. Please login again.');
        }

        let query = supabase.from('profiles').select('*');

        if (sessionIdentity.userId) {
            query = query.eq('id', sessionIdentity.userId);
        } else {
            query = query.eq('username', sessionIdentity.username);
        }

        const { data, error } = await query.maybeSingle();

        if (error) {
            throw new Error('Could not load your account. Please login again.');
        }

        if (!data) {
            throw new Error('Account not found. Please login again.');
        }

        const role = normalizeRole(data.role);

        if (!ALLOWED_DASHBOARD_ROLES.includes(role)) {
            throw new Error('This dashboard is only for employee and team leader accounts.');
        }

        currentUser = {
            ...data,
            role
        };

        refreshCurrentSession(currentUser);
    }

    async function loadBranch() {
        currentBranch = null;

        if (!currentUser?.branch_id) {
            return;
        }

        const { data, error } = await supabase
            .from('branches')
            .select('*')
            .eq('id', currentUser.branch_id)
            .maybeSingle();

        if (error) {
            console.warn('Branch load failed:', error);
            return;
        }

        currentBranch = data || null;
    }

    async function loadSchedule() {
        if (!currentUser) return;

        scheduleGrid.innerHTML = '<div class="loading-text">Loading your schedule...</div>';
        refreshScheduleBtn.disabled = true;

        try {
            const { data, error } = await supabase
                .from('schedules')
                .select('*')
                .eq('employee_id', currentUser.id);

            if (error) throw error;

            renderSchedule(data || []);
        } catch (error) {
            console.error('Schedule load failed:', error);
            scheduleGrid.innerHTML = '<div class="loading-text">Failed to load schedule. Please refresh again.</div>';
        } finally {
            refreshScheduleBtn.disabled = false;
        }
    }

    function renderDashboard() {
        renderProfileHeader();
        renderProfileInfo();
        fillProfileForm();
    }

    function renderProfileHeader() {
        const branchName = getBranchName();
        const displayName = plainText(currentUser.full_name, 'Employee');

        document.title = `${displayName} - Employee Dashboard`;
        navSubtitle.textContent = branchName;

        roleBadge.textContent = getRoleLabel(currentUser.role);
        profileName.textContent = displayName;
        profileUsername.textContent = `Username: ${plainText(currentUser.username)}`;

        profileBranch.textContent = branchName;
        profileStarted.textContent = formatDate(currentUser.date_started);
        profilePhone.textContent = plainText(currentUser.phone_number);
        profileEmail.textContent = plainText(currentUser.email, 'None Registered');

        renderProfilePhoto();
    }

    function renderProfilePhoto() {
        profileInitials.textContent = getInitials(currentUser.full_name || currentUser.username);

        if (currentUser.photo_url) {
            profilePhoto.src = currentUser.photo_url;
            profilePhoto.classList.remove('hidden');
            profileInitials.classList.add('hidden');
            removePhotoBtn.disabled = false;
        } else {
            profilePhoto.removeAttribute('src');
            profilePhoto.classList.add('hidden');
            profileInitials.classList.remove('hidden');
            removePhotoBtn.disabled = true;
        }
    }

    function renderProfileInfo() {
        profileView.innerHTML = `
            ${createInfoItem('Full Name', currentUser.full_name)}
            ${createInfoItem('Username / ID', currentUser.username)}
            ${createInfoItem('Role', getRoleLabel(currentUser.role))}
            ${createInfoItem('Branch', getBranchName())}
            ${createInfoItem('Phone Number', currentUser.phone_number)}
            ${createInfoItem('Email Address', currentUser.email || 'None Registered')}
            ${createInfoItem('Birthday', formatDate(currentUser.birthday))}
            ${createInfoItem('Date Started', formatDate(currentUser.date_started))}
            ${createInfoItem('Complete Address', currentUser.address, true)}
            ${createInfoItem('Emergency Contact', currentUser.emergency_contact, true)}
        `;
    }

    function createInfoItem(label, value, fullWidth = false) {
        return `
            <div class="info-item ${fullWidth ? 'full-width' : ''}">
                <label>${escapeHTML(label)}</label>
                <span>${escapeHTML(plainText(value))}</span>
            </div>
        `;
    }

    function fillProfileForm() {
        fullNameInput.value = plainText(currentUser.full_name, '');
        phoneInput.value = plainText(currentUser.phone_number, '');
        emailInput.value = plainText(currentUser.email, '');
        birthdayInput.value = toInputDate(currentUser.birthday);
        dateStartedInput.value = toInputDate(currentUser.date_started);
        addressInput.value = plainText(currentUser.address, '');
        emergencyInput.value = plainText(currentUser.emergency_contact, '');
    }

    function renderSchedule(scheduleRows) {
        const scheduleMap = new Map();
        const defaultBranchName = getBranchName();

        scheduleRows.forEach(row => {
            const dayKey = normalizeDay(row.day_of_week || row.day || row.week_day);
            const shiftValue = row.shift_type || row.shift || row.schedule || '';
            const rowBranchName = plainText(
                row.branch_name || row.branch || row.assigned_branch || row.branch_assigned,
                defaultBranchName
            );

            if (dayKey) {
                scheduleMap.set(dayKey, {
                    shiftType: shiftValue,
                    branchName: rowBranchName
                });
            }
        });

        scheduleGrid.innerHTML = '';

        daysOfWeek.forEach(day => {
            const scheduleData = scheduleMap.get(day.key) || {
                shiftType: '',
                branchName: defaultBranchName
            };
            const shiftData = getShiftData(scheduleData.shiftType);
            const branchName = plainText(scheduleData.branchName, defaultBranchName);

            const card = document.createElement('div');
            card.className = 'schedule-day-card';
            card.innerHTML = `
                <div class="day-topline">
                    <span>${escapeHTML(day.short)}</span>
                </div>
                <h4>${escapeHTML(day.label)} <span class="day-branch-separator">-</span> <span class="day-branch-name">${escapeHTML(branchName)}</span></h4>
                <span class="shift-pill ${shiftData.className}">${escapeHTML(shiftData.label)}</span>
                <p class="schedule-note">${escapeHTML(shiftData.note)}</p>
            `;

            scheduleGrid.appendChild(card);
        });
    }

    function getShiftData(shiftType) {
        const cleanShift = String(shiftType || '')
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_');

        if (cleanShift === 'opening' || cleanShift === 'open') {
            return {
                label: 'OPENING',
                className: 'shift-opening',
                note: 'Assigned opening shift'
            };
        }

        if (cleanShift === 'closing' || cleanShift === 'close') {
            return {
                label: 'CLOSING',
                className: 'shift-closing',
                note: 'Assigned closing shift'
            };
        }

        if (cleanShift === 'day_off' || cleanShift === 'off' || cleanShift === 'rest_day') {
            return {
                label: 'DAY OFF',
                className: 'shift-off',
                note: 'No duty assigned'
            };
        }

        if (cleanShift) {
            return {
                label: cleanShift.replace(/_/g, ' ').toUpperCase(),
                className: 'shift-custom',
                note: 'Custom shift assigned'
            };
        }

        return {
            label: 'NO SCHEDULE',
            className: 'shift-none',
            note: 'Not assigned yet'
        };
    }

    function toggleEditMode(isEditing) {
        if (isEditing) {
            profileView.classList.add('hidden');
            profileForm.classList.remove('hidden');
            editProfileBtn.classList.add('hidden');
            fillProfileForm();
        } else {
            profileView.classList.remove('hidden');
            profileForm.classList.add('hidden');
            editProfileBtn.classList.remove('hidden');
        }
    }

    async function saveProfileChanges(event) {
        event.preventDefault();

        const updatedProfile = {
            full_name: fullNameInput.value.trim(),
            phone_number: phoneInput.value.trim(),
            email: emailInput.value.trim(),
            birthday: birthdayInput.value,
            date_started: dateStartedInput.value,
            address: addressInput.value.trim(),
            emergency_contact: emergencyInput.value.trim()
        };

        if (!updatedProfile.full_name || !updatedProfile.phone_number || !updatedProfile.email || !updatedProfile.birthday || !updatedProfile.date_started || !updatedProfile.address || !updatedProfile.emergency_contact) {
            showToast('Please complete all required fields.', 'error');
            return;
        }

        saveProfileBtn.disabled = true;
        saveProfileBtn.textContent = 'Saving...';

        try {
            const { data, error } = await supabase
                .from('profiles')
                .update(updatedProfile)
                .eq('id', currentUser.id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('No updated profile returned.');

            currentUser = {
                ...data,
                role: normalizeRole(data.role)
            };

            await loadBranch();
            renderDashboard();
            toggleEditMode(false);
            showToast('Profile updated successfully.', 'success');
        } catch (error) {
            console.error('Profile update failed:', error);
            showToast('Failed to update profile. Please try again.', 'error');
        } finally {
            saveProfileBtn.disabled = false;
            saveProfileBtn.textContent = 'Save Changes';
        }
    }

    async function handlePhotoUpload(file) {
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            showToast('Please select a valid image file.', 'error');
            return;
        }

        const maxSize = 5 * 1024 * 1024;
        if (file.size > maxSize) {
            showToast('Image is too large. Please use 5MB or below.', 'error');
            return;
        }

        uploadPhotoBtn.disabled = true;
        uploadPhotoBtn.textContent = 'Uploading...';

        try {
            const compressedPhoto = await compressImageToDataUrl(file);

            const { data, error } = await supabase
                .from('profiles')
                .update({ photo_url: compressedPhoto })
                .eq('id', currentUser.id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('No updated profile returned.');

            currentUser = {
                ...data,
                role: normalizeRole(data.role)
            };

            renderDashboard();
            showToast('Profile photo updated successfully.', 'success');
        } catch (error) {
            console.error('Photo upload failed:', error);
            showToast('Failed to update photo. Please try again.', 'error');
        } finally {
            uploadPhotoBtn.disabled = false;
            uploadPhotoBtn.textContent = 'Change Photo';
            photoInput.value = '';
        }
    }

    async function removeProfilePhoto() {
        if (!currentUser.photo_url) return;

        const confirmRemove = confirm('Remove your profile photo?');
        if (!confirmRemove) return;

        removePhotoBtn.disabled = true;

        try {
            const { data, error } = await supabase
                .from('profiles')
                .update({ photo_url: null })
                .eq('id', currentUser.id)
                .select()
                .maybeSingle();

            if (error) throw error;
            if (!data) throw new Error('No updated profile returned.');

            currentUser = {
                ...data,
                role: normalizeRole(data.role)
            };

            renderDashboard();
            showToast('Profile photo removed.', 'success');
        } catch (error) {
            console.error('Remove photo failed:', error);
            showToast('Failed to remove photo. Please try again.', 'error');
        } finally {
            removePhotoBtn.disabled = false;
        }
    }

    function compressImageToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = () => {
                const image = new Image();

                image.onload = () => {
                    const canvas = document.createElement('canvas');
                    const size = 500;
                    const context = canvas.getContext('2d');

                    canvas.width = size;
                    canvas.height = size;

                    context.fillStyle = '#ffffff';
                    context.fillRect(0, 0, size, size);

                    let sourceX = 0;
                    let sourceY = 0;
                    let sourceWidth = image.width;
                    let sourceHeight = image.height;

                    if (image.width > image.height) {
                        sourceWidth = image.height;
                        sourceX = (image.width - image.height) / 2;
                    } else if (image.height > image.width) {
                        sourceHeight = image.width;
                        sourceY = (image.height - image.width) / 2;
                    }

                    context.drawImage(
                        image,
                        sourceX,
                        sourceY,
                        sourceWidth,
                        sourceHeight,
                        0,
                        0,
                        size,
                        size
                    );

                    resolve(canvas.toDataURL('image/jpeg', 0.82));
                };

                image.onerror = () => reject(new Error('Could not load image.'));
                image.src = reader.result;
            };

            reader.onerror = () => reject(new Error('Could not read image file.'));
            reader.readAsDataURL(file);
        });
    }

    function logout() {
        clearLoginSession();
        window.location.replace(LOGIN_PAGE);
    }

    function getSessionIdentity() {
        const authUser = safeParseJSON(sessionStorage.getItem('adrianosAuthUser'));

        const userId =
            authUser?.id ||
            sessionStorage.getItem('adrianosLoggedUserId') ||
            sessionStorage.getItem('adrianosEmployeeUserId') ||
            sessionStorage.getItem('adrianosTlUserId');

        const username =
            authUser?.username ||
            sessionStorage.getItem('adrianosLoggedUsername') ||
            sessionStorage.getItem('adrianosEmployeeUsername') ||
            sessionStorage.getItem('adrianosTlUsername');

        const role = normalizeRole(
            authUser?.role ||
            sessionStorage.getItem('adrianosLoggedRole') ||
            sessionStorage.getItem('adrianosEmployeeRole') ||
            sessionStorage.getItem('adrianosTlRole')
        );

        return { userId, username, role };
    }

    function refreshCurrentSession(profile) {
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

    function clearLoginSession() {
        SESSION_KEYS.forEach(key => sessionStorage.removeItem(key));
    }

    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = `toast ${type}`;

        window.clearTimeout(showToast.timer);
        showToast.timer = window.setTimeout(() => {
            toast.classList.add('hidden');
        }, 2800);
    }

    function getBranchName() {
        return currentBranch?.name || currentBranch?.branch_name || 'Unassigned';
    }

    function getRoleLabel(role) {
        const cleanRole = normalizeRole(role);

        if (cleanRole === 'team_leader') return 'Team Leader';
        if (cleanRole === 'admin') return 'Admin';
        return 'Employee';
    }

    function getInitials(name) {
        const cleanName = plainText(name, '').trim();

        if (!cleanName) return '--';

        const parts = cleanName.split(/\s+/).filter(Boolean);

        if (parts.length === 1) {
            return parts[0].substring(0, 2).toUpperCase();
        }

        return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
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

    function normalizeDay(dayValue) {
        const cleanDay = String(dayValue || '').trim().toLowerCase();

        const dayMap = {
            monday: 'Mon',
            mon: 'Mon',
            tuesday: 'Tue',
            tue: 'Tue',
            tues: 'Tue',
            wednesday: 'Wed',
            wed: 'Wed',
            thursday: 'Thu',
            thu: 'Thu',
            thurs: 'Thu',
            friday: 'Fri',
            fri: 'Fri',
            saturday: 'Sat',
            sat: 'Sat',
            sunday: 'Sun',
            sun: 'Sun'
        };

        return dayMap[cleanDay] || '';
    }

    function plainText(value, fallback = 'N/A') {
        const text = String(value ?? '').trim();
        return text.length ? text : fallback;
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatDate(dateValue) {
        if (!dateValue) return 'N/A';

        try {
            const date = new Date(`${String(dateValue).substring(0, 10)}T00:00:00`);

            if (Number.isNaN(date.getTime())) {
                return String(dateValue);
            }

            return date.toLocaleDateString('en-PH', {
                year: 'numeric',
                month: 'short',
                day: '2-digit'
            });
        } catch {
            return String(dateValue);
        }
    }

    function toInputDate(dateValue) {
        if (!dateValue) return '';
        return String(dateValue).substring(0, 10);
    }

    function safeParseJSON(value) {
        try {
            return value ? JSON.parse(value) : null;
        } catch {
            return null;
        }
    }

    uploadPhotoBtn.addEventListener('click', () => photoInput.click());

    photoInput.addEventListener('change', event => {
        handlePhotoUpload(event.target.files?.[0]);
    });

    removePhotoBtn.addEventListener('click', removeProfilePhoto);
    refreshScheduleBtn.addEventListener('click', loadSchedule);
    editProfileBtn.addEventListener('click', () => toggleEditMode(true));
    cancelEditBtn.addEventListener('click', () => toggleEditMode(false));
    profileForm.addEventListener('submit', saveProfileChanges);
    logoutBtn.addEventListener('click', logout);
});
