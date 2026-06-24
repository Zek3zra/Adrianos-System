import { supabase } from './supabaseClient.js';

document.addEventListener("DOMContentLoaded", async () => {
    const logoutBtn = document.getElementById('logoutBtn');
    const usersTableBody = document.getElementById('usersTableBody');
    const scheduleBranchSelect = document.getElementById('scheduleBranchSelect');
    const scheduleTableBody = document.getElementById('scheduleTableBody');

    let branchesList = [];
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    // 1. Initialize
    async function initDashboard() {
        await fetchBranches();
        await fetchUsers();
        scheduleBranchSelect.addEventListener('change', reloadSchedule);
    }

    // 2. Fetch Branches
    async function fetchBranches() {
        try {
            const { data, error } = await supabase.from('branches').select('*');
            if (error) throw error;
            branchesList = data;
            
            branchesList.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.name;
                scheduleBranchSelect.appendChild(option);
            });
        } catch (error) {
            console.error("Error fetching branches:", error);
        }
    }

    // 3. Fetch Users
    async function fetchUsers() {
        try {
            const { data: users, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
            if (error) throw error;

            usersTableBody.innerHTML = ''; 
            if (users.length === 0) {
                usersTableBody.innerHTML = '<tr><td colspan="5" class="loading-text">No registered users found.</td></tr>';
                return;
            }

            users.forEach(user => {
                if (user.role === 'admin') return; 

                const tr = document.createElement('tr');
                let branchOptionsHTML = `<option value="">Unassigned</option>`;
                branchesList.forEach(branch => {
                    const selected = user.branch_id === branch.id ? 'selected' : '';
                    branchOptionsHTML += `<option value="${branch.id}" ${selected}>${branch.name}</option>`;
                });

                const roleOptionsHTML = `
                    <option value="employee" ${user.role === 'employee' ? 'selected' : ''}>Employee</option>
                    <option value="team_leader" ${user.role === 'team_leader' ? 'selected' : ''}>Team Leader</option>
                `;

                tr.innerHTML = `
                    <td><strong>${user.full_name}</strong></td>
                    <td>${user.username}</td>
                    <td>${user.phone_number}</td>
                    <td><select class="table-select role-select" data-user-id="${user.id}">${roleOptionsHTML}</select></td>
                    <td><select class="table-select branch-select" data-user-id="${user.id}">${branchOptionsHTML}</select></td>
                `;
                usersTableBody.appendChild(tr);
            });

            attachTableEventListeners();
        } catch (error) {
            usersTableBody.innerHTML = '<tr><td colspan="5" class="loading-text" style="color:red;">Failed to load data.</td></tr>';
        }
    }

    // 4. Update Database on User Table Change
    function attachTableEventListeners() {
        document.querySelectorAll('.role-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.getAttribute('data-user-id');
                const newRole = e.target.value;
                try {
                    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
                } catch (error) { alert("Failed to update role."); }
            });
        });

        document.querySelectorAll('.branch-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const userId = e.target.getAttribute('data-user-id');
                const newBranchId = e.target.value || null; 
                try {
                    await supabase.from('profiles').update({ branch_id: newBranchId }).eq('id', userId);
                    if (scheduleBranchSelect.value === newBranchId || scheduleBranchSelect.value === '') {
                        reloadSchedule(); 
                    }
                } catch (error) { alert("Failed to assign branch."); }
            });
        });
    }

    // 5. Schedule Maker Engine
    async function reloadSchedule() {
        const branchId = scheduleBranchSelect.value;
        if (!branchId) {
            scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">Select a branch to view schedules.</td></tr>';
            return;
        }

        scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">Loading schedules...</td></tr>';

        try {
            // Get employees for this branch
            const { data: employees, error: empError } = await supabase
                .from('profiles')
                .select('*')
                .eq('branch_id', branchId)
                .neq('role', 'admin');

            if (empError) throw empError;

            if (employees.length === 0) {
                scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">No employees assigned to this branch yet.</td></tr>';
                return;
            }

            // Fetch existing saved schedules
            const { data: existingSchedules, error: schedError } = await supabase
                .from('schedules')
                .select('*')
                .eq('branch_id', branchId);

            if (schedError) throw schedError;

            scheduleTableBody.innerHTML = '';

            // Build rows
            employees.forEach(emp => {
                const tr = document.createElement('tr');
                let rowHTML = `<td><strong>${emp.full_name}</strong></td>`;

                daysOfWeek.forEach(day => {
                    const existingShift = existingSchedules.find(s => s.employee_id === emp.id && s.day_of_week === day);
                    const shiftValue = existingShift ? existingShift.shift_type : '';

                    rowHTML += `
                        <td>
                            <select class="table-select shift-select" data-emp-id="${emp.id}" data-day="${day}">
                                <option value="" ${shiftValue === '' ? 'selected' : ''}>-</option>
                                <option value="opening" ${shiftValue === 'opening' ? 'selected' : ''}>Opening</option>
                                <option value="closing" ${shiftValue === 'closing' ? 'selected' : ''}>Closing</option>
                                <option value="day_off" ${shiftValue === 'day_off' ? 'selected' : ''}>Day Off</option>
                            </select>
                        </td>
                    `;
                });

                tr.innerHTML = rowHTML;
                scheduleTableBody.appendChild(tr);
            });

            attachScheduleListeners(branchId);
        } catch (error) {
            scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text" style="color:red;">Error loading schedule.</td></tr>';
        }
    }

    // 6. Save Schedule to Database Live
    function attachScheduleListeners(branchId) {
        document.querySelectorAll('.shift-select').forEach(select => {
            select.addEventListener('change', async (e) => {
                const empId = e.target.getAttribute('data-emp-id');
                const day = e.target.getAttribute('data-day');
                const shiftType = e.target.value;

                try {
                    if (shiftType === '') {
                        // Delete row if changed back to blank
                        await supabase.from('schedules').delete()
                            .eq('employee_id', empId).eq('day_of_week', day);
                    } else {
                        // Upsert based on the new logic
                        await supabase.from('schedules').upsert({
                            employee_id: empId,
                            branch_id: branchId,
                            day_of_week: day,
                            shift_type: shiftType
                        }, { onConflict: 'employee_id, day_of_week' });
                    }
                } catch (error) {
                    alert("Failed to save schedule change.");
                    console.error(error);
                }
            });
        });
    }

    logoutBtn.addEventListener('click', () => { window.location.href = 'index.html'; });
    initDashboard();
});