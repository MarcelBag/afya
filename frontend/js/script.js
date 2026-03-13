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
          alert(data.message);
          window.location.href = '/signin';
        } else {
          alert(data.message);
        }
      } catch (error) {
        console.error('Signup Error:', error);
        alert('Something went wrong during signup.');
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
              alert(data.message);
              window.location.href = '/home';
            }
          } else {
            alert(data.message);
          }
        } catch (error) {
          console.error('Signin Error:', error);
          alert('Something went wrong during signin.');
        }
      });
    }
  }

  // ---------------------------
  // Home Page Logic and avatar and initials
  // ---------------------------
  if (
    ['/home', '/admin'].includes(window.location.pathname)
  ) {
    const token = localStorage.getItem('token');
    if (!token) {
      window.location.href = '/signin';
      return;
    }

    (async () => {
      try {
        const res = await fetch('/api/user', {
          headers: { Authorization: 'Bearer ' + token }
        });
        if (!res.ok) {
          localStorage.removeItem('token');
          window.location.href = '/signin';
          return;
        }
        const data = await res.json();
        const userAvatar = document.getElementById('user-avatar');
        if (data.profilePhoto) {
          userAvatar.innerHTML = `<img src="${data.profilePhoto}" alt="Profile Photo" style="width:100%; height:100%; border-radius:50%;">`;
        } else {
          let initials = '';
          if (data.name) {
            const nameParts = data.name.split(' ');
            initials = nameParts.length === 1 ? data.name.charAt(0).toUpperCase() :
              nameParts[0].charAt(0).toUpperCase() + nameParts[nameParts.length - 1].charAt(0).toUpperCase();
          }
          userAvatar.innerText = initials;
        }

        if (userAvatar) {
          userAvatar.addEventListener('click', () => {
            const userMenu = document.getElementById('user-menu');
            if (userMenu) userMenu.classList.toggle('hidden');
          });
        }
      } catch (error) {
        console.error("Error fetching user info:", error);
        window.location.href = '/signin';
      }
    })();

    const signOutBtn = document.getElementById('sign-out');
    if (signOutBtn) {
      signOutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/signin';
      });
    }

    const openSettingsBtn = document.getElementById('open-settings');
    const settingsModal = document.getElementById('settings-modal');
    if (openSettingsBtn && settingsModal) {
      openSettingsBtn.addEventListener('click', () => {
        window.location.hash = '#settings';
      });
    }

    const closeSettingsBtn = document.getElementById('close-settings');
    if (closeSettingsBtn && settingsModal) {
      closeSettingsBtn.addEventListener('click', () => {
        window.location.hash = '';
      });
    }

    window.addEventListener('hashchange', () => {
      if (settingsModal) {
        if (window.location.hash === '#settings') {
          settingsModal.classList.remove('hidden');
        } else {
          settingsModal.classList.add('hidden');
        }
      }
    });

    const updateNameBtn = document.getElementById('update-name');
    if (updateNameBtn) {
      updateNameBtn.addEventListener('click', async () => {
        const newNameInput = document.getElementById('new-name');
        const newName = newNameInput.value.trim();
        if (!newName) {
          alert("Please enter a new name.");
          return;
        }
        try {
          const res = await fetch('/api/user', {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              Authorization: 'Bearer ' + token
            },
            body: JSON.stringify({ name: newName })
          });
          const data = await res.json();
          if (res.ok) {
            alert(data.message);
            const userAvatar = document.getElementById('user-avatar');
            let initials = newName.split(' ').reduce((acc, part) => acc + part.charAt(0).toUpperCase(), '');
            if (userAvatar) userAvatar.innerText = initials;
            newNameInput.value = '';
            window.location.hash = '';
          } else {
            alert(data.message);
          }
        } catch (error) {
          console.error("Update error:", error);
          alert("Update failed.");
        }
      });
    }

    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
      themeSelect.addEventListener('change', () => {
        document.body.classList.toggle('dark-theme', themeSelect.value === 'dark');
      });
    }
  }

  // ---------------------------
  // Admin Panel Logic (only if admin elements exist)
  // ---------------------------
  const adminToken = localStorage.getItem('token');
  if (adminToken) {
    const userManagementLink = document.getElementById('user-management');
    if (userManagementLink) {
      userManagementLink.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/users', {
            headers: { 'Authorization': 'Bearer ' + adminToken }
          });
          const data = await res.json();
          if (res.ok) {
            let usersTable = '<table><tr><th>Name</th><th>Email</th><th>Actions</th></tr>';
            data.forEach(user => {
              usersTable += `
                <tr>
                  <td>${user.name}</td>
                  <td>${user.email}</td>
                  <td>
                    <button onclick="editUser('${user._id}')">Edit</button>
                    <button onclick="deleteUser('${user._id}')">Delete</button>
                  </td>
                </tr>
              `;
            });
            usersTable += '</table>';
            usersTable += `
              <h3>Add New User</h3>
              <form id="add-user-form">
                <input type="text" id="new-user-name" placeholder="Name" required>
                <input type="email" id="new-user-email" placeholder="Email" required>
                <input type="password" id="new-user-password" placeholder="Password" required>
                <button type="submit">Add User</button>
              </form>
            `;
            document.getElementById('main-content').innerHTML = usersTable;

            const addUserForm = document.getElementById('add-user-form');
            addUserForm.addEventListener('submit', async (e) => {
              e.preventDefault();
              const name = document.getElementById('new-user-name').value;
              const email = document.getElementById('new-user-email').value;
              const password = document.getElementById('new-user-password').value;

              const res = await fetch('/api/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password })
              });
              const data = await res.json();
              alert(data.message);
              if (res.ok) userManagementLink.click();
            });
          } else {
            alert(data.message);
          }
        } catch (error) {
          console.error('Error:', error);
          alert('Error loading users.');
        }
      });
    }

    const logoutBtn = document.getElementById('logout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('token');
        window.location.href = '/signin';
      });
    }
  }
});

// Functions for editing and deleting users (accessible in admin)
function editUser(userId) {
  const modalContent = `
    <h3>Edit User</h3>
    <form id="edit-user-form">
      <label for="edit-name">Name:</label>
      <input type="text" id="edit-name" required />
      <label for="edit-email">Email:</label>
      <input type="email" id="edit-email" required />
      <button type="submit">Update User</button>
    </form>
  `;
  document.getElementById('main-content').innerHTML = modalContent;
  const form = document.getElementById('edit-user-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('edit-name').value;
    const email = document.getElementById('edit-email').value;
    const token = localStorage.getItem('token');
    const res = await fetch(`/api/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      body: JSON.stringify({ name, email }),
    });
    const data = await res.json();
    if (res.ok) {
      alert(data.message);
      window.location.href = '/admin';
    } else {
      alert(data.message);
    }
  });
}

function deleteUser(userId) {
  const token = localStorage.getItem('token');
  fetch(`/api/users/${userId}`, {
    method: 'DELETE',
    headers: { 'Authorization': 'Bearer ' + token }
  })
    .then(res => res.json())
    .then(data => {
      if (data.message) {
        alert(data.message);
        document.getElementById('user-management')?.click();
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Error deleting user.');
    });
}
