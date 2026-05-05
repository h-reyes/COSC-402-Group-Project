const DB_STORAGE_KEY = 'dls_db_v1';
const API_BASE_URL = window.location.origin;

function nowIso() {
  return new Date().toISOString();
}

function loadDb() {
  const raw = localStorage.getItem(DB_STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      localStorage.removeItem(DB_STORAGE_KEY);
    }
  }

  const seed = {
    books: [
      { id: 101, isbn: '9780307474278', title: 'The Great Gatsby', author: 'F. Scott Fitzgerald', quantity: 4 },
      { id: 102, isbn: '9780061120084', title: 'To Kill a Mockingbird', author: 'Harper Lee', quantity: 2 },
      { id: 103, isbn: '9780141439556', title: 'Pride and Prejudice', author: 'Jane Austen', quantity: 0 },
      { id: 104, isbn: '9780553296983', title: 'Dune', author: 'Frank Herbert', quantity: 5 },
      { id: 105, isbn: '9780451524935', title: '1984', author: 'George Orwell', quantity: 3 }
    ],
    borrowed: [],
    transactions: []
  };

  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(seed));
  return seed;
}

function saveDb(db) {
  localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(db));
}

function createError(message, code = 'VALIDATION') {
  const error = new Error(message);
  error.code = code;
  return error;
}

function simulate(data, delay = 180) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delay);
  });
}

async function requestApi(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw createError(data.message || 'Request failed.', 'API');
  }

  return data;
}

const Api = {
  async login(username, password) {
    return requestApi('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
  },

  async register(payload) {
    const fullName = payload.fullName.trim();
    const username = payload.username.trim();
    const password = payload.password;
    const role = payload.role;

    const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;
    const passwordPattern = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[^A-Za-z\d]).{12,128}$/;

    if (fullName.length < 2 || !usernamePattern.test(username) || !passwordPattern.test(password)) {
      throw createError('Registration details are invalid.', 'VALIDATION');
    }

    if (!['patron', 'librarian'].includes(role)) {
      throw createError('Invalid account role selected.', 'VALIDATION');
    }

    return requestApi('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        fullName,
        username,
        password,
        role,
        librarianPin: payload.librarianPin
      })
    });
  },

  async getBooks() {
    const db = loadDb();
    return simulate(db.books);
  },

  async searchBooks(term) {
    const normalized = term.trim().toLowerCase();
    if (normalized.length < 2) {
      throw createError('Search term must be at least 2 characters.', 'VALIDATION');
    }

    const db = loadDb();
    const results = db.books.filter((book) => {
      return (
        book.title.toLowerCase().includes(normalized)
        || book.author.toLowerCase().includes(normalized)
        || book.isbn.toLowerCase().includes(normalized)
      );
    });

    return simulate(results);
  },

  async checkoutBook(userId, bookId) {
    const numericBookId = Number(bookId);
    if (!userId || Number.isNaN(numericBookId)) {
      throw createError('Invalid checkout request.', 'VALIDATION');
    }

    const db = loadDb();
    const book = db.books.find((item) => item.id === numericBookId);
    if (!book) {
      throw createError('Book not found.', 'NOT_FOUND');
    }

    if (book.quantity <= 0) {
      throw createError('Book is currently out of stock.', 'OUT_OF_STOCK');
    }

    book.quantity -= 1;
    db.borrowed.push({ userId, bookId: book.id, borrowedAt: nowIso() });
    db.transactions.push({
      id: crypto.randomUUID(),
      userId,
      bookId: book.id,
      bookTitle: book.title,
      type: 'checkout',
      at: nowIso()
    });
    saveDb(db);

    return simulate({ success: true, book });
  },

  async returnBook(userId, bookId) {
    const numericBookId = Number(bookId);
    if (!userId || Number.isNaN(numericBookId)) {
      throw createError('Invalid return request.', 'VALIDATION');
    }

    const db = loadDb();
    const borrowedIndex = db.borrowed.findIndex((item) => item.userId === userId && item.bookId === numericBookId);
    if (borrowedIndex < 0) {
      throw createError('No matching borrowed record found for this user.', 'NOT_FOUND');
    }

    const book = db.books.find((item) => item.id === numericBookId);
    if (book) {
      book.quantity += 1;
    }

    db.borrowed.splice(borrowedIndex, 1);
    db.transactions.push({
      id: crypto.randomUUID(),
      userId,
      bookId: numericBookId,
      bookTitle: book ? book.title : 'Unknown',
      type: 'return',
      at: nowIso()
    });
    saveDb(db);

    return simulate({ success: true, book });
  },

  async getBorrowedBooks(userId) {
    const db = loadDb();
    const rows = db.borrowed
      .filter((item) => item.userId === userId)
      .map((item) => {
        const book = db.books.find((entry) => entry.id === item.bookId);
        return {
          bookId: item.bookId,
          borrowedAt: item.borrowedAt,
          title: book ? book.title : 'Unknown',
          author: book ? book.author : 'Unknown'
        };
      });

    return simulate(rows);
  },

  async upsertInventory(payload) {
    const isbn = payload.isbn.trim();
    const title = payload.title.trim();
    const author = payload.author.trim();
    const quantity = Number(payload.quantity);

    if (isbn.length < 10 || title.length < 2 || author.length < 2 || Number.isNaN(quantity) || quantity < 0) {
      throw createError('Inventory form values are invalid.', 'VALIDATION');
    }

    const db = loadDb();
    const existing = db.books.find((book) => book.isbn === isbn);

    if (existing) {
      existing.title = title;
      existing.author = author;
      existing.quantity = quantity;
    } else {
      db.books.push({
        id: Date.now(),
        isbn,
        title,
        author,
        quantity
      });
    }

    db.transactions.push({
      id: crypto.randomUUID(),
      userId: 'librarian',
      bookId: existing ? existing.id : db.books[db.books.length - 1].id,
      bookTitle: title,
      type: 'inventory-update',
      at: nowIso()
    });
    saveDb(db);

    return simulate({ success: true });
  },

  async getTransactions(filters = {}) {
    const db = loadDb();
    let rows = [...db.transactions];

    if (filters.type && filters.type !== 'all') {
      rows = rows.filter((item) => item.type === filters.type);
    }

    if (filters.userId && filters.userId.trim()) {
      const userValue = filters.userId.trim().toLowerCase();
      rows = rows.filter((item) => item.userId.toLowerCase().includes(userValue));
    }

    rows.sort((a, b) => b.at.localeCompare(a.at));
    return simulate(rows);
  }
};
