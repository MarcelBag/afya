
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/signin';
        return;
    }

    const permissionsByRole = {
        user: [],
        admin: ['view_dashboard', 'manage_users', 'manage_recycle_bin', 'view_analytics', 'view_audit_logs'],
        superuser: ['view_dashboard', 'manage_users', 'manage_recycle_bin', 'view_analytics', 'view_audit_logs', 'access_django_admin']
    };

    const normalizeRole = (role) => {
        if (role === 'superuser' || role === 'super_user' || role === 'super user') return 'superuser';
        if (role === 'admin' || role === 'administrator') return 'admin';
        return 'user';
    };

    const withRolePermissions = (user) => {
        const role = normalizeRole(user?.role);
        return {
            ...user,
            role,
            permissions: Array.isArray(user?.permissions) && user.permissions.length
                ? user.permissions
                : permissionsByRole[role]
        };
    };

    // Role check (simple frontend guard)
    const payload = JSON.parse(atob(token.split('.')[1]));
    let currentUser = withRolePermissions({
        email: payload.email,
        role: payload.role
    });

    try {
        const res = await fetch('/api/user', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            currentUser = withRolePermissions(await res.json());
        }
    } catch (err) {
        console.warn('Unable to refresh current user details:', err);
    }

    if (!currentUser.permissions?.includes('view_dashboard')) {
        alert('Access denied. Dashboard privileges required.');
        window.location.href = '/home';
        return;
    }

    // Set Admin Name in sidebar
    const adminNameEl = document.getElementById('admin-name');
    const adminInitialsEl = document.getElementById('admin-initials');
    const displayName = currentUser.name || currentUser.email?.split('@')[0] || 'Admin';
    if (adminNameEl) adminNameEl.textContent = displayName;
    if (adminInitialsEl) adminInitialsEl.textContent = displayName[0].toUpperCase();

    document.querySelectorAll('[data-permission]').forEach(item => {
        if (!currentUser.permissions?.includes(item.dataset.permission)) {
            item.closest('li')?.remove();
            if (!item.closest('li')) item.remove();
        }
    });

    const djangoAdminLink = document.getElementById('django-admin-link');
    if (djangoAdminLink && currentUser.permissions?.includes('access_django_admin')) {
        try {
            const res = await fetch('/api/admin/django-admin-link', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                djangoAdminLink.href = data.url;
            }
        } catch (err) {
            console.warn('Unable to load Django Admin URL:', err);
        }
    }

    if (currentUser.role !== 'superuser') {
        document.querySelector('#modal-role option[value="superuser"]')?.remove();
    }


    let allUsers = [];

    // Modal Elements
    const addUserModal = document.getElementById('add-user-modal');
    const addUserForm = document.getElementById('add-user-form');
    const openModalBtn = document.getElementById('open-add-user');
    const closeModalBtn = document.getElementById('close-modal');

    if (openModalBtn) {
        openModalBtn.onclick = () => addUserModal.style.display = 'flex';
    }
    if (closeModalBtn) {
        closeModalBtn.onclick = () => addUserModal.style.display = 'none';
    }

    // Add User Form Submission
    addUserForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const userData = {
            name: document.getElementById('modal-name').value,
            email: document.getElementById('modal-email').value,
            password: document.getElementById('modal-password').value,
            role: document.getElementById('modal-role').value
        };

        try {
            const res = await fetch('/api/admin/users', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(userData)
            });
            const data = await res.json();
            if (res.ok) {
                alert('User created successfully');
                addUserModal.style.display = 'none';
                addUserForm.reset();
                loadUsers();
            } else {
                alert(data.message || 'Error creating user');
            }
        } catch (err) {
            alert('Server error');
        }
    });

    // Search Logic
    const userSearch = document.getElementById('user-search');
    userSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = allUsers.filter(u => 
            u.name.toLowerCase().includes(query) || 
            u.email.toLowerCase().includes(query)
        );
        renderUsers(filtered);
    });

    // Tab Switching Logic
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');
    const tabTitle = document.getElementById('tab-title');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            if (item.id === 'logout-btn' || !item.dataset.tab) return;
            
            const targetTab = item.dataset.tab;
            
            // UI Updates
            navItems.forEach(ni => ni.classList.remove('active'));
            item.classList.add('active');
            
            tabContents.forEach(tc => tc.classList.add('hidden'));
            document.getElementById(targetTab).classList.remove('hidden');
            
            tabTitle.textContent = item.textContent;
            
            // Load Data
            loadTabData(targetTab);
        });
    });

    // Initial Dashboard Load
    loadTabData('dashboard');

    async function loadTabData(tab) {
        switch (tab) {
            case 'dashboard':
                await loadStats();
                break;
            case 'users':
                await loadUsers();
                break;
            case 'recycle':
                await loadRecycleBin();
                break;
            case 'analytics':
                await loadGlobalHistory();
                break;
            case 'audit':
                await loadAuditLogs();
                break;
        }
    }

    async function loadStats() {
        try {
            const res = await fetch('/api/admin/stats', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const stats = await res.json();
            document.getElementById('stat-users').textContent = stats.totalUsers;
            document.getElementById('stat-active').textContent = stats.activeUsers;
            document.getElementById('stat-history').textContent = stats.totalGenerations;
            document.getElementById('stat-audit').textContent = stats.auditEvents;
            await loadRecentActivity();
        } catch (err) {
            console.error('Stats error:', err);
        }
    }

    async function loadRecentActivity() {
        try {
            if (!currentUser.permissions?.includes('view_audit_logs')) return;
            const res = await fetch('/api/admin/audit', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const logs = await res.json();
            const tbody = document.getElementById('recent-activity-body');
            const recent = logs.slice(0, 3);

            if (recent.length === 0) return;

            tbody.innerHTML = recent.map(log => `
                <tr>
                    <td><strong>${log.action}</strong><br><small>${log.details || ''}</small></td>
                    <td>${log.performedBy?.email || 'System'}</td>
                    <td>${new Date(log.timestamp).toLocaleString()}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Recent activity error:', err);
        }
    }

    async function loadUsers() {
        try {
            const res = await fetch('/api/admin/users', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            allUsers = await res.json();
            renderUsers(allUsers);
        } catch (err) {
            console.error('Users error:', err);
        }
    }

    function renderUsers(users) {
        const tbody = document.getElementById('user-table-body');
        document.getElementById('user-count').textContent = `${users.length} users`;
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No users matched your search.</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr>
                <td>
                    <div class="user-cell">
                        <div class="t-avatar">${user.name[0]}</div>
                        <div>
                            <div class="cell-name">${user.name}</div>
                            <div class="cell-sub">${user.email}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${user.role}">${user.role}</span></td>
                <td><span class="badge ${user.status}">${user.status}</span></td>
                <td>
                    <button class="action-btn" onclick="toggleUserStatus('${user._id}', '${user.status}')">
                        ${user.status === 'active' ? 'Deactivate' : 'Activate'}
                    </button>
                    ${currentUser.role === 'superuser' ? `
                        <button class="action-btn" onclick="promoteUser('${user._id}', '${user.role}')">
                            Promote
                        </button>
                    ` : ''}
                </td>
            </tr>
        `).join('');
    }

    async function loadGlobalHistory() {
        try {
            const res = await fetch('/api/admin/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const history = await res.json();
            const tbody = document.getElementById('history-table-body');
            document.getElementById('history-count').textContent = `${history.length} records`;
            
            if (history.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="empty-state">No AI generation records found.</td></tr>';
                return;
            }

            tbody.innerHTML = history.map(item => `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="t-avatar">${item.userId?.name[0] || '?'}</div>
                            <div>
                                <div class="cell-name">${item.userId?.name || 'Deleted User'}</div>
                                <div class="cell-sub">${item.userId?.email || ''}</div>
                            </div>
                        </div>
                    </td>
                    <td>
                        <span class="badge ${item.type === 'Blog Header' ? 'superuser' : 'admin'}">${item.type}</span><br>
                        <span style="font-size: 0.8rem; color: #4a5568;">${item.title}</span>
                    </td>
                    <td>
                        <a href="${item.imageUrl || item.imagePath}" target="_blank" class="action-btn">
                            View Result
                        </a>
                    </td>
                    <td>${new Date(item.createdAt).toLocaleString()}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('History error:', err);
        }
    }

    async function loadRecycleBin() {
        try {
            const res = await fetch('/api/admin/recycle-bin', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = await res.json();
            const inactiveUsers = data.inactiveUsers || [];
            const tbody = document.getElementById('recycle-table-body');
            const count = inactiveUsers.length + (data.generatedItems?.length || 0);
            document.getElementById('recycle-count').textContent = `${count} items`;

            if (count === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4">
                            <div class="empty-state">
                                <div class="icon">♻</div>
                                <h4>No recycled items</h4>
                                <p>Inactive accounts and recoverable records will appear here.</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }

            tbody.innerHTML = inactiveUsers.map(user => `
                <tr>
                    <td>
                        <div class="user-cell">
                            <div class="t-avatar">${user.name?.[0] || '?'}</div>
                            <div>
                                <div class="cell-name">${user.name || 'Unknown user'}</div>
                                <div class="cell-sub">${user.email || ''}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="badge admin">User Account</span></td>
                    <td><span class="badge ${user.status}">${user.status}</span></td>
                    <td>${new Date(user.createdAt).toLocaleString()}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Recycle bin error:', err);
        }
    }

    async function loadAuditLogs() {
        try {
            const res = await fetch('/api/admin/audit', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const logs = await res.json();
            const tbody = document.getElementById('audit-table-body');
            document.getElementById('audit-count').textContent = `${logs.length} logs`;
            tbody.innerHTML = logs.map(log => `
                <tr>
                    <td><strong>${log.action}</strong></td>
                    <td>${log.performedBy?.email || 'System'}</td>
                    <td>${log.targetUser?.email || '-'}</td>
                    <td><small>${log.details}</small></td>
                    <td>${new Date(log.timestamp).toLocaleString()}</td>
                </tr>
            `).join('');
        } catch (err) {
            console.error('Audit error:', err);
        }
    }

    // Global Action Wrappers
    window.toggleUserStatus = async (id, currentStatus) => {
        const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
        if (!confirm(`Are you sure you want to ${newStatus} this user?`)) return;

        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ status: newStatus })
            });
            if (res.ok) loadUsers();
            else alert('Failed to update status');
        } catch (err) {
            alert('Error updating user');
        }
    };

    window.promoteUser = async (id, currentRole) => {
        const roles = ['user', 'admin', 'superuser'];
        const nextRole = roles[(roles.indexOf(currentRole) + 1) % roles.length];
        if (!confirm(`Promote user to ${nextRole}?`)) return;

        try {
            const res = await fetch(`/api/admin/users/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ role: nextRole })
            });
            if (res.ok) loadUsers();
            else alert('Failed to update role');
        } catch (err) {
            alert('Error updating user');
        }
    };

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('token');
            window.location.href = '/';
        });
    }
});
