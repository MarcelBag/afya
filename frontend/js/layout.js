/**
 * Universal Layout Module for Afya
 * Injects header (with auth-aware nav), footer, and settings modal into every page.
 */
import { initSettings } from './settings.js';

(function initLayout() {
  const token = localStorage.getItem('token');
  const isLoggedIn = !!token;
  let payload = null;

  if (isLoggedIn) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid token format');
      payload = JSON.parse(atob(parts[1]));
      // Check token expiry
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        throw new Error('Token expired');
      }
    } catch (e) {
      console.warn('Invalid or expired token removed:', e.message);
      localStorage.removeItem('token');
      if (currentPath === '/home' || currentPath.startsWith('/admin')) {
        window.location.href = '/signin';
      }
      return;
    }
  }

  const currentPath = window.location.pathname;
  const isAdmin = currentPath.startsWith('/admin');
  const userName = payload?.name || payload?.email?.split('@')[0] || '';
  const userInitial = userName ? userName[0].toUpperCase() : '?';
  const userRole = payload?.role || 'user';

  // ─── Admin pages have their own sidebar layout only inject settings modal ───
  if (isAdmin) {
    if (isLoggedIn) {
      initSettings(token, {
        onUpdateSuccess: (newName) => {
          const adminNameEl = document.getElementById('admin-name');
          const adminInitialsEl = document.getElementById('admin-initials');
          if (adminNameEl) adminNameEl.textContent = newName;
          if (adminInitialsEl) adminInitialsEl.textContent = newName[0].toUpperCase();
        }
      });
    }
    return; // Don't inject header/footer for admin
  }

  // ─── Build Nav Links ───
  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/home', label: 'AI Tools' },
    { href: '/contact', label: 'Contact' },
  ];

  const navHTML = navLinks.map(link => {
    const isActive = currentPath === link.href || (link.href !== '/' && currentPath.startsWith(link.href));
    return `<li><a href="${link.href}" class="${isActive ? 'active' : ''}">${link.label}</a></li>`;
  }).join('');

  // ─── Auth: right side of header ───
  let rightSideHTML;
  if (isLoggedIn) {
    const adminNavItem = (userRole === 'admin' || userRole === 'superuser')
      ? `<li><a href="/admin" class="nav-admin-link" style="color:#2497f3;font-weight:700;">Admin ↗</a></li>` : '';

    rightSideHTML = `
      <ul class="nav-links">
        ${adminNavItem}
        ${navHTML}
      </ul>
      <div class="user-dropdown">
        <div id="user-avatar" class="user-avatar" title="${userName}">
          <span id="user-initials">${userInitial}</span>
        </div>
        <div id="user-menu" class="user-menu hidden">
          <div class="user-menu-header">
            <div class="user-avatar" style="width:36px;height:36px;font-size:0.9rem;">${userInitial}</div>
            <div>
              <div style="font-weight:700;font-size:0.9rem;">${userName}</div>
            </div>
          </div>
          <div class="menu-divider"></div>
          <button class="menu-item" id="open-settings"><span>⚙️</span> Settings</button>
          <div class="menu-divider"></div>
          <button class="menu-item" id="layout-sign-out" style="color: #ef4444;"><span>⏻</span> Logout</button>
        </div>
      </div>`;
  } else {
    rightSideHTML = `
      <ul class="nav-links">
        ${navHTML}
        <li><a href="/signin" class="nav-auth-btn">Sign In</a></li>
      </ul>`;
  }

  // ─── Inject Header ───
  const header = document.createElement('header');
  header.innerHTML = `
    <div class="header-container">
      <h1>
        <a href="/" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:10px;">
          <img src="/assets/tuungane.jpeg" alt="Afya" style="width:32px;height:32px;border-radius:8px;object-fit:cover;">
          Afya eHealth
        </a>
      </h1>
      <nav style="display:flex;align-items:center;gap:16px;">
        ${rightSideHTML}
      </nav>
    </div>`;
  document.body.prepend(header);

  // ─── Inject Footer ───
  const footer = document.createElement('footer');
  footer.innerHTML = `<p>&copy; ${new Date().getFullYear()} Afya eHealth Project. All Rights Reserved.</p>`;
  document.body.appendChild(footer);

  // ─── User Menu Toggle ───
  if (isLoggedIn) {
    const avatar = document.getElementById('user-avatar');
    const menu = document.getElementById('user-menu');
    if (avatar && menu) {
      avatar.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('hidden');
      });
      document.addEventListener('click', () => menu.classList.add('hidden'));
    }

    // Logout
    const logoutBtn = document.getElementById('layout-sign-out');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/';
      });
    }

    // Init Settings Modal
    initSettings(token, {
      onUpdateSuccess: (newName) => {
        const initEl = document.getElementById('user-initials');
        if (initEl) initEl.textContent = newName[0].toUpperCase();
      }
    });
  }
})();
