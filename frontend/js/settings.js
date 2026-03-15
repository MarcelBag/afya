/**
 * Shared Settings Component for Afya
 * Handles UI injection and logic for Profile Settings
 */
import { showNotification } from './notifications.js';

export function initSettings(token, options = {}) {
    // ─── Guard ────────────────────────────────────────────────────────────────
    // If a #settings-modal already exists in the DOM (e.g. admin page has it
    // built-in), skip injection entirely to prevent a duplicate panel.
    if (document.getElementById('settings-modal')) return;
    // ─────────────────────────────────────────────────────────────────────────

    const { onUpdateSuccess } = options;

    let payload = {};
    try {
        payload = JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        console.error('Failed to parse token in settings:', e);
    }

    // ── 1. Inject Modal HTML ──────────────────────────────────────────────────
    const modalHTML = `
    <div id="settings-modal" class="modal hidden">
        <div class="modal-content">
            <div class="modal-header">
                <h2 style="font-size: 1.25rem; font-weight: 700; color: #1a202c; margin: 0;">Profile Settings</h2>
                <button id="close-settings" style="background: none; border: none; font-size: 24px; color: #cbd5e0; cursor: pointer;">&times;</button>
            </div>
            <form id="profile-settings-form">
                <div class="form-group" style="margin-bottom: 1.5rem; display: flex; flex-direction: column; gap: 0.5rem;">
                    <label style="font-size: 0.85rem; font-weight: 600; color: #4a5568;">Display Name</label>
                    <input type="text" id="settings-new-name" class="form-input" style="width: 100%; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem;" placeholder="Enter full name">
                </div>

                <div style="border-top: 1px solid #edf2f7; margin: 2rem 0; padding-top: 1.5rem;">
                    <h3 style="font-size: 0.9rem; font-weight: 700; color: #2d3748; margin-bottom: 1.25rem;">Update Password</h3>
                    <div class="form-group" style="margin-bottom: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #4a5568;">New Password</label>
                        <input type="password" id="settings-new-password" class="form-input" style="width: 100%; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem;" placeholder="Leave blank to keep current">
                    </div>
                    <div class="form-group" style="display: flex; flex-direction: column; gap: 0.5rem;">
                        <label style="font-size: 0.85rem; font-weight: 600; color: #4a5568;">Confirm New Password</label>
                        <input type="password" id="settings-confirm-password" class="form-input" style="width: 100%; border: 1.5px solid #e2e8f0; border-radius: 8px; padding: 0.75rem 1rem;" placeholder="Repeat new password">
                    </div>
                </div>

                <button type="submit" class="cta-btn" style="width: 100%; background: #2497f3; color: #fff; border: none; border-radius: 12px; padding: 0.9rem; font-weight: 700; font-size: 1rem; cursor: pointer; transition: background 0.2s;">Save Changes</button>
            </form>
        </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // ── 2. Element References ─────────────────────────────────────────────────
    const modal = document.getElementById('settings-modal');
    const form = document.getElementById('profile-settings-form');
    const closeBtn = document.getElementById('close-settings');
    const openBtn = document.getElementById('open-settings');

    // ── 3. Open / Close ───────────────────────────────────────────────────────
    if (openBtn) {
        openBtn.addEventListener('click', () => {
            modal.classList.remove('hidden');
            // Pre-fill name from token payload
            document.getElementById('settings-new-name').value =
                payload.name || payload.email?.split('@')[0] || '';
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
    }

    // Close on backdrop click
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });

    // ── 4. Form Submit ────────────────────────────────────────────────────────
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            const newName = document.getElementById('settings-new-name').value.trim();
            const newPassword = document.getElementById('settings-new-password').value;
            const confirmPassword = document.getElementById('settings-confirm-password').value;

            if (newPassword && newPassword !== confirmPassword) {
                showNotification('Passwords do not match.', 'warning');
                return;
            }

            const body = {};
            if (newName) body.name = newName;
            if (newPassword) body.password = newPassword;

            if (Object.keys(body).length === 0) {
                showNotification('No changes provided.', 'info');
                return;
            }

            try {
                const res = await fetch('/api/user/profile', {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify(body)
                });

                const data = await res.json();

                if (res.ok) {
                    showNotification(data.message, 'success');
                    modal.classList.add('hidden');
                    form.reset();
                    if (onUpdateSuccess) onUpdateSuccess(newName || payload.name);
                } else {
                    showNotification(data.message, 'error');
                }
            } catch (err) {
                console.error('Settings error:', err);
                showNotification('Server error occurred.', 'error');
            }
        });
    }
}