require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 3000;
const librarianPin = process.env.LIBRARIAN_PIN;
const publicDir = path.join(__dirname, 'public');

const users = [];

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
    if (!librarianPin) {
      throw createError('Librarian registration is not configured.', 500);
    }

    if (librarianPinAttempt !== librarianPin) {
      throw createError('Invalid librarian PIN.', 403);
    }
  }

  return { fullName, username, password, role };
}

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir));

app.get('/', (_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

[
  'catalog.html',
  'index.html',
  'inventory.html',
  'librarian-dashboard.html',
  'patron-dashboard.html',
  'register.html',
  'transactions.html'
].forEach((page) => {
  app.get(`/${page}`, (_req, res) => {
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

    res.json({
      token: `mock-token-${newUser.id}`,
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
      throw createError('Invalid username or password.', 401);
    }

    res.json({
      token: `mock-token-${user.id}`,
      user: sanitizeUser(user)
    });
  } catch (error) {
    next(error);
  }
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
