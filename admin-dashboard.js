import { supabase } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', async () => {
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

    let branchesList = [];
    let usersList = [];
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

    const coffeeDark = [44, 30, 22];
    const coffeeMedium = [139, 94, 52];
    const cream = [253, 251, 247];
    const border = [224, 220, 211];
    const textGray = [60, 60, 60];

    async function initDashboard() {
        await fetchBranches();
        await fetchUsers();
        scheduleBranchSelect.addEventListener('change', reloadSchedule);
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

    function getRoleLabel(role) {
        return role === 'team_leader' ? 'Team Leader' : 'Employee';
    }

    function getBranchName(branchId) {
        if (!branchId) return 'Unassigned';
        return branchesList.find(branch => branch.id === branchId)?.name || 'Unassigned';
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

            branchesList.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.name;
                scheduleBranchSelect.appendChild(option);
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
        const staffUsers = sortEmployees(usersList.filter(user => user.role !== 'admin'));
        usersTableBody.innerHTML = '';

        if (staffUsers.length === 0) {
            usersTableBody.innerHTML = '<tr><td colspan="5" class="loading-text">No registered staff found.</td></tr>';
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
                <td data-label="Name"><strong>${escapeHTML(user.full_name)}</strong></td>
                <td data-label="Profile"><button class="btn outline-btn small-btn view-profile-btn" data-id="${escapeHTML(user.id)}">View Profile</button></td>
                <td data-label="Role"><select class="table-select role-select" data-user-id="${escapeHTML(user.id)}">${roleOptionsHTML}</select></td>
                <td data-label="Branch"><select class="table-select branch-select" data-user-id="${escapeHTML(user.id)}">${branchOptionsHTML}</select></td>
                <td data-label="Actions"><button class="btn danger-btn small-btn delete-user-btn" data-id="${escapeHTML(user.id)}">Delete</button></td>
            `;

            usersTableBody.appendChild(tr);
        });

        attachTableEventListeners();
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
                scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text">No employees assigned to this branch yet.</td></tr>';
                return;
            }

            const { data: existingSchedules, error: schedError } = await supabase
                .from('schedules')
                .select('*')
                .eq('branch_id', branchId);

            if (schedError) throw schedError;

            renderScheduleTable(sortEmployees(employees), existingSchedules || [], branchId);
        } catch (error) {
            console.error('Schedule loading failed:', JSON.stringify(error, null, 2));
            scheduleTableBody.innerHTML = '<tr><td colspan="8" class="loading-text error-text">Error loading schedule matrix.</td></tr>';
        }
    }

    function renderScheduleTable(employees, existingSchedules, branchId) {
        scheduleTableBody.innerHTML = '';

        employees.forEach(employee => {
            const tr = document.createElement('tr');
            let rowHTML = `<td data-label="Employee"><strong>${escapeHTML(employee.full_name)}</strong></td>`;

            daysOfWeek.forEach(day => {
                const existingShift = existingSchedules.find(schedule => {
                    return schedule.employee_id === employee.id && schedule.day_of_week === day;
                });

                const shiftValue = existingShift ? existingShift.shift_type : '';

                rowHTML += `
                    <td data-label="${escapeHTML(day)}">
                        <select class="table-select shift-select" data-emp-id="${escapeHTML(employee.id)}" data-day="${escapeHTML(day)}">
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
    }

    function attachScheduleListeners(branchId) {
        document.querySelectorAll('.shift-select').forEach(select => {
            select.addEventListener('change', async event => {
                const empId = event.target.getAttribute('data-emp-id');
                const day = event.target.getAttribute('data-day');
                const shiftType = event.target.value;

                try {
                    await saveShift(branchId, empId, day, shiftType);
                } catch (error) {
                    console.error('Schedule save failed:', JSON.stringify(error, null, 2));
                    alert('Failed to save schedule. Please try again.');
                    await reloadSchedule();
                }
            });
        });
    }

    async function saveShift(branchId, employeeId, day, shiftType) {
        const { data: existingRows, error: findError } = await supabase
            .from('schedules')
            .select('id, branch_id, shift_type, created_at')
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

        if (mainRow) {
            const { error: updateError } = await supabase
                .from('schedules')
                .update({
                    branch_id: branchId,
                    shift_type: shiftType
                })
                .eq('id', mainRow.id);

            if (updateError) throw updateError;
            return;
        }

        const { error: insertError } = await supabase
            .from('schedules')
            .insert({
                employee_id: employeeId,
                branch_id: branchId,
                day_of_week: day,
                shift_type: shiftType
            });

        if (insertError) {
            const isConflictError =
                insertError.code === '23505' ||
                insertError.status === 409 ||
                String(insertError.message || '').toLowerCase().includes('duplicate');

            if (!isConflictError) {
                throw insertError;
            }

            const { data: retryRows, error: retryFindError } = await supabase
                .from('schedules')
                .select('id')
                .eq('employee_id', employeeId)
                .eq('day_of_week', day)
                .limit(1);

            if (retryFindError) throw retryFindError;

            if (!retryRows || retryRows.length === 0) {
                throw insertError;
            }

            const { error: retryUpdateError } = await supabase
                .from('schedules')
                .update({
                    branch_id: branchId,
                    shift_type: shiftType
                })
                .eq('id', retryRows[0].id);

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
        if (shiftType === 'opening') return 'OPENING';
        if (shiftType === 'closing') return 'CLOSING';
        if (shiftType === 'day_off') return 'DAY OFF';
        return '-';
    }

    function getScheduleValue(allSchedules, employee, branch, day) {
        const row = allSchedules.find(schedule => {
            return schedule.employee_id === employee.id &&
                schedule.branch_id === branch.id &&
                schedule.day_of_week === day;
        });

        return shiftLabel(row?.shift_type);
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

                        if (value === 'OPENING') {
                            data.cell.styles.textColor = [36, 113, 163];
                            data.cell.styles.fillColor = [236, 246, 253];
                        } else if (value === 'CLOSING') {
                            data.cell.styles.textColor = [183, 149, 11];
                            data.cell.styles.fillColor = [255, 249, 225];
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
                    drawPdfHeader(doc, 'MASTER WEEKLY SCHEDULE', 'Adrianos Coffee & Food Portal - Complete Operations Matrix');
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