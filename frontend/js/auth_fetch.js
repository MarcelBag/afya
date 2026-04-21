export function isDjangoAuthenticated() {
  return document.body.dataset.djangoAuthenticated === 'true';
}

export function hasAppAuth() {
  return Boolean(localStorage.getItem('token')) || isDjangoAuthenticated();
}

export function csrfToken() {
  return document.cookie
    .split('; ')
    .find(row => row.startsWith('csrftoken='))
    ?.split('=')[1] || '';
}

export function authHeaders(extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const token = localStorage.getItem('token');
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  } else if (isDjangoAuthenticated()) {
    const csrf = csrfToken();
    if (csrf) headers['X-CSRFToken'] = csrf;
  }
  return headers;
}
