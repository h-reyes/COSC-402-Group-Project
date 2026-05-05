function setMessage(element, message, status = '') {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.classList.remove('error', 'success');
  if (status) {
    element.classList.add(status);
  }
}

function clearElementChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function availabilityClass(quantity) {
  if (quantity <= 0) {
    return 'out';
  }

  if (quantity <= 2) {
    return 'low';
  }

  return 'available';
}

function prettyDate(dateValue) {
  return new Date(dateValue).toLocaleString();
}
