async function initLoginPage() {
  if (Auth.isLoggedIn()) {
    Auth.redirectByRole();
    return;
  }

  const form = document.getElementById('loginForm');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const message = document.getElementById('loginMessage');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(message, '');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (username.length < 3 || password.length < 6) {
      setMessage(message, 'Enter a valid username and password.', 'error');
      return;
    }

    try {
      await Auth.login(username, password);
      setMessage(message, 'Login successful. Redirecting...', 'success');
      Auth.redirectByRole();
    } catch (_error) {
      setMessage(message, 'Invalid username or password.', 'error');
    }
  });
}

async function initRegisterPage() {
  if (Auth.isLoggedIn()) {
    Auth.redirectByRole();
    return;
  }

  const form = document.getElementById('registerForm');
  const nameInput = document.getElementById('registerFullName');
  const usernameInput = document.getElementById('registerUsername');
  const passwordInput = document.getElementById('registerPassword');
  const confirmInput = document.getElementById('registerConfirmPassword');
  const roleInput = document.getElementById('registerRole');
  const message = document.getElementById('registerMessage');
  const passwordLengthRule = document.getElementById('passwordLengthRule');
  const passwordLetterRule = document.getElementById('passwordLetterRule');
  const passwordNumberRule = document.getElementById('passwordNumberRule');
  const passwordSymbolRule = document.getElementById('passwordSymbolRule');
  const confirmHint = document.getElementById('confirmPasswordHint');

  function updatePasswordRequirements(value) {
    const hasLength = value.length >= 16;
    const hasLetter = /[A-Za-z]/.test(value);
    const hasNumber = /\d/.test(value);
    const hasSymbol = /[^A-Za-z\d]/.test(value);

    passwordLengthRule.classList.toggle('password-rule-met', hasLength);
    passwordLetterRule.classList.toggle('password-rule-met', hasLetter);
    passwordNumberRule.classList.toggle('password-rule-met', hasNumber);
    passwordSymbolRule.classList.toggle('password-rule-met', hasSymbol);

    passwordLengthRule.classList.toggle('password-rule-unmet', !hasLength);
    passwordLetterRule.classList.toggle('password-rule-unmet', !hasLetter);
    passwordNumberRule.classList.toggle('password-rule-unmet', !hasNumber);
    passwordSymbolRule.classList.toggle('password-rule-unmet', !hasSymbol);
  }

  updatePasswordRequirements(passwordInput.value);
  passwordInput.addEventListener('input', () => {
    updatePasswordRequirements(passwordInput.value);
    // update confirm hint on password change
    if (confirmInput.value.length > 0) {
      confirmHint.textContent = confirmInput.value === passwordInput.value ? 'Passwords match' : 'Passwords do not match';
      confirmHint.classList.toggle('password-rule-met', confirmInput.value === passwordInput.value);
      confirmHint.classList.toggle('password-rule-unmet', confirmInput.value !== passwordInput.value);
    }
  });

  confirmInput.addEventListener('input', () => {
    confirmHint.textContent = confirmInput.value === passwordInput.value ? 'Passwords match' : 'Passwords do not match';
    confirmHint.classList.toggle('password-rule-met', confirmInput.value === passwordInput.value);
    confirmHint.classList.toggle('password-rule-unmet', confirmInput.value !== passwordInput.value);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(message, '');

    const fullName = nameInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;
    const confirmPassword = confirmInput.value;
    const role = roleInput.value;

    const usernamePattern = /^[a-zA-Z0-9_]{3,20}$/;
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{16,128}$/;
    updatePasswordRequirements(password);

    if (fullName.length < 2) {
      setMessage(message, 'Enter your full name.', 'error');
      return;
    }

    if (!usernamePattern.test(username)) {
      setMessage(message, 'Username must be 3-20 characters and only letters, numbers, or _.', 'error');
      return;
    }

    if (!passwordPattern.test(password)) {
      setMessage(message, 'Password must be at least 16 characters and include letters, numbers, and symbols.', 'error');
      return;
    }

    if (password !== confirmPassword) {
      setMessage(message, 'Passwords do not match.', 'error');
      return;
    }

    if (!['patron', 'librarian'].includes(role)) {
      setMessage(message, 'Select a valid account role.', 'error');
      return;
    }

    try {
      await Auth.register(fullName, username, password, role);
      setMessage(message, 'Account created. Redirecting...', 'success');
      Auth.redirectByRole();
    } catch (error) {
      setMessage(message, error.message, 'error');
    }
  });
}

