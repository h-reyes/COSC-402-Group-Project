const AUTH_STORAGE_KEY = 'dls_auth_v1';

function getCurrentSession() {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (_error) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
}

function setCurrentSession(payload) {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(payload));
}

function clearCurrentSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function pathEndsWith(fileName) {
  return window.location.pathname.toLowerCase().endsWith(fileName.toLowerCase());
}

const Auth = {
  getSession() {
    return getCurrentSession();
  },

  isLoggedIn() {
    return Boolean(getCurrentSession());
  },

  hasRole(role) {
    const session = getCurrentSession();
    return Boolean(session && session.user && session.user.role === role);
  },

  async login(username, password) {
    const result = await Api.login(username, password);
    setCurrentSession(result);
    return result;
  },

  async register(fullName, username, password, role) {
    const result = await Api.register({ fullName, username, password, role });
    setCurrentSession(result);
    return result;
  },

  logout() {
    clearCurrentSession();
    window.location.href = 'index.html';
  },

  redirectByRole() {
    const session = getCurrentSession();
    if (!session) {
      window.location.href = 'index.html';
      return;
    }

    if (session.user.role === 'librarian') {
      window.location.href = 'librarian-dashboard.html';
      return;
    }

    window.location.href = 'patron-dashboard.html';
  },

  requireAuth(allowedRoles = []) {
    const session = getCurrentSession();
    if (!session) {
      window.location.href = 'index.html';
      return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(session.user.role)) {
      this.redirectByRole();
      return null;
    }

    return session;
  },

  buildNav(targetId) {
    const session = getCurrentSession();
    const navRoot = document.getElementById(targetId);
    if (!navRoot || !session) {
      return;
    }

    while (navRoot.firstChild) {
      navRoot.removeChild(navRoot.firstChild);
    }

    const links = [
      { role: 'all', href: 'catalog.html', label: 'Catalog' },
      { role: 'patron', href: 'patron-dashboard.html', label: 'Borrowing' },
      { role: 'librarian', href: 'librarian-dashboard.html', label: 'Librarian Home' },
      { role: 'librarian', href: 'inventory.html', label: 'Inventory' },
      { role: 'librarian', href: 'transactions.html', label: 'Transactions' }
    ];

    links.forEach((link) => {
      if (link.role !== 'all' && link.role !== session.user.role) {
        return;
      }

      const anchor = document.createElement('a');
      anchor.href = link.href;
      anchor.className = 'nav-link';
      anchor.textContent = link.label;
      if (pathEndsWith(link.href)) {
        anchor.classList.add('active');
      }
      navRoot.appendChild(anchor);
    });

    const profile = document.createElement('span');
    profile.className = 'nav-link';
    profile.textContent = `${session.user.fullName} (${session.user.role})`;
    navRoot.appendChild(profile);

    const logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.className = 'nav-button';
    logoutButton.textContent = 'Logout';
    logoutButton.addEventListener('click', () => this.logout());
    navRoot.appendChild(logoutButton);
  }
};
