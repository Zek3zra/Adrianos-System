import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
    const ORDERS_TABLE_NAME = 'daily_product_orders';
    const DAILY_EXPENSES_TABLE_NAME = 'daily_expenses';
    const PH_TIMEZONE = 'Asia/Manila';
    // ADMIN PAGE PROTECTION
    const ADMIN_SESSION_MAX_AGE = 8 * 60 * 60 * 1000; // 8 hours
    const isAdminLoggedIn = sessionStorage.getItem('adrianosAdminAuth') === 'true';
    const adminLoginTime = Number(sessionStorage.getItem('adrianosAdminLoginTime') || 0);
    const isSessionExpired = !adminLoginTime || Date.now() - adminLoginTime > ADMIN_SESSION_MAX_AGE;

    if (!isAdminLoggedIn || isSessionExpired) {
        sessionStorage.removeItem('adrianosAdminAuth');
        sessionStorage.removeItem('adrianosAdminLoginTime');
        sessionStorage.removeItem('adrianosAdminUsername');

        window.location.replace('tl-login.html');
        return;
    }

    const logoutBtn = document.getElementById('logoutBtn');
    const usersTableBody = document.getElementById('usersTableBody');
    const scheduleBranchSelect = document.getElementById('scheduleBranchSelect');
    const scheduleTableBody = document.getElementById('scheduleTableBody');
    const exportPdfBtn = document.getElementById('exportPdfBtn');
    const exportStaffBtn = document.getElementById('exportStaffBtn');
    const profileModal = document.getElementById('profileModal');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const pdfLoadingOverlay = document.getElementById('pdfLoadingOverlay');
    const pdfLoadingTitle = document.getElementById('pdfLoadingTitle');
    const pdfLoadingMessage = document.getElementById('pdfLoadingMessage');

    const staffSearchInput = document.getElementById('staffSearchInput');
    const staffRoleFilterSelect = document.getElementById('staffRoleFilterSelect');
    const staffBranchFilterSelect = document.getElementById('staffBranchFilterSelect');
    const staffCountText = document.getElementById('staffCountText');
    const scheduleEmployeeSearchInput = document.getElementById('scheduleEmployeeSearchInput');
    const scheduleCountText = document.getElementById('scheduleCountText');

    let branchesList = [];
    let usersList = [];
    let currentScheduleEmployees = [];
    let currentScheduleRows = [];
    let currentScheduleBranchId = '';
    let adminExpenseSummaryRows = [];
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const coffeeDark = [44, 30, 22];
    const coffeeMedium = [139, 94, 52];
    const cream = [253, 251, 247];
    const border = [224, 220, 211];
    const textGray = [60, 60, 60];

    async function initDashboard() {
        await fetchBranches();
        await fetchUsers();
        ensureAdminExpenseSummaryPanel();
        await loadAdminExpenseSummary();

        scheduleBranchSelect.addEventListener('change', reloadSchedule);

        [staffSearchInput, staffRoleFilterSelect, staffBranchFilterSelect].forEach(element => {
            if (!element) return;
            element.addEventListener('input', renderUsersTable);
            element.addEventListener('change', renderUsersTable);
        });

        if (scheduleEmployeeSearchInput) {
            scheduleEmployeeSearchInput.addEventListener('input', () => {
                renderScheduleTable(currentScheduleEmployees, currentScheduleRows, currentScheduleBranchId);
            });
        }
    }

    function escapeHTML(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function plainText(value, fallback = 'N/A') {
        const text = String(value ?? '').trim();
        return text.length ? text : fallback;
    }


    function normalizeProductCategory(category) {
        const original = String(category || '').trim();
        const clean = original
            .toLowerCase()
            .replace(/[’']/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();

        const starterCategories = new Set([
            'fries and nachos series',
            'quesadilla spree',
            'quesadillas spree',
            'dip it good',
            'hunger crusher',
            'hunger crushers',
            'snack bar remix',
            'snackbar remix'
        ]);

        const riceMealCategories = new Set([
            'kanin get enough',
            'flavor trip',
            'the flavor trip',
            'flavour trip',
            'the flavour trip'
        ]);

        if (starterCategories.has(clean)) return 'Starters';
        if (riceMealCategories.has(clean)) return 'Rice Meals';
        if (clean === 'more to enjoy add ons') return 'More To Enjoy';

        return original || 'Uncategorized';
    }

    function getRoleLabel(role) {
        return role === 'team_leader' ? 'Team Leader' : 'Employee';
    }

    function getBranchName(branchId) {
        if (!branchId) return 'Unassigned';
        return branchesList.find(branch => branch.id === branchId)?.name || 'Unassigned';
    }


    function isMainStoreBranch(branchId) {
        const branchName = getBranchName(branchId).toLowerCase();
        return branchName.includes('main store') || branchName === 'main' || branchName.includes('main branch');
    }

    function normalizeWorkArea(value) {
        const clean = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        return clean === 'kitchen' || clean === 'bar' ? clean : '';
    }

    function normalizeShiftType(value) {
        const clean = String(value || '')
            .trim()
            .toLowerCase()
            .replace(/[\s-]+/g, '_');

        const aliases = {
            '': '',
            open: 'opening',
            opening: 'opening',
            mid: 'mid',
            mid_shift: 'mid',
            mid_10am: 'mid',
            '10_am': 'mid',
            close: 'closing',
            closing: 'closing',
            whole_day: 'whole_day',
            opening_to_closing: 'whole_day',
            open_to_close: 'whole_day',
            off: 'day_off',
            rest_day: 'day_off',
            day_off: 'day_off'
        };

        return aliases[clean] ?? clean;
    }

    function workAreaLabel(value) {
        const area = normalizeWorkArea(value);
        if (area === 'kitchen') return 'KITCHEN';
        if (area === 'bar') return 'BAR';
        return '';
    }

    function sortEmployees(list) {
        return [...list].sort((a, b) => {
            const branchCompare = getBranchName(a.branch_id).localeCompare(getBranchName(b.branch_id));
            if (branchCompare !== 0) return branchCompare;

            const roleA = a.role === 'team_leader' ? 0 : 1;
            const roleB = b.role === 'team_leader' ? 0 : 1;
            if (roleA !== roleB) return roleA - roleB;

            return plainText(a.full_name, '').localeCompare(plainText(b.full_name, ''));
        });
    }

    function getInitials(name) {
        if (!name) return '??';

        const parts = name.trim().split(/\s+/).filter(Boolean);

        if (parts.length === 0) return '??';
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();

        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    function renderAvatarElement(user) {
        if (user.photo_url) {
            return `<img src="${escapeHTML(user.photo_url)}" class="modal-photo" alt="Profile">`;
        }

        return `<div class="avatar-initials">${escapeHTML(getInitials(user.full_name))}</div>`;
    }

    function showPdfLoading(title, message) {
        pdfLoadingTitle.textContent = title;
        pdfLoadingMessage.textContent = message;
        pdfLoadingOverlay.style.display = 'flex';
        exportPdfBtn.disabled = true;
        exportStaffBtn.disabled = true;

    }

    function hidePdfLoading() {
        pdfLoadingOverlay.style.display = 'none';
        exportPdfBtn.disabled = false;
        exportStaffBtn.disabled = false;

    }

    async function fetchBranches() {
        try {
            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .order('name', { ascending: true });

            if (error) throw error;

            branchesList = data || [];
            scheduleBranchSelect.innerHTML = '<option value="">Choose a branch to view schedule...</option>';
            if (staffBranchFilterSelect) {
                staffBranchFilterSelect.innerHTML = '<option value="all">All Branches</option><option value="unassigned">Unassigned</option>';
            }

            branchesList.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.name;
                scheduleBranchSelect.appendChild(option);

                if (staffBranchFilterSelect) {
                    const staffOption = document.createElement('option');
                    staffOption.value = branch.id;
                    staffOption.textContent = branch.name;
                    staffBranchFilterSelect.appendChild(staffOption);
                }
            });
        } catch (error) {
            console.error('Error loading branches:', JSON.stringify(error, null, 2));
            alert('Failed to load branches. Please check your Supabase connection.');
        }
    }

    async function fetchUsers() {
        try {
            const { data: users, error } = await supabase
                .from('profiles')
                .select('*')
                .order('full_name', { ascending: true });

            if (error) throw error;

            usersList = users || [];
            renderUsersTable();
        } catch (error) {
            console.error('Error loading users:', JSON.stringify(error, null, 2));
            usersTableBody.innerHTML = '<tr><td colspan="5" class="loading-text error-text">Failed to load staff data.</td></tr>';
        }
    }

    function renderUsersTable() {
        const staffUsers = getFilteredStaffUsers();
        usersTableBody.innerHTML = '';

        if (staffCountText) {
            const totalStaff = usersList.filter(user => user.role !== 'admin').length;
            staffCountText.textContent = `${staffUsers.length} of ${totalStaff} shown`;
        }

        if (staffUsers.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="5" class="loading-text">No staff found for the selected search or filter.</td></tr>';
            return;
        }

        staffUsers.forEach(user => {
            const tr = document.createElement('tr');

            let branchOptionsHTML = '<option value="">Unassigned</option>';
            branchesList.forEach(branch => {
                const selected = user.branch_id === branch.id ? 'selected' : '';
                branchOptionsHTML += `<option value="${escapeHTML(branch.id)}" ${selected}>${escapeHTML(branch.name)}</option>`;
            });

            const roleOptionsHTML = `
                <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Employee</option>
                <option value="team_leader" ${user.role === 'team_leader' ? 'selected' : ''}>Team Leader</option>
            `;

            tr.innerHTML = `
                <td><strong>${escapeHTML(user.full_name)}</strong><span class="mobile-subtext">${escapeHTML(getRoleLabel(user.role))} • ${escapeHTML(getBranchName(user.branch_id))}</span></td>
                <td><button class="btn outline-btn small-btn view-profile-btn" data-id="${escapeHTML(user.id)}">View Profile</button></td>
                <td><select class="table-select role-select" data-user-id="${escapeHTML(user.id)}">${roleOptionsHTML}</select></td>
                <td><select class="table-select branch-select" data-user-id="${escapeHTML(user.id)}">${branchOptionsHTML}</select></td>
                <td><button class="btn danger-btn small-btn delete-user-btn" data-id="${escapeHTML(user.id)}">Delete</button></td>
            `;

            usersTableBody.appendChild(tr);
        });

        attachTableEventListeners();
    }

    function getFilteredStaffUsers() {
        const searchValue = plainText(staffSearchInput?.value, '').toLowerCase();
        const roleValue = staffRoleFilterSelect?.value || 'all';
        const branchValue = staffBranchFilterSelect?.value || 'all';

        return sortEmployees(usersList.filter(user => {
            if (user.role === 'admin') return false;

            const searchText = `${user.full_name || ''} ${user.username || ''} ${user.email || ''} ${user.phone_number || ''}`.toLowerCase();
            const matchesSearch = !searchValue || searchText.includes(searchValue);
            const matchesRole = roleValue === 'all' || user.role === roleValue;
            const matchesBranch = branchValue === 'all' ||
                (branchValue === 'unassigned' ? !user.branch_id : user.branch_id === branchValue);

            return matchesSearch && matchesRole && matchesBranch;
        }));
    }

    function attachTableEventListeners() {
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', async event => {
                const userId = event.target.getAttribute('data-user-id');
                const newRole = event.target.value;

                try {
                    const { error } = await supabase
                        .from('profiles')
                        .update({ role: newRole })
                        .eq('id', userId);

                    if (error) throw error;

                    const targetUser = usersList.find(user => user.id === userId);
                    if (targetUser) targetUser.role = newRole;
                    renderUsersTable();

                    if (scheduleBranchSelect.value) await reloadSchedule();
                } catch (error) {
                    console.error('Role update failed:', JSON.stringify(error, null, 2));
                    alert('Failed to update role. Please try again.');
                    await fetchUsers();
                }
            });
        });

        document.querySelectorAll('.branch-select').forEach(select => {
            select.addEventListener('change', async event => {
                const userId = event.target.getAttribute('data-user-id');
                const newBranchId = event.target.value || null;

                try {
                    const { error } = await supabase
                        .from('profiles')
                        .update({ branch_id: newBranchId })
                        .eq('id', userId);

                    if (error) throw error;

                    const targetUser = usersList.find(user => user.id === userId);
                    if (targetUser) targetUser.branch_id = newBranchId;
                    renderUsersTable();

                    if (scheduleBranchSelect.value) await reloadSchedule();
                } catch (error) {
                    console.error('Branch update failed:', JSON.stringify(error, null, 2));
                    alert('Failed to update branch assignment. Please try again.');
                    await fetchUsers();
                }
            });
        });

        document.querySelectorAll('.view-profile-btn').forEach(button => {
            button.addEventListener('click', event => {
                openProfileModal(event.target.getAttribute('data-id'));
            });
        });

        document.querySelectorAll('.delete-user-btn').forEach(button => {
            button.addEventListener('click', async event => {
                const userId = event.target.getAttribute('data-id');
                const targetUser = usersList.find(user => user.id === userId);
                if (!targetUser) return;

                const shouldDelete = confirm(`Are you sure you want to delete ${targetUser.full_name}?`);
                if (!shouldDelete) return;

                try {
                    await deleteEmployeeSchedules(userId);

                    const { error } = await supabase
                        .from('profiles')
                        .delete()
                        .eq('id', userId);

                    if (error) throw error;

                    alert('Employee record deleted.');
                    await fetchUsers();
                    await reloadSchedule();
                } catch (error) {
                    console.error('Delete failed:', JSON.stringify(error, null, 2));
                    alert('Failed to delete employee. This employee may still have related records.');
                }
            });
        });
    }

    async function deleteEmployeeSchedules(userId) {
        const { error } = await supabase
            .from('schedules')
            .delete()
            .eq('employee_id', userId);

        if (error) throw error;
    }

    function openProfileModal(userId) {
        const user = usersList.find(item => item.id === userId);
        if (!user) return;

        document.getElementById('modalName').textContent = plainText(user.full_name);
        document.getElementById('modalRoleBadge').textContent = getRoleLabel(user.role);
        document.getElementById('modalUsername').textContent = plainText(user.username);
        document.getElementById('modalPhone').textContent = plainText(user.phone_number);
        document.getElementById('modalEmail').textContent = plainText(user.email, 'None Registered');
        document.getElementById('modalAddress').textContent = plainText(user.address);
        document.getElementById('modalBirthday').textContent = plainText(user.birthday);
        document.getElementById('modalDateStarted').textContent = plainText(user.date_started);
        document.getElementById('modalEmergency').textContent = plainText(user.emergency_contact);
        document.getElementById('modalAvatarWrapper').innerHTML = renderAvatarElement(user);

        profileModal.style.display = 'flex';
    }

    closeModalBtn.addEventListener('click', () => {
        profileModal.style.display = 'none';
    });

    window.addEventListener('click', event => {
        if (event.target === profileModal) {
            profileModal.style.display = 'none';
        }
    });

    async function reloadSchedule() {
        const branchId = scheduleBranchSelect.value;

        if (!branchId) {
            currentScheduleEmployees = [];
            currentScheduleRows = [];
            currentScheduleBranchId = '';
            if (scheduleCountText) scheduleCountText.textContent = 'Select a branch';
            scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">Select a branch to view schedules.</td></tr>';
            return;
        }

        scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">Loading schedules...</td></tr>';

        try {
            const { data: employees, error: empError } = await supabase
                .from('profiles')
                .select('*')
                .eq('branch_id', branchId)
                .neq('role', 'admin')
                .order('full_name', { ascending: true });

            if (empError) throw empError;

            if (!employees || employees.length === 0) {
                currentScheduleEmployees = [];
                currentScheduleRows = [];
                currentScheduleBranchId = branchId;
                if (scheduleCountText) scheduleCountText.textContent = '0 employees';
                scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">No employees assigned to this branch yet.</td></tr>';
                return;
            }

            const { data: existingSchedules, error: schedError } = await supabase
                .from('schedules')
                .select('*')
                .eq('branch_id', branchId);

            if (schedError) throw schedError;

            currentScheduleEmployees = sortEmployees(employees);
            currentScheduleRows = existingSchedules || [];
            currentScheduleBranchId = branchId;
            renderScheduleTable(currentScheduleEmployees, currentScheduleRows, currentScheduleBranchId);
        } catch (error) {
            console.error('Schedule loading failed:', JSON.stringify(error, null, 2));
            scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text error-text">Error loading schedule matrix.</td></tr>';
        }
    }

    function renderScheduleTable(employees, existingSchedules, branchId) {
        scheduleTableBody.innerHTML = '';

        const searchValue = plainText(scheduleEmployeeSearchInput?.value, '').toLowerCase();
        const visibleEmployees = employees.filter(employee => {
            const text = `${employee.full_name || ''} ${employee.username || ''}`.toLowerCase();
            return !searchValue || text.includes(searchValue);
        });
        const mainStoreSelected = isMainStoreBranch(branchId);

        if (scheduleCountText) {
            scheduleCountText.textContent = branchId
                ? `${visibleEmployees.length} of ${employees.length} shown${mainStoreSelected ? ' • Kitchen/Bar enabled' : ''}`
                : 'Select a branch';
        }

        if (!visibleEmployees.length) {
            scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">No employee found for this schedule search.</td></tr>';
            return;
        }

        visibleEmployees.forEach(employee => {
            const tr = document.createElement('tr');
            let rowHTML = `<td><strong>${escapeHTML(employee.full_name)}</strong><span class="mobile-subtext">${escapeHTML(getRoleLabel(employee.role))}</span></td>`;

            daysOfWeek.forEach(day => {
                const existingShift = existingSchedules.find(schedule => {
                    return schedule.employee_id === employee.id && schedule.day_of_week === day;
                });

                const shiftValue = normalizeShiftType(existingShift ? existingShift.shift_type : '');
                const workAreaValue = normalizeWorkArea(existingShift?.work_area);
                const workAreaDisabled = !shiftValue || shiftValue === 'day_off';

                rowHTML += `
                    <td>
                        <div class="schedule-cell-controls">
                            <select class="table-select shift-select" data-emp-id="${escapeHTML(employee.id)}" data-day="${escapeHTML(day)}">
                                <option value="" ${shiftValue === '' ? 'selected' : ''}>-</option>
                                <option value="opening" ${shiftValue === 'opening' ? 'selected' : ''}>Opening</option>
                                <option value="mid" ${shiftValue === 'mid' || shiftValue === 'mid_shift' ? 'selected' : ''}>Mid (10 AM)</option>
                                <option value="closing" ${shiftValue === 'closing' ? 'selected' : ''}>Closing</option>
                                <option value="whole_day" ${shiftValue === 'whole_day' || shiftValue === 'opening_to_closing' ? 'selected' : ''}>Opening to Closing</option>
                                <option value="day_off" ${shiftValue === 'day_off' ? 'selected' : ''}>Day Off</option>
                            </select>
                            ${mainStoreSelected ? `
                                <select class="table-select work-area-select" data-emp-id="${escapeHTML(employee.id)}" data-day="${escapeHTML(day)}" ${workAreaDisabled ? 'disabled' : ''}>
                                    <option value="" ${workAreaValue === '' ? 'selected' : ''}>Area</option>
                                    <option value="kitchen" ${workAreaValue === 'kitchen' ? 'selected' : ''}>Kitchen</option>
                                    <option value="bar" ${workAreaValue === 'bar' ? 'selected' : ''}>Bar</option>
                                </select>
                            ` : ''}
                        </div>
                    </td>
                `;
            });

            tr.innerHTML = rowHTML;
            scheduleTableBody.appendChild(tr);
        });

        attachScheduleListeners(branchId);
    }

    function attachScheduleListeners(branchId) {
        document.querySelectorAll('.shift-select').forEach(select => {
            select.addEventListener('change', async event => {
                const empId = event.target.getAttribute('data-emp-id');
                const day = event.target.getAttribute('data-day');
                const shiftType = normalizeShiftType(event.target.value);
                const areaSelect = scheduleTableBody.querySelector(`.work-area-select[data-emp-id="${CSS.escape(empId)}"][data-day="${CSS.escape(day)}"]`);
                let workArea = normalizeWorkArea(areaSelect?.value);

                if (!shiftType || shiftType === 'day_off') {
                    workArea = '';
                    if (areaSelect) {
                        areaSelect.value = '';
                        areaSelect.disabled = true;
                    }
                } else if (areaSelect) {
                    areaSelect.disabled = false;
                }

                try {
                    await saveScheduleAssignment(branchId, empId, day, shiftType, workArea);
                    updateCurrentScheduleCache(empId, day, branchId, shiftType, workArea);
                } catch (error) {
                    console.error('Schedule save failed:', error);
                    alert(getScheduleSaveErrorMessage(error));
                    await reloadSchedule();
                }
            });
        });

        document.querySelectorAll('.work-area-select').forEach(select => {
            select.addEventListener('change', async event => {
                const empId = event.target.getAttribute('data-emp-id');
                const day = event.target.getAttribute('data-day');
                const shiftSelect = scheduleTableBody.querySelector(`.shift-select[data-emp-id="${CSS.escape(empId)}"][data-day="${CSS.escape(day)}"]`);
                const shiftType = normalizeShiftType(shiftSelect?.value || '');
                const workArea = normalizeWorkArea(event.target.value);

                if (!shiftType || shiftType === 'day_off') {
                    event.target.value = '';
                    event.target.disabled = true;
                    return;
                }

                try {
                    await saveScheduleAssignment(branchId, empId, day, shiftType, workArea);
                    updateCurrentScheduleCache(empId, day, branchId, shiftType, workArea);
                } catch (error) {
                    console.error('Work area save failed:', error);
                    alert(getScheduleSaveErrorMessage(error, true));
                    await reloadSchedule();
                }
            });
        });
    }

    function getScheduleSaveErrorMessage(error, isWorkAreaOnly = false) {
        const code = String(error?.code || '');
        const rawMessage = String(error?.message || error?.details || '');
        const message = rawMessage.toLowerCase();
        const constraint = String(error?.constraint || '').toLowerCase();
        const details = [code && `Code: ${code}`, constraint && `Constraint: ${constraint}`, rawMessage]
            .filter(Boolean)
            .join(' | ');

        if (constraint.includes('work_area') || message.includes('work_area')) {
            return `Supabase rejected the Kitchen/Bar value. Only kitchen, bar, or blank are allowed.${details ? `\n\n${details}` : ''}`;
        }

        if (constraint.includes('shift_type') || message.includes('shift_type') || (code === '23514' && !isWorkAreaOnly)) {
            return `Supabase rejected the shift value. The page now converts Mid (10 AM) to the exact database value "mid". Replace both admin-dashboard.html and admin-dashboard.js, then hard-refresh the page.${details ? `\n\n${details}` : ''}`;
        }

        if (code === '42703' || code === 'PGRST204' || (message.includes('column') && message.includes('work_area'))) {
            return `The schedules.work_area column is not available to the API yet. Reload the Supabase schema cache, then refresh this page.${details ? `\n\n${details}` : ''}`;
        }

        if (code === '42501' || message.includes('row-level security') || message.includes('permission denied')) {
            return `Supabase blocked the schedule update because of permissions or Row Level Security.${details ? `\n\n${details}` : ''}`;
        }

        if (isWorkAreaOnly) {
            return `Failed to save Kitchen/Bar assignment.${details ? `\n\n${details}` : ''}`;
        }

        return `Failed to save schedule.${details ? `\n\n${details}` : ''}`;
    }

    function isShiftConstraintError(error) {
        const code = String(error?.code || '');
        const message = String(error?.message || '').toLowerCase();
        return code === '23514' || message.includes('check constraint') || message.includes('shift_type');
    }

    function updateCurrentScheduleCache(employeeId, day, branchId, shiftType, workArea) {
        const rowIndex = currentScheduleRows.findIndex(row => row.employee_id === employeeId && row.day_of_week === day);

        if (!shiftType) {
            if (rowIndex >= 0) currentScheduleRows.splice(rowIndex, 1);
            return;
        }

        const nextRow = {
            ...(rowIndex >= 0 ? currentScheduleRows[rowIndex] : {}),
            employee_id: employeeId,
            branch_id: branchId,
            day_of_week: day,
            shift_type: shiftType,
            work_area: normalizeWorkArea(workArea) || null
        };

        if (rowIndex >= 0) currentScheduleRows[rowIndex] = nextRow;
        else currentScheduleRows.push(nextRow);
    }

    async function saveScheduleAssignment(branchId, employeeId, day, shiftType, workArea = '') {
        shiftType = normalizeShiftType(shiftType);
        const normalizedArea = normalizeWorkArea(workArea) || null;

        const allowedShiftTypes = new Set(['', 'opening', 'mid', 'closing', 'whole_day', 'day_off']);
        if (!allowedShiftTypes.has(shiftType)) {
            const clientError = new Error(`Unsupported shift value before save: ${shiftType}`);
            clientError.code = 'CLIENT_SHIFT_VALUE';
            throw clientError;
        }
        const { data: existingRows, error: findError } = await supabase
            .from('schedules')
            .select('id, branch_id, shift_type, work_area, created_at')
            .eq('employee_id', employeeId)
            .eq('day_of_week', day)
            .order('created_at', { ascending: true });

        if (findError) throw findError;

        const rows = existingRows || [];
        const mainRow = rows.length > 0 ? rows[0] : null;
        const duplicateRows = rows.slice(1);

        if (duplicateRows.length > 0) {
            const duplicateIds = duplicateRows.map(row => row.id);
            const { error: duplicateDeleteError } = await supabase
                .from('schedules')
                .delete()
                .in('id', duplicateIds);

            if (duplicateDeleteError) throw duplicateDeleteError;
        }

        if (!shiftType) {
            if (!mainRow) return;
            const { error: deleteError } = await supabase
                .from('schedules')
                .delete()
                .eq('id', mainRow.id);

            if (deleteError) throw deleteError;
            return;
        }

        const payload = {
            branch_id: branchId,
            shift_type: shiftType,
            work_area: shiftType === 'day_off' ? null : normalizedArea
        };

        if (mainRow) {
            let { error: updateError } = await supabase
                .from('schedules')
                .update(payload)
                .eq('id', mainRow.id);

            // Compatibility fallback for projects that previously stored the same shift
            // under the opening_to_closing name instead of whole_day.
            if (updateError && payload.shift_type === 'whole_day' && isShiftConstraintError(updateError)) {
                const fallbackPayload = { ...payload, shift_type: 'opening_to_closing' };
                const fallbackResult = await supabase
                    .from('schedules')
                    .update(fallbackPayload)
                    .eq('id', mainRow.id);
                updateError = fallbackResult.error;
            }

            if (updateError) throw updateError;
            return;
        }

        let insertPayload = {
            employee_id: employeeId,
            day_of_week: day,
            ...payload
        };
        let { error: insertError } = await supabase
            .from('schedules')
            .insert(insertPayload);

        if (insertError && payload.shift_type === 'whole_day' && isShiftConstraintError(insertError)) {
            insertPayload = { ...insertPayload, shift_type: 'opening_to_closing' };
            const fallbackResult = await supabase
                .from('schedules')
                .insert(insertPayload);
            insertError = fallbackResult.error;
        }

        if (insertError) {
            const isConflictError =
                insertError.code === '23505' ||
                insertError.status === 409 ||
                String(insertError.message || '').toLowerCase().includes('duplicate');

            if (!isConflictError) throw insertError;

            const { data: retryRows, error: retryFindError } = await supabase
                .from('schedules')
                .select('id')
                .eq('employee_id', employeeId)
                .eq('day_of_week', day)
                .limit(1);

            if (retryFindError) throw retryFindError;
            if (!retryRows || retryRows.length === 0) throw insertError;

            let { error: retryUpdateError } = await supabase
                .from('schedules')
                .update(payload)
                .eq('id', retryRows[0].id);

            if (retryUpdateError && payload.shift_type === 'whole_day' && isShiftConstraintError(retryUpdateError)) {
                const fallbackResult = await supabase
                    .from('schedules')
                    .update({ ...payload, shift_type: 'opening_to_closing' })
                    .eq('id', retryRows[0].id);
                retryUpdateError = fallbackResult.error;
            }

            if (retryUpdateError) throw retryUpdateError;
        }
    }

    function ensurePdfLibraryReady() {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            alert('PDF library failed to load. Please check your internet connection or CDN scripts.');
            return false;
        }

        const testDoc = new window.jspdf.jsPDF();

        if (typeof testDoc.autoTable !== 'function') {
            alert('PDF table library failed to load. Please check the jsPDF AutoTable CDN script.');
            return false;
        }

        return true;
    }

    function formatDateForFile() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }

    function formatGeneratedDate() {
        return new Date().toLocaleString('en-PH', {
            year: 'numeric',
            month: 'short',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function drawPdfHeader(doc, title, subtitle) {
        const pageWidth = doc.internal.pageSize.getWidth();

        doc.setFillColor(...cream);
        doc.rect(0, 0, pageWidth, 28, 'F');

        doc.setTextColor(...coffeeDark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(title, pageWidth / 2, 13, { align: 'center' });

        doc.setTextColor(...coffeeMedium);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(subtitle, pageWidth / 2, 19, { align: 'center' });

        doc.setDrawColor(...coffeeDark);
        doc.setLineWidth(0.45);
        doc.line(12, 25, pageWidth - 12, 25);
    }

    function addPdfPageNumbers(doc) {
        const pageCount = doc.internal.getNumberOfPages();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const generated = `Generated: ${formatGeneratedDate()}`;

        for (let page = 1; page <= pageCount; page++) {
            doc.setPage(page);

            doc.setDrawColor(...border);
            doc.setLineWidth(0.2);
            doc.line(12, pageHeight - 11, pageWidth - 12, pageHeight - 11);

            doc.setTextColor(120, 120, 120);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.text(generated, 12, pageHeight - 6);
            doc.text(`Page ${page} of ${pageCount}`, pageWidth - 12, pageHeight - 6, { align: 'right' });
        }
    }

    function shiftLabel(shiftType) {
        const cleanShift = String(shiftType || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (cleanShift === 'opening') return 'OPENING';
        if (cleanShift === 'mid' || cleanShift === 'mid_shift') return 'MID (10 AM)';
        if (cleanShift === 'closing') return 'CLOSING';
        if (cleanShift === 'whole_day' || cleanShift === 'opening_to_closing') return 'WHOLE DAY';
        if (cleanShift === 'day_off') return 'DAY OFF';
        return '-';
    }

    function getScheduleValue(allSchedules, employee, branch, day) {
        const row = allSchedules.find(schedule => {
            return schedule.employee_id === employee.id &&
                schedule.branch_id === branch.id &&
                schedule.day_of_week === day;
        });

        const shift = shiftLabel(row?.shift_type);
        const area = isMainStoreBranch(branch.id) ? workAreaLabel(row?.work_area) : '';
        return area && shift !== 'DAY OFF' && shift !== '-' ? `${shift}\n${area}` : shift;
    }

    function initProductOrdersReport() {
        orderDateInput.value = getPHDateKey();
    }

    async function loadProductOrdersReport() {
        const selectedDate = orderDateInput.value || getPHDateKey();
        orderDateInput.value = selectedDate;

        ordersTableBody.innerHTML = '<tr><td colspan="9" class="loading-text">Loading product orders...</td></tr>';
        refreshOrdersBtn.disabled = true;
        refreshOrdersBtn.textContent = 'Loading...';

        try {
            let query = supabase
                .from(ORDERS_TABLE_NAME)
                .select('*')
                .eq('report_date', selectedDate)
                .order('quantity', { ascending: false })
                .order('product_name', { ascending: true });

            if (orderBranchSelect.value && orderBranchSelect.value !== 'all') {
                query = query.eq('branch_key', orderBranchSelect.value);
            }

            const { data, error } = await query;

            if (error) throw error;

            dailyProductOrders = (data || []).map(row => ({
                ...row,
                category: normalizeProductCategory(row.category)
            }));
            renderProductOrdersReport();
        } catch (error) {
            console.error('Product orders load failed:', JSON.stringify(error, null, 2));
            dailyProductOrders = [];
            renderEmptyProductOrders('Failed to load product orders. Please check the daily_product_orders table.');
        } finally {
            refreshOrdersBtn.disabled = false;
            refreshOrdersBtn.textContent = 'Refresh Orders';
        }
    }

    function renderProductOrdersReport() {
        const rows = dailyProductOrders.filter(row => Number(row.quantity) > 0);
        const totalQty = rows.reduce((sum, row) => sum + getOrderQuantity(row), 0);
        const topProducts = getTopProducts(rows);
        const branchBreakdown = getBranchBreakdown(rows);
        const cupUsage = getCupUsage(rows);

        ordersTotalQty.textContent = String(totalQty);
        ordersActiveProducts.textContent = String(new Set(rows.map(row => row.product_key)).size);
        ordersBranchCount.textContent = String(branchBreakdown.length);
        ordersTopProduct.textContent = topProducts.length ? `${topProducts[0].productName} (${topProducts[0].quantity})` : 'No orders yet';

        renderCupUsage(cupUsage);
        renderTopProducts(topProducts);
        renderBranchBreakdown(branchBreakdown);
        renderProductOrdersTable(rows);
    }

    function renderEmptyProductOrders(message) {
        ordersTotalQty.textContent = '0';
        ordersActiveProducts.textContent = '0';
        ordersBranchCount.textContent = '0';
        ordersTopProduct.textContent = 'No orders yet';
        renderCupUsage({ cups16oz: 0, cups22oz: 0, totalCups: 0 });
        topProductsList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        branchOrdersList.innerHTML = `<div class="empty-state">${escapeHTML(message)}</div>`;
        ordersTableBody.innerHTML = `<tr><td colspan="9" class="loading-text">${escapeHTML(message)}</td></tr>`;
    }

    function renderTopProducts(topProducts) {
        if (!topProducts.length) {
            topProductsList.innerHTML = '<div class="empty-state">No product orders found for this date.</div>';
            return;
        }

        topProductsList.innerHTML = topProducts.slice(0, 10).map(item => {
            const meta = [item.category, item.variant || 'Regular'].filter(Boolean).join(' • ');

            return `
                <div class="rank-item">
                    <div>
                        <strong>${escapeHTML(item.productName)}</strong>
                        <span>${escapeHTML(meta)}</span>
                    </div>
                    <div class="rank-count">${item.quantity}</div>
                </div>
            `;
        }).join('');
    }

    function renderBranchBreakdown(branchBreakdown) {
        if (!branchBreakdown.length) {
            branchOrdersList.innerHTML = '<div class="empty-state">No branch orders found for this date.</div>';
            return;
        }

        branchOrdersList.innerHTML = branchBreakdown.map(item => {
            return `
                <div class="rank-item">
                    <div>
                        <strong>${escapeHTML(item.branchName)}</strong>
                        <span>${item.activeProducts} active product${item.activeProducts === 1 ? '' : 's'} • 16oz: ${item.cups16oz} • 22oz: ${item.cups22oz} • ${formatPeso(item.estimatedTotal)}</span>
                    </div>
                    <div class="rank-count">${item.quantity}</div>
                </div>
            `;
        }).join('');
    }

    function renderProductOrdersTable(rows) {
        if (!rows.length) {
            ordersTableBody.innerHTML = '<tr><td colspan="9" class="loading-text">No product orders logged for this date.</td></tr>';
            return;
        }

        const sortedRows = [...rows].sort((a, b) => {
            const qtyCompare = getOrderQuantity(b) - getOrderQuantity(a);
            if (qtyCompare !== 0) return qtyCompare;
            return plainText(a.product_name, '').localeCompare(plainText(b.product_name, ''));
        });

        ordersTableBody.innerHTML = sortedRows.map(row => {
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);
            const estimatedTotal = qty * price;

            return `
                <tr>
                    <td><strong>${escapeHTML(row.product_name)}</strong></td>
                    <td>${escapeHTML(row.product_variant || 'Regular')}</td>
                    <td>${escapeHTML(row.category)}</td>
                    <td>${escapeHTML(row.branch_name || 'Unassigned Branch')}</td>
                    <td><span class="qty-badge">${qty}</span></td>
                    <td>${formatPeso(price)}</td>
                    <td class="money-text">${formatPeso(estimatedTotal)}</td>
                    <td>${escapeHTML(row.team_leader_name || 'Team Leader')}</td>
                    <td class="muted-cell">${escapeHTML(formatPHDateTime(row.updated_at || row.created_at))}</td>
                </tr>
            `;
        }).join('');
    }

    function getTopProducts(rows) {
        const map = new Map();

        rows.forEach(row => {
            const key = row.product_key || `${row.product_name}-${row.product_variant}`;
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);

            if (!map.has(key)) {
                map.set(key, {
                    productKey: key,
                    productName: plainText(row.product_name, 'Unnamed Product'),
                    variant: row.product_variant || '',
                    category: row.category || 'Uncategorized',
                    quantity: 0,
                    estimatedTotal: 0
                });
            }

            const item = map.get(key);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
        });

        return [...map.values()].sort((a, b) => {
            if (b.quantity !== a.quantity) return b.quantity - a.quantity;
            return a.productName.localeCompare(b.productName);
        });
    }

    function getBranchBreakdown(rows) {
        const map = new Map();

        rows.forEach(row => {
            const key = row.branch_key || row.branch_name || 'unassigned';
            const qty = getOrderQuantity(row);
            const price = getOrderPrice(row);

            if (!map.has(key)) {
                map.set(key, {
                    branchKey: key,
                    branchName: row.branch_name || getBranchName(row.branch_id) || 'Unassigned Branch',
                    quantity: 0,
                    estimatedTotal: 0,
                    products: new Set(),
                    cups16oz: 0,
                    cups22oz: 0,
                    totalCups: 0
                });
            }

            const item = map.get(key);
            item.quantity += qty;
            item.estimatedTotal += qty * price;
            if (row.product_key) item.products.add(row.product_key);
            addRowCupUsage(item, row);
        });

        return [...map.values()]
            .map(item => ({
                branchKey: item.branchKey,
                branchName: item.branchName,
                quantity: item.quantity,
                estimatedTotal: item.estimatedTotal,
                activeProducts: item.products.size,
                cups16oz: item.cups16oz,
                cups22oz: item.cups22oz,
                totalCups: item.totalCups
            }))
            .sort((a, b) => b.quantity - a.quantity || a.branchName.localeCompare(b.branchName));
    }

    function ensureCupUsagePanel() {
        if (document.getElementById('automaticCupUsagePanel')) return;

        const anchor = typeof ordersTopProduct !== 'undefined' && ordersTopProduct
            ? ordersTopProduct.closest('.card, section, div')
            : (typeof topProductsList !== 'undefined' ? topProductsList : null);
        if (!anchor) return;

        const panel = document.createElement('section');
        panel.id = 'automaticCupUsagePanel';
        panel.style.margin = '14px 0';
        panel.style.padding = '14px';
        panel.style.border = '1px solid rgba(80,57,41,0.18)';
        panel.style.borderRadius = '12px';
        panel.innerHTML = `
            <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:8px;">
                <div><strong>Automatic Cup Inventory</strong><br><span style="font-size:0.82rem;opacity:0.72;">Calculated from recorded 16oz and 22oz drinks.</span></div>
                <strong id="adminTotalCupsText">0 cups</strong>
            </div>
            <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
                <div><span style="font-size:0.8rem;opacity:0.72;">16oz Cups Used</span><br><strong id="admin16ozCupsText">0</strong></div>
                <div><span style="font-size:0.8rem;opacity:0.72;">22oz Cups Used</span><br><strong id="admin22ozCupsText">0</strong></div>
            </div>
        `;
        anchor.insertAdjacentElement('afterend', panel);
    }

    function normalizeCupSize(value, productName = '') {
        const clean = String(value || '').toLowerCase().replace(/\s+/g, '');
        if (clean === '16oz' || clean === '16ounce' || clean === '16ounces') return '16oz';
        if (clean === '22oz' || clean === '22ounce' || clean === '22ounces') return '22oz';

        // Compatibility for records saved before these menu sizes were specified.
        const cleanName = String(productName || '').trim().toLowerCase();
        if (cleanName === 'thai milk tea') return '22oz';
        return '';
    }

    function addRowCupUsage(target, row) {
        const cupSize = normalizeCupSize(row.product_variant, row.product_name);
        if (!cupSize) return target;
        const quantity = getOrderQuantity(row);
        if (cupSize === '16oz') target.cups16oz = (target.cups16oz || 0) + quantity;
        if (cupSize === '22oz') target.cups22oz = (target.cups22oz || 0) + quantity;
        target.totalCups = (target.totalCups || 0) + quantity;
        return target;
    }

    function getCupUsage(rows) {
        return rows.reduce((usage, row) => addRowCupUsage(usage, row), { cups16oz: 0, cups22oz: 0, totalCups: 0 });
    }

    function renderCupUsage(usage) {
        ensureCupUsagePanel();
        const cups16 = document.getElementById('admin16ozCupsText');
        const cups22 = document.getElementById('admin22ozCupsText');
        const total = document.getElementById('adminTotalCupsText');
        if (cups16) cups16.textContent = String(usage.cups16oz || 0);
        if (cups22) cups22.textContent = String(usage.cups22oz || 0);
        if (total) total.textContent = `${usage.totalCups || 0} cup${usage.totalCups === 1 ? '' : 's'}`;
    }

    function getOrderQuantity(row) {
        return Math.max(0, Number(row.quantity) || 0);
    }

    function getOrderPrice(row) {
        return Math.max(0, Number(row.price) || 0);
    }

    function formatPeso(amount) {
        const value = Number(amount) || 0;

        return value.toLocaleString('en-PH', {
            style: 'currency',
            currency: 'PHP',
            minimumFractionDigits: value % 1 === 0 ? 0 : 2,
            maximumFractionDigits: 2
        });
    }

    function getPHDateKey() {
        const parts = new Intl.DateTimeFormat('en-US', {
            timeZone: PH_TIMEZONE,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(new Date());

        const year = parts.find(part => part.type === 'year').value;
        const month = parts.find(part => part.type === 'month').value;
        const day = parts.find(part => part.type === 'day').value;

        return `${year}-${month}-${day}`;
    }

    function formatOrderDateLong(dateKey) {
        if (!dateKey) return 'N/A';

        try {
            const date = new Date(`${dateKey}T00:00:00+08:00`);
            return new Intl.DateTimeFormat('en-PH', {
                timeZone: PH_TIMEZONE,
                year: 'numeric',
                month: 'long',
                day: '2-digit'
            }).format(date);
        } catch {
            return dateKey;
        }
    }

    function formatPHDateTime(value) {
        if (!value) return 'N/A';

        try {
            return new Intl.DateTimeFormat('en-PH', {
                timeZone: PH_TIMEZONE,
                year: 'numeric',
                month: 'short',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            }).format(new Date(value));
        } catch {
            return value;
        }
    }

    function getSelectedOrderBranchLabel() {
        if (!orderBranchSelect.value || orderBranchSelect.value === 'all') {
            return 'All Branches';
        }

        return orderBranchSelect.options[orderBranchSelect.selectedIndex]?.textContent || 'Selected Branch';
    }

    async function exportProductOrdersPdf() {
        if (!ensurePdfLibraryReady()) return;

        if (!dailyProductOrders.length) {
            await loadProductOrdersReport();
        }

        const rows = dailyProductOrders.filter(row => Number(row.quantity) > 0);

        if (!rows.length) {
            alert('No product orders available to export for the selected date.');
            return;
        }

        showPdfLoading('Generating Orders PDF...', 'Compiling daily product demand report.');

        try {
            const selectedDate = orderDateInput.value || getPHDateKey();
            const topProducts = getTopProducts(rows);
            const branchBreakdown = getBranchBreakdown(rows);
            const totalQty = rows.reduce((sum, row) => sum + getOrderQuantity(row), 0);
            const estimatedTotal = rows.reduce((sum, row) => sum + (getOrderQuantity(row) * getOrderPrice(row)), 0);
            const cupUsage = getCupUsage(rows);
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            doc.autoTable({
                body: [
                    ['Report Date', formatOrderDateLong(selectedDate)],
                    ['Branch Filter', getSelectedOrderBranchLabel()],
                    ['Total Orders', String(totalQty)],
                    ['Active Products', String(new Set(rows.map(row => row.product_key)).size)],
                    ['Branches Logged', String(branchBreakdown.length)],
                    ['16oz Cups Used', String(cupUsage.cups16oz)],
                    ['22oz Cups Used', String(cupUsage.cups22oz)],
                    ['Total Cups Used', String(cupUsage.totalCups)],
                    ['Estimated Total Value', formatPeso(estimatedTotal)]
                ],
                startY: 34,
                margin: { left: 12, right: 12 },
                theme: 'grid',
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: 2.5,
                    lineColor: border,
                    lineWidth: 0.15,
                    textColor: textGray
                },
                columnStyles: {
                    0: { cellWidth: 45, fontStyle: 'bold', fillColor: [250, 249, 246], textColor: coffeeDark },
                    1: { cellWidth: 92 }
                },
                didDrawPage() {
                    drawPdfHeader(doc, 'DAILY PRODUCT ORDERS REPORT', 'Adrianos Coffee & Food Portal - Team Leader Logged Orders');
                }
            });

            doc.autoTable({
                head: [['Rank', 'Product', 'Variant', 'Category', 'Total Qty', 'Estimated Value']],
                body: topProducts.slice(0, 15).map((item, index) => [
                    String(index + 1),
                    item.productName,
                    item.variant || 'Regular',
                    item.category,
                    String(item.quantity),
                    formatPeso(item.estimatedTotal)
                ]),
                startY: doc.lastAutoTable.finalY + 7,
                margin: { left: 12, right: 12 },
                theme: 'grid',
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: 2.3,
                    lineColor: border,
                    lineWidth: 0.15,
                    textColor: textGray
                },
                headStyles: {
                    fillColor: coffeeDark,
                    textColor: 255,
                    fontStyle: 'bold'
                },
                columnStyles: {
                    0: { cellWidth: 14, halign: 'center' },
                    4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
                    5: { cellWidth: 30, halign: 'right' }
                }
            });

            doc.autoTable({
                head: [['Branch', 'Active Products', 'Total Qty', '16oz Cups', '22oz Cups', 'Total Cups', 'Estimated Value']],
                body: branchBreakdown.map(item => [
                    item.branchName,
                    String(item.activeProducts),
                    String(item.quantity),
                    String(item.cups16oz),
                    String(item.cups22oz),
                    String(item.totalCups),
                    formatPeso(item.estimatedTotal)
                ]),
                startY: doc.lastAutoTable.finalY + 7,
                margin: { left: 12, right: 12 },
                theme: 'grid',
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: 2.3,
                    lineColor: border,
                    lineWidth: 0.15,
                    textColor: textGray
                },
                headStyles: {
                    fillColor: coffeeMedium,
                    textColor: 255,
                    fontStyle: 'bold'
                },
                columnStyles: {
                    1: { cellWidth: 34, halign: 'center' },
                    2: { cellWidth: 28, halign: 'center', fontStyle: 'bold' },
                    3: { cellWidth: 34, halign: 'right' }
                }
            });

            const detailRows = [...rows]
                .sort((a, b) => getOrderQuantity(b) - getOrderQuantity(a))
                .map(row => {
                    const qty = getOrderQuantity(row);
                    const price = getOrderPrice(row);

                    return [
                        row.product_name || 'Unnamed Product',
                        row.product_variant || 'Regular',
                        row.category || 'Uncategorized',
                        row.branch_name || 'Unassigned Branch',
                        String(qty),
                        formatPeso(price),
                        formatPeso(qty * price),
                        row.team_leader_name || 'Team Leader',
                        formatPHDateTime(row.updated_at || row.created_at)
                    ];
                });

            doc.autoTable({
                head: [['Product', 'Variant', 'Category', 'Branch', 'Qty', 'Price', 'Total', 'Logged By', 'Updated']],
                body: detailRows,
                startY: doc.lastAutoTable.finalY + 7,
                margin: { top: 34, right: 12, bottom: 16, left: 12 },
                theme: 'grid',
                rowPageBreak: 'avoid',
                pageBreak: 'auto',
                styles: {
                    font: 'helvetica',
                    fontSize: 7.2,
                    cellPadding: 2,
                    overflow: 'linebreak',
                    valign: 'middle',
                    lineColor: border,
                    lineWidth: 0.15,
                    textColor: textGray
                },
                headStyles: {
                    fillColor: coffeeDark,
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center'
                },
                columnStyles: {
                    0: { cellWidth: 38, fontStyle: 'bold' },
                    1: { cellWidth: 24 },
                    2: { cellWidth: 35 },
                    3: { cellWidth: 32 },
                    4: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
                    5: { cellWidth: 20, halign: 'right' },
                    6: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
                    7: { cellWidth: 32 },
                    8: { cellWidth: 36 }
                },
                alternateRowStyles: {
                    fillColor: [250, 249, 246]
                },
                didDrawPage() {
                    drawPdfHeader(doc, 'DAILY PRODUCT ORDERS REPORT', 'Adrianos Coffee & Food Portal - Team Leader Logged Orders');
                }
            });

            addPdfPageNumbers(doc);
            doc.save(`Adrianos_Product_Orders_${selectedDate}.pdf`);
        } catch (error) {
            console.error('Product orders PDF export failed:', JSON.stringify(error, null, 2));
            alert('Error compiling product orders PDF. Please check the console for details.');
        } finally {
            hidePdfLoading();
        }
    }

    async function exportMasterSchedulePdf() {
        if (!ensurePdfLibraryReady()) return;

        showPdfLoading('Generating Schedule PDF...', 'Creating a clean A4 landscape schedule document.');

        try {
            const { data: allSchedules, error } = await supabase
                .from('schedules')
                .select('*');

            if (error) throw error;

            const body = [];
            let hasExportData = false;

            branchesList.forEach(branch => {
                const branchEmployees = sortEmployees(
                    usersList.filter(user => user.role !== 'admin' && user.branch_id === branch.id)
                );

                if (branchEmployees.length === 0) return;

                hasExportData = true;

                body.push([
                    {
                        content: branch.name,
                        colSpan: 8,
                        styles: {
                            fillColor: coffeeMedium,
                            textColor: 255,
                            fontStyle: 'bold',
                            halign: 'left',
                            fontSize: 9,
                            cellPadding: 2.5
                        }
                    }
                ]);

                branchEmployees.forEach(employee => {
                    body.push([
                        `${plainText(employee.full_name)}\n${getRoleLabel(employee.role)}`,
                        ...daysOfWeek.map(day => getScheduleValue(allSchedules || [], employee, branch, day))
                    ]);
                });
            });

            if (!hasExportData) {
                alert('No staff with branch assignment available to export.');
                return;
            }

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

            doc.autoTable({
                head: [['Employee', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']],
                body,
                startY: 34,
                margin: { top: 34, right: 12, bottom: 16, left: 12 },
                tableWidth: 'auto',
                theme: 'grid',
                rowPageBreak: 'avoid',
                pageBreak: 'auto',
                styles: {
                    font: 'helvetica',
                    fontSize: 8,
                    cellPadding: 2.2,
                    overflow: 'linebreak',
                    valign: 'middle',
                    lineColor: border,
                    lineWidth: 0.15,
                    textColor: textGray
                },
                headStyles: {
                    fillColor: coffeeDark,
                    textColor: 255,
                    fontStyle: 'bold',
                    halign: 'center',
                    valign: 'middle',
                    fontSize: 8.5
                },
                columnStyles: {
                    0: { cellWidth: 52, fontStyle: 'bold', halign: 'left' },
                    1: { cellWidth: 31, halign: 'center' },
                    2: { cellWidth: 31, halign: 'center' },
                    3: { cellWidth: 31, halign: 'center' },
                    4: { cellWidth: 31, halign: 'center' },
                    5: { cellWidth: 31, halign: 'center' },
                    6: { cellWidth: 31, halign: 'center' },
                    7: { cellWidth: 31, halign: 'center' }
                },
                alternateRowStyles: {
                    fillColor: [250, 249, 246]
                },
                didParseCell(data) {
                    const value = String(data.cell.raw?.content ?? data.cell.raw ?? '');

                    if (data.section === 'body' && data.column.index > 0) {
                        data.cell.styles.fontStyle = 'bold';

                        if (value.startsWith('OPENING')) {
                            data.cell.styles.textColor = [36, 113, 163];
                            data.cell.styles.fillColor = [236, 246, 253];
                        } else if (value.startsWith('MID')) {
                            data.cell.styles.textColor = [139, 94, 52];
                            data.cell.styles.fillColor = [250, 244, 236];
                        } else if (value.startsWith('CLOSING')) {
                            data.cell.styles.textColor = [183, 149, 11];
                            data.cell.styles.fillColor = [255, 249, 225];
                        } else if (value.startsWith('WHOLE DAY')) {
                            data.cell.styles.textColor = [46, 125, 50];
                            data.cell.styles.fillColor = [232, 245, 233];
                        } else if (value === 'DAY OFF') {
                            data.cell.styles.textColor = [100, 100, 100];
                            data.cell.styles.fillColor = [244, 244, 244];
                        } else if (value === '-') {
                            data.cell.styles.textColor = [160, 160, 160];
                            data.cell.styles.fontStyle = 'normal';
                        }
                    }
                },
                didDrawPage() {
                    drawPdfHeader(doc, 'MASTER WEEKLY SCHEDULE', 'Adrianos Coffee & Food Portal - Shifts and Main Store Kitchen/Bar Assignments');
                }
            });

            addPdfPageNumbers(doc);
            doc.save(`Adrianos_Master_Schedules_${formatDateForFile()}.pdf`);
        } catch (error) {
            console.error('Schedule PDF export failed:', JSON.stringify(error, null, 2));
            alert('Error compiling schedule PDF. Please check the console for details.');
        } finally {
            hidePdfLoading();
        }
    }

    function truncateTextForPdf(doc, text, maxWidth) {
        const clean = plainText(text).replace(/\s+/g, ' ');

        if (doc.getTextWidth(clean) <= maxWidth) return clean;

        let output = clean;

        while (output.length > 0 && doc.getTextWidth(`${output}...`) > maxWidth) {
            output = output.slice(0, -1);
        }

        return `${output}...`;
    }

    async function loadImageAsCircleDataUrl(imageUrl) {
        if (!imageUrl) return null;

        try {
            const response = await fetch(imageUrl, { mode: 'cors' });
            if (!response.ok) return null;

            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);

            const image = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = objectUrl;
            });

            const size = 180;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;

            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);

            ctx.save();
            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();

            const imageRatio = image.width / image.height;
            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = image.width;
            let sourceHeight = image.height;

            if (imageRatio > 1) {
                sourceWidth = image.height;
                sourceX = (image.width - sourceWidth) / 2;
            } else if (imageRatio < 1) {
                sourceHeight = image.width;
                sourceY = (image.height - sourceHeight) / 2;
            }

            ctx.drawImage(
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

            ctx.restore();

            ctx.beginPath();
            ctx.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);
            ctx.lineWidth = 8;
            ctx.strokeStyle = '#2C1E16';
            ctx.stroke();

            URL.revokeObjectURL(objectUrl);

            return canvas.toDataURL('image/png');
        } catch (error) {
            console.warn('Could not load employee photo for PDF:', imageUrl, error);
            return null;
        }
    }

    async function preloadStaffPhotos(staffMembers) {
        const photoMap = new Map();

        await Promise.all(
            staffMembers.map(async user => {
                if (!user.photo_url) {
                    photoMap.set(user.id, null);
                    return;
                }

                const photoDataUrl = await loadImageAsCircleDataUrl(user.photo_url);
                photoMap.set(user.id, photoDataUrl);
            })
        );

        return photoMap;
    }

    function drawInitialsAvatar(doc, user, x, y, size) {
        const centerX = x + size / 2;
        const centerY = y + size / 2;

        doc.setFillColor(...coffeeMedium);
        doc.setDrawColor(...coffeeDark);
        doc.setLineWidth(0.45);
        doc.circle(centerX, centerY, size / 2, 'FD');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        doc.text(getInitials(user.full_name), centerX, centerY + 2.5, { align: 'center' });
    }

    function drawStaffCard(doc, user, x, y, width, height, photoDataUrl) {
        const padding = 4;
        const photoSize = 18;
        const photoX = x + padding;
        const photoY = y + 5;
        const textStartX = photoX + photoSize + 5;
        const textMaxWidth = width - photoSize - 15;

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(...border);
        doc.setLineWidth(0.3);
        doc.roundedRect(x, y, width, height, 2, 2, 'FD');

        if (photoDataUrl) {
            doc.addImage(photoDataUrl, 'PNG', photoX, photoY, photoSize, photoSize);
        } else {
            drawInitialsAvatar(doc, user, photoX, photoY, photoSize);
        }

        doc.setTextColor(...coffeeDark);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.3);
        doc.text(truncateTextForPdf(doc, user.full_name, textMaxWidth), textStartX, y + 10);

        doc.setTextColor(...coffeeMedium);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.4);
        doc.text(getRoleLabel(user.role).toUpperCase(), textStartX, y + 14.5);

        doc.setTextColor(110, 110, 110);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.2);
        doc.text(truncateTextForPdf(doc, getBranchName(user.branch_id), textMaxWidth), textStartX, y + 18.6);

        doc.setDrawColor(...border);
        doc.setLineWidth(0.2);
        doc.line(x + padding, y + 27, x + width - padding, y + 27);

        const labelX = x + padding;
        const valueX = x + width - padding;
        const valueWidth = width - 35;

        const fields = [
            ['ID', user.username],
            ['Phone', user.phone_number],
            ['Email', user.email || 'None'],
            ['Address', user.address],
            ['Birthday', user.birthday],
            ['Started', user.date_started],
            ['Emergency', user.emergency_contact]
        ];

        let currentY = y + 34;

        fields.forEach(([label, value]) => {
            doc.setTextColor(...coffeeDark);
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(6.2);
            doc.text(`${label}:`, labelX, currentY);

            doc.setTextColor(...textGray);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.2);
            doc.text(truncateTextForPdf(doc, value, valueWidth), valueX, currentY, { align: 'right' });

            currentY += 4.9;
        });
    }

    async function exportStaffDirectoryPdf() {
        if (!ensurePdfLibraryReady()) return;

        const staffMembers = sortEmployees(usersList.filter(user => user.role !== 'admin'));

        if (staffMembers.length === 0) {
            alert('No staff data available to export.');
            return;
        }

        showPdfLoading('Generating Staff PDF...', 'Loading employee photos and creating the staff directory.');

        try {
            const photoMap = await preloadStaffPhotos(staffMembers);

            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const margin = 12;
            const gap = 6;
            const cardWidth = (pageWidth - (margin * 2) - gap) / 2;
            const cardHeight = 72;
            const startY = 36;
            const bottomLimit = pageHeight - 18;

            let y = startY;

            drawPdfHeader(doc, 'OFFICIAL STAFF DIRECTORY', 'Adrianos Coffee & Food Portal');

            for (let i = 0; i < staffMembers.length; i += 2) {
                if (y + cardHeight > bottomLimit) {
                    doc.addPage();
                    drawPdfHeader(doc, 'OFFICIAL STAFF DIRECTORY', 'Adrianos Coffee & Food Portal');
                    y = startY;
                }

                drawStaffCard(
                    doc,
                    staffMembers[i],
                    margin,
                    y,
                    cardWidth,
                    cardHeight,
                    photoMap.get(staffMembers[i].id)
                );

                if (staffMembers[i + 1]) {
                    drawStaffCard(
                        doc,
                        staffMembers[i + 1],
                        margin + cardWidth + gap,
                        y,
                        cardWidth,
                        cardHeight,
                        photoMap.get(staffMembers[i + 1].id)
                    );
                }

                y += cardHeight + gap;
            }

            addPdfPageNumbers(doc);
            doc.save(`Adrianos_Staff_Directory_${formatDateForFile()}.pdf`);
        } catch (error) {
            console.error('Staff PDF export failed:', JSON.stringify(error, null, 2));
            alert('Error compiling staff PDF. Please check the console for details.');
        } finally {
            hidePdfLoading();
        }
    }


    function ensureAdminExpenseSummaryPanel() {
        let panel = document.getElementById('adminExpenseSummaryPanel');

        if (!panel) {
            panel = document.createElement('section');
            panel.id = 'adminExpenseSummaryPanel';
            panel.className = 'dashboard-card expense-summary-dashboard-card';
            panel.innerHTML = `
                <div class="admin-expense-summary-head">
                    <div class="header-text">
                        <span class="section-kicker">Current Week</span>
                        <h3>Daily expense summary</h3>
                        <p id="adminExpenseWeekLabel">Monday to Sunday • all branches</p>
                    </div>
                    <div class="admin-expense-summary-actions">
                        <button type="button" class="btn outline-btn small-btn" id="adminOpenExpensesBtn">Open Reports</button>
                        <button type="button" class="btn secondary-btn small-btn" id="adminExportExpensesBtn">Export Week PDF</button>
                    </div>
                </div>
                <div class="admin-expense-summary-grid">
                    <div class="admin-expense-summary-card"><span>Weekly Total</span><strong id="adminExpenseWeekTotal">₱0</strong></div>
                    <div class="admin-expense-summary-card"><span>Today's Total</span><strong id="adminExpenseTodayTotal">₱0</strong></div>
                    <div class="admin-expense-summary-card"><span>Entries</span><strong id="adminExpenseEntryCount">0</strong></div>
                    <div class="admin-expense-summary-card"><span>Branches</span><strong id="adminExpenseBranchCount">0</strong></div>
                </div>
            `;

            const mainTarget = document.querySelector('main, .admin-main, .dashboard-content, .container') || document.body;
            const staffSection = document.getElementById('staffSection');
            if (staffSection?.parentElement === mainTarget) mainTarget.insertBefore(panel, staffSection);
            else mainTarget.appendChild(panel);
        }

        const openBtn = panel.querySelector('#adminOpenExpensesBtn');
        const exportBtn = panel.querySelector('#adminExportExpensesBtn');

        if (openBtn && openBtn.dataset.bound !== 'true') {
            openBtn.dataset.bound = 'true';
            openBtn.addEventListener('click', () => window.location.assign('admin-expenses.html'));
        }

        if (exportBtn && exportBtn.dataset.bound !== 'true') {
            exportBtn.dataset.bound = 'true';
            exportBtn.addEventListener('click', exportAdminCurrentWeekExpensesPdf);
        }
    }

    async function loadAdminExpenseSummary() {
        ensureAdminExpenseSummaryPanel();
        const startDate = getAdminExpenseWeekStartKey();
        const endDate = addAdminExpenseDays(startDate, 6);
        const label = document.getElementById('adminExpenseWeekLabel');
        if (label) label.textContent = `${formatAdminExpenseDate(startDate)} to ${formatAdminExpenseDate(endDate)} • all branches`;

        try {
            const { data, error } = await supabase
                .from(DAILY_EXPENSES_TABLE_NAME)
                .select('*')
                .gte('expense_date', startDate)
                .lte('expense_date', endDate)
                .order('expense_date', { ascending: true });
            if (error) throw error;

            adminExpenseSummaryRows = (data || []).filter(row => Number(row.amount) > 0);
            renderAdminExpenseSummary();
        } catch (error) {
            console.error('Admin expense summary failed:', error);
            adminExpenseSummaryRows = [];
            renderAdminExpenseSummary(error);
        }
    }

    function renderAdminExpenseSummary(error = null) {
        const today = getPHDateKey();
        const weekTotal = adminExpenseSummaryRows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
        const todayTotal = adminExpenseSummaryRows.filter(row => row.expense_date === today).reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);
        const branches = new Set(adminExpenseSummaryRows.map(row => row.branch_key || row.branch_name));

        const weekTotalEl = document.getElementById('adminExpenseWeekTotal');
        const todayTotalEl = document.getElementById('adminExpenseTodayTotal');
        const entryCountEl = document.getElementById('adminExpenseEntryCount');
        const branchCountEl = document.getElementById('adminExpenseBranchCount');
        const exportBtn = document.getElementById('adminExportExpensesBtn');

        if (weekTotalEl) weekTotalEl.textContent = error ? 'Unavailable' : formatPeso(weekTotal);
        if (todayTotalEl) todayTotalEl.textContent = error ? 'Unavailable' : formatPeso(todayTotal);
        if (entryCountEl) entryCountEl.textContent = error ? '—' : String(adminExpenseSummaryRows.length);
        if (branchCountEl) branchCountEl.textContent = error ? '—' : String(branches.size);
        if (exportBtn) exportBtn.disabled = Boolean(error) || adminExpenseSummaryRows.length === 0;
    }

    async function exportAdminCurrentWeekExpensesPdf() {
        if (!adminExpenseSummaryRows.length) {
            alert('No positive-value expenses are available for the current week.');
            return;
        }
        if (!ensurePdfLibraryReady()) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const startDate = getAdminExpenseWeekStartKey();
        const endDate = addAdminExpenseDays(startDate, 6);
        const total = adminExpenseSummaryRows.reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0);

        doc.setFillColor(253, 251, 247);
        doc.rect(0, 0, 297, 29, 'F');
        doc.setTextColor(44, 30, 22);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text("ADRIANO'S CURRENT WEEK EXPENSE REPORT", 148.5, 12, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.text(`${formatAdminExpenseDate(startDate)} to ${formatAdminExpenseDate(endDate)} • All Branches`, 148.5, 19, { align: 'center' });
        doc.text(`Total Expenses: PHP ${total.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 148.5, 24, { align: 'center' });

        doc.autoTable({
            startY: 34,
            head: [['Date', 'Branch', 'Expense', 'Amount', 'Submitted By', 'Last Updated']],
            body: [...adminExpenseSummaryRows]
                .sort((a, b) => String(a.expense_date).localeCompare(String(b.expense_date)) || String(a.branch_name).localeCompare(String(b.branch_name)) || String(a.expense_name).localeCompare(String(b.expense_name)))
                .map(row => [
                    formatAdminExpenseDate(row.expense_date),
                    row.branch_name || 'Unassigned Branch',
                    row.expense_name || 'Unnamed Expense',
                    `PHP ${Number(row.amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    row.team_leader_name || 'Team Leader',
                    formatPHDateTime(row.updated_at || row.created_at)
                ]),
            theme: 'grid',
            styles: { fontSize: 7.5, cellPadding: 2 },
            headStyles: { fillColor: [76, 52, 37] },
            columnStyles: { 3: { halign: 'right' } }
        });

        addPdfPageNumbers(doc);
        doc.save(`Adrianos_Current_Week_Expenses_${startDate}_to_${endDate}.pdf`);
    }

    function getAdminExpenseWeekStartKey(dateKey = getPHDateKey()) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        const daysFromMonday = (date.getUTCDay() + 6) % 7;
        date.setUTCDate(date.getUTCDate() - daysFromMonday);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }

    function addAdminExpenseDays(dateKey, amount) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        const date = new Date(Date.UTC(year, month - 1, day));
        date.setUTCDate(date.getUTCDate() + amount);
        return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
    }

    function formatAdminExpenseDate(dateKey) {
        const [year, month, day] = String(dateKey).split('-').map(Number);
        return new Intl.DateTimeFormat('en-PH', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
    }

    exportPdfBtn.addEventListener('click', exportMasterSchedulePdf);
    exportStaffBtn.addEventListener('click', exportStaffDirectoryPdf);

    logoutBtn.addEventListener('click', () => {
        sessionStorage.removeItem('adrianosAdminAuth');
        sessionStorage.removeItem('adrianosAdminLoginTime');
        sessionStorage.removeItem('adrianosAdminUsername');

        window.location.replace('tl-login.html');
    });

    initDashboard();
});