function createBookNode(book, isPatron, onCheckout) {
  const row = document.createElement('article');
  row.className = 'item';

  const left = document.createElement('div');
  const title = document.createElement('h3');
  title.className = 'item-title';
  title.textContent = book.title;

  const meta = document.createElement('p');
  meta.className = 'item-meta';
  meta.textContent = `${book.author} | ISBN ${book.isbn} | ID ${book.id}`;

  left.appendChild(title);
  left.appendChild(meta);

  const right = document.createElement('div');
  right.className = 'button-row';

  const badge = document.createElement('span');
  const availability = availabilityClass(book.quantity);
  badge.className = `badge ${availability}`;
  badge.textContent = book.quantity > 0 ? `${book.quantity} available` : 'Out of stock';
  right.appendChild(badge);

  if (isPatron) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-accent';
    button.textContent = 'Checkout';
    button.disabled = book.quantity <= 0;
    button.addEventListener('click', () => onCheckout(book.id));
    right.appendChild(button);
  }

  row.appendChild(left);
  row.appendChild(right);
  return row;
}

async function initCatalogPage() {
  const session = Auth.requireAuth(['patron', 'librarian']);
  if (!session) {
    return;
  }

  Auth.buildNav('topNav');

  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('searchTerm');
  const list = document.getElementById('catalogList');
  const message = document.getElementById('catalogMessage');
  const isPatron = session.user.role === 'patron';

  async function renderBooks(books) {
    clearElementChildren(list);
    if (books.length === 0) {
      setMessage(message, 'No books matched the search.', 'error');
      return;
    }

    setMessage(message, `${books.length} books found.`, 'success');
    books.forEach((book) => {
      const node = createBookNode(book, isPatron, async (bookId) => {
        try {
          await Api.checkoutBook(session.user.id, bookId);
          setMessage(message, 'Book checked out successfully.', 'success');
          const refreshed = await Api.getBooks();
          renderBooks(refreshed);
        } catch (error) {
          setMessage(message, error.message, 'error');
        }
      });
      list.appendChild(node);
    });
  }

  const initialBooks = await Api.getBooks();
  renderBooks(initialBooks);

  searchForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(message, '');
    const term = searchInput.value.trim();

    if (term.length < 2) {
      setMessage(message, 'Search text must be at least 2 characters.', 'error');
      return;
    }

    try {
      const results = await Api.searchBooks(term);
      renderBooks(results);
    } catch (error) {
      setMessage(message, error.message, 'error');
    }
  });

  document.getElementById('resetSearch').addEventListener('click', async () => {
    searchInput.value = '';
    const books = await Api.getBooks();
    renderBooks(books);
  });
}

async function initPatronDashboard() {
  const session = Auth.requireAuth(['patron']);
  if (!session) {
    return;
  }

  Auth.buildNav('topNav');

  const checkoutForm = document.getElementById('checkoutForm');
  const returnForm = document.getElementById('returnForm');
  const checkoutId = document.getElementById('checkoutBookId');
  const returnId = document.getElementById('returnBookId');
  const checkoutMessage = document.getElementById('checkoutMessage');
  const returnMessage = document.getElementById('returnMessage');
  const list = document.getElementById('borrowedList');

  async function renderBorrowed() {
    const books = await Api.getBorrowedBooks(session.user.id);
    clearElementChildren(list);

    if (books.length === 0) {
      const node = document.createElement('p');
      node.className = 'small';
      node.textContent = 'No borrowed books yet.';
      list.appendChild(node);
      return;
    }

    books.forEach((book) => {
      const item = document.createElement('article');
      item.className = 'item';

      const left = document.createElement('div');
      const title = document.createElement('h3');
      title.className = 'item-title';
      title.textContent = `${book.title} (ID ${book.bookId})`;

      const meta = document.createElement('p');
      meta.className = 'item-meta';
      meta.textContent = `${book.author} | Borrowed ${prettyDate(book.borrowedAt)}`;

      left.appendChild(title);
      left.appendChild(meta);
      item.appendChild(left);

      list.appendChild(item);
    });
  }

  checkoutForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(checkoutMessage, '');

    const bookId = Number(checkoutId.value.trim());
    if (!Number.isInteger(bookId) || bookId <= 0) {
      setMessage(checkoutMessage, 'Provide a valid Book ID for checkout.', 'error');
      return;
    }

    try {
      await Api.checkoutBook(session.user.id, bookId);
      setMessage(checkoutMessage, 'Checkout complete.', 'success');
      checkoutForm.reset();
      renderBorrowed();
    } catch (error) {
      setMessage(checkoutMessage, error.message, 'error');
    }
  });

  returnForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(returnMessage, '');

    const bookId = Number(returnId.value.trim());
    if (!Number.isInteger(bookId) || bookId <= 0) {
      setMessage(returnMessage, 'Provide a valid Book ID for return.', 'error');
      return;
    }

    try {
      await Api.returnBook(session.user.id, bookId);
      setMessage(returnMessage, 'Return recorded.', 'success');
      returnForm.reset();
      renderBorrowed();
    } catch (error) {
      setMessage(returnMessage, error.message, 'error');
    }
  });

  renderBorrowed();
}

