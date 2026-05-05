require('dotenv').config();

const path = require('path');
const { randomUUID } = require('crypto');
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const librarianPin = process.env.LIBRARIAN_PIN;
const adminPin = process.env.ADMIN_PIN;
const publicDir = path.join(__dirname, 'public');
const genericLoginError = 'Unable to sign in. Please try again.';

const users = [];
const sessions = new Map();
const auditLogs = [];

const pageAccess = {
  'catalog.html': ['patron', 'librarian', 'admin'],
  'inventory.html': ['librarian'],
  'admin-log.html': ['admin'],
  'librarian-dashboard.html': ['librarian'],
  'patron-dashboard.html': ['patron'],
  'transactions.html': ['librarian']
};

function createError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    fullName: user.fullName
  };
}

function addAuditLog(description, user = null) {
  const entry = {
    id: randomUUID(),
    timestamp: new Date().toISOString(),
    description,
    actor: user ? sanitizeUser(user) : null
  };

  auditLogs.unshift(entry);
  return entry;
}

function createSession(user) {
  const token = `mock-token-${randomUUID()}`;
  sessions.set(token, sanitizeUser(user));
  return token;
}

function parseCookies(req) {
  const header = req.get('Cookie') || '';

  return header.split(';').reduce((cookies, pair) => {
    const separatorIndex = pair.indexOf('=');
    if (separatorIndex < 0) {
      return cookies;
    }

    const key = pair.slice(0, separatorIndex).trim();
    const value = pair.slice(separatorIndex + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function getRequestSession(req) {
  const header = req.get('Authorization') || '';
  const bearerToken = header.startsWith('Bearer ') ? header.slice(7) : '';
  const cookieToken = parseCookies(req).sessionToken;
  const token = bearerToken || cookieToken || '';
  const user = sessions.get(token);

  return user ? { token, user } : null;
}

function setSessionCookie(res, token) {
  res.cookie('sessionToken', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
  });
}

function clearSessionCookie(res) {
  res.clearCookie('sessionToken', {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
  });
}

function dashboardForRole(role) {
  if (role === 'admin') {
    return '/admin-log.html';
  }

  if (role === 'librarian') {
    return '/librarian-dashboard.html';
  }

  return '/patron-dashboard.html';
}

function preventPageCaching(res) {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0'
  });
}

function authenticate(req, _res, next) {
  const session = getRequestSession(req);

  if (!session) {
    next(createError('Authentication required.', 401));
    return;
  }

  req.token = session.token;
  req.user = session.user;
  next();
}

function requireRole(role) {
  return (req, _res, next) => {
    if (!req.user || req.user.role !== role) {
      next(createError('Access denied.', 403));
      return;
    }

    next();
  };
}

function validateRegistration(payload) {
  const fullName = String(payload.fullName || '').trim();
  const username = String(payload.username || '').trim();
  const password = String(payload.password || '');
  const role = String(payload.role || '');
  const librarianPinAttempt = String(payload.librarianPin || '');

  const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;
  const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,128}$/;

  if (fullName.length < 2 || !usernamePattern.test(username) || !passwordPattern.test(password)) {
    throw createError('Registration details are invalid.');
  }

  if (!['patron', 'librarian'].includes(role)) {
    throw createError('Invalid account role selected.');
  }

  if (role === 'librarian') {
    if (!librarianPin && !adminPin) {
      throw createError('Staff registration is not configured.', 500);
    }

    if (adminPin && librarianPinAttempt === adminPin) {
      return { fullName, username, password, role: 'admin' };
    }

    if (librarianPin && librarianPinAttempt === librarianPin) {
      return { fullName, username, password, role: 'librarian' };
    }

    throw createError('Invalid staff PIN.', 403);
  }

  return { fullName, username, password, role };
}

app.use(cors());
app.use(express.json());
app.use('/assets', express.static(path.join(publicDir, 'assets')));

app.get('/', (req, res) => {
  preventPageCaching(res);

  const session = getRequestSession(req);
  if (session) {
    res.redirect(dashboardForRole(session.user.role));
    return;
  }

  res.sendFile(path.join(publicDir, 'index.html'));
});

['index.html', 'register.html'].forEach((page) => {
  app.get(`/${page}`, (req, res) => {
    preventPageCaching(res);

    const session = getRequestSession(req);
    if (session) {
      res.redirect(dashboardForRole(session.user.role));
      return;
    }

    res.sendFile(path.join(publicDir, page));
  });
});

Object.entries(pageAccess).forEach(([page, allowedRoles]) => {
  app.get(`/${page}`, (req, res) => {
    preventPageCaching(res);

    const session = getRequestSession(req);

    if (!session) {
      res.redirect('/index.html');
      return;
    }

    if (!allowedRoles.includes(session.user.role)) {
      res.redirect(dashboardForRole(session.user.role));
      return;
    }

    res.sendFile(path.join(publicDir, page));
  });
});

app.post('/api/register', (req, res, next) => {
  try {
    const payload = validateRegistration(req.body);

    const alreadyExists = users.some((entry) => {
      return entry.username.toLowerCase() === payload.username.toLowerCase();
    });

    if (alreadyExists) {
      throw createError('Username already exists. Choose another username.', 409);
    }

    const newUser = {
      id: `u-${payload.role}-${Date.now()}`,
      username: payload.username,
      password: payload.password,
      role: payload.role,
      fullName: payload.fullName
    };

    users.push(newUser);
    const token = createSession(newUser);
    setSessionCookie(res, token);
    addAuditLog(`User account created for ${newUser.username} with role ${newUser.role}.`, newUser);

    res.json({
      token,
      user: sanitizeUser(newUser)
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/login', (req, res, next) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    const user = users.find((entry) => entry.username === username);

    if (!user || user.password !== password) {
      addAuditLog(`Failed login attempt for username ${username || 'unknown'}.`);
      throw createError(genericLoginError, 401);
    }

    const token = createSession(user);
    setSessionCookie(res, token);
    addAuditLog(`${user.username} signed in.`, user);

    res.json({
      token,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/session', authenticate, (req, res) => {
  res.json({
    user: req.user
  });
});

app.post('/api/logout', authenticate, (req, res) => {
  addAuditLog(`${req.user.username} signed out.`, req.user);
  sessions.delete(req.token);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.post('/api/audit-events', authenticate, (req, res, next) => {
  try {
    const description = String(req.body.description || '').trim();

    if (description.length < 3 || description.length > 240) {
      throw createError('Audit description is invalid.');
    }

    const entry = addAuditLog(description, req.user);
    res.json(entry);
  } catch (error) {
    next(error);
  }
});

app.get('/api/audit-logs', authenticate, requireRole('admin'), (_req, res) => {
  res.json(auditLogs.slice(0, 250));
});

app.use((error, _req, res, _next) => {
  const status = error.status || 500;
  res.status(status).json({
    message: error.message || 'Something went wrong.'
  });
});

app.listen(port, () => {
  console.log(`Digital Library backend running at http://localhost:${port}`);
});
