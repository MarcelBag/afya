/**
 * Afya Script Page-specific logic only
 * Layout, user profile, settings, and logout are all handled by layout.js
 */
import { showNotification } from './notifications.js';

document.addEventListener('DOMContentLoaded', () => {
  // ---------------------------
  // Sign-Up Handler
  // ---------------------------
  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('name').value;
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if (res.ok) {
          showNotification(data.message, 'success');
          window.location.href = '/signin';
        } else {
          showNotification(data.message, 'error');
        }
      } catch (error) {
        console.error('Signup Error:', error);
        showNotification('Something went wrong during signup.', 'error');
      }
    });
  }

  // ---------------------------
  // Sign-In Handler
  // ---------------------------
  if (window.location.pathname === '/signin') {
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
      loginBtn.addEventListener('click', async () => {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        try {
          const res = await fetch('/api/signin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          const data = await res.json();
          if (res.ok) {
            if (data.requires2FA) {
              localStorage.setItem('pending_email', data.email);
              window.location.href = '/verify-2fa';
            } else {
              localStorage.setItem('token', data.token);
              showNotification(data.message, 'success');
              window.location.href = '/home';
            }
          } else {
            showNotification(data.message, 'error');
          }
        } catch (error) {
          console.error('Signin Error:', error);
          showNotification('Something went wrong during signin.', 'error');
        }
      });
    }
  }

  // ---------------------------
  // Home Page: Tool Switching
  // ---------------------------
  if (window.location.pathname === '/home') {
    const token = localStorage.getItem('token');
    const djangoAuthenticated = document.body.dataset.djangoAuthenticated === 'true';
    if (!token && !djangoAuthenticated) {
      window.location.href = '/signin';
      return;
    }

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', () => {
        document.body.classList.toggle('dark-theme', themeSelect.value === 'dark');
      });
    }

    const hubView = document.getElementById('hub-view');
    const analysisView = document.getElementById('image-analysis-view');
    const generatorView = document.getElementById('header-generator-view');

    const selectAnalysis = document.getElementById('select-image-analysis');
    const selectGenerator = document.getElementById('select-header-generator');

    const backFromAnalysis = document.getElementById('back-from-analysis');
    const backFromGenerator = document.getElementById('back-from-generator');

    function showView(view) {
      [hubView, analysisView, generatorView].forEach(v => {
        if (v) v.classList.remove('active');
      });
      if (view) view.classList.add('active');
    }

    if (selectAnalysis) {
      selectAnalysis.addEventListener('click', () => showView(analysisView));
    }
    if (selectGenerator) {
      selectGenerator.addEventListener('click', () => showView(generatorView));
    }

    if (backFromAnalysis) {
      backFromAnalysis.addEventListener('click', () => showView(hubView));
    }
    if (backFromGenerator) {
      backFromGenerator.addEventListener('click', () => showView(hubView));
    }
  }
});