async function initLibrarianDashboard() {
  const session = Auth.requireAuth(['librarian']);
  if (!session) {
    return;
  }

  Auth.buildNav('topNav');

  const books = await Api.getBooks();
  const transactions = await Api.getTransactions();
  const borrowedCount = transactions.filter((item) => item.type === 'checkout').length - transactions.filter((item) => item.type === 'return').length;

  document.getElementById('kpiTotalBooks').textContent = String(books.length);
  document.getElementById('kpiInStock').textContent = String(books.reduce((sum, book) => sum + book.quantity, 0));
  document.getElementById('kpiBorrowed').textContent = String(Math.max(0, borrowedCount));
}

async function initInventoryPage() {
  const session = Auth.requireAuth(['librarian']);
  if (!session) {
    return;
  }

  Auth.buildNav('topNav');

  const form = document.getElementById('inventoryForm');
  const message = document.getElementById('inventoryMessage');
  const tableBody = document.getElementById('inventoryRows');

  async function renderInventory() {
    const books = await Api.getBooks();
    clearElementChildren(tableBody);

    books.forEach((book) => {
      const row = document.createElement('tr');

      const columns = [book.id, book.isbn, book.title, book.author, book.quantity];
      columns.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      });

      tableBody.appendChild(row);
    });
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(message, '');

    const payload = {
      isbn: document.getElementById('invIsbn').value,
      title: document.getElementById('invTitle').value,
      author: document.getElementById('invAuthor').value,
      quantity: document.getElementById('invQty').value
    };

    if (
      payload.isbn.trim().length < 10
      || payload.title.trim().length < 2
      || payload.author.trim().length < 2
      || !Number.isInteger(Number(payload.quantity))
      || Number(payload.quantity) < 0
    ) {
      setMessage(message, 'Enter valid inventory details before saving.', 'error');
      return;
    }

    try {
      await Api.upsertInventory(payload);
      setMessage(message, 'Inventory saved successfully.', 'success');
      form.reset();
      renderInventory();
    } catch (error) {
      setMessage(message, error.message, 'error');
    }
  });

  renderInventory();
}

async function initTransactionsPage() {
  const session = Auth.requireAuth(['librarian']);
  if (!session) {
    return;
  }

  Auth.buildNav('topNav');

  const form = document.getElementById('filterForm');
  const userInput = document.getElementById('filterUser');
  const typeInput = document.getElementById('filterType');
  const message = document.getElementById('txMessage');
  const tableBody = document.getElementById('txRows');

  function renderRows(rows) {
    clearElementChildren(tableBody);

    if (rows.length === 0) {
      setMessage(message, 'No transactions found with current filters.', 'error');
      return;
    }

    setMessage(message, `${rows.length} transactions found.`, 'success');

    rows.forEach((item) => {
      const row = document.createElement('tr');
      const columns = [
        item.id,
        item.userId,
        item.bookId,
        item.bookTitle,
        item.type,
        prettyDate(item.at)
      ];

      columns.forEach((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.appendChild(cell);
      });

      tableBody.appendChild(row);
    });
  }

  async function refresh(filters = {}) {
    const rows = await Api.getTransactions(filters);
    renderRows(rows);
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setMessage(message, '');

    const userId = userInput.value.trim();
    const type = typeInput.value;

    if (userId.length > 0 && userId.length < 2) {
      setMessage(message, 'If filtering by user, use at least 2 characters.', 'error');
      return;
    }

    refresh({ userId, type });
  });

  document.getElementById('clearFilter').addEventListener('click', () => {
    userInput.value = '';
    typeInput.value = 'all';
    refresh();
  });

  refresh();
}

function initPage() {
  const page = document.body.getAttribute('data-page');

  if (page === 'login') {
    initLoginPage();
    return;
  }

  if (page === 'register') {
    initRegisterPage();
    return;
  }

  if (page === 'catalog') {
    initCatalogPage();
    return;
  }

  if (page === 'patron-dashboard') {
    initPatronDashboard();
    return;
  }

  if (page === 'librarian-dashboard') {
    initLibrarianDashboard();
    return;
  }

  if (page === 'inventory') {
    initInventoryPage();
    return;
  }

  if (page === 'transactions') {
    initTransactionsPage();
  }
}

document.addEventListener('DOMContentLoaded', initPage);
