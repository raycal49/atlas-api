export const showFormError = (message) => {
  const span = document.querySelector("#form-error");
  if (!span) return;

  span.textContent = message ?? "";
  span.classList.toggle("invisible", !message);
};

export const showFieldErrors = (fields, errors = {}) => {
  for (const field of fields) {
    const span = document.querySelector(`#${field}-error`);
    if (span) span.classList.toggle("invisible", !errors[field]);
  }
};

export const hideErrors = (fields) => {
  showFieldErrors(fields, {});
  showFormError(null);
};

const compact = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatCount = (n) =>
  n < 10_000 ? n.toLocaleString() : compact.format(n);

const money = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

export const formatMoney = (value) => money.format(Number(value));

export const formatCard = (last4) =>
  last4 === null || last4 === undefined ? "—" : `•••• ${String(last4).padStart(4, "0")}`;
