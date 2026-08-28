import { getJson } from './api.js';
import { showFormError, formatMoney, formatCard } from './ui.js';

const upcomingCard = document.querySelector('#upcomingCard');
const noSubscriptionNote = document.querySelector('#noSubscriptionNote');
const paymentsTableWrap = document.querySelector('#paymentsTableWrap');
const paymentsBody = document.querySelector('#paymentsBody');
const noPayments = document.querySelector('#noPayments');

const instant = (value) => new Date(value).toLocaleDateString();

const calendarDay = (value) =>
  new Date(value).toLocaleDateString(undefined, { timeZone: 'UTC' });

const renderUpcoming = (upcoming) => {
  if (!upcoming) {
    upcomingCard.classList.add('d-none');
    noSubscriptionNote.classList.remove('d-none');
    return;
  }

  document.querySelector('#upcomingAmount').textContent = formatMoney(
    upcoming.amount,
  );
  document.querySelector('#upcomingDue').textContent = upcoming.due_on
    ? `Due ${calendarDay(upcoming.due_on)}`
    : 'No date scheduled';
  document.querySelector('#upcomingPlan').textContent =
    upcoming.plan_name ?? '';
};

const renderPayments = (payments) => {
  if (payments.length === 0) {
    paymentsTableWrap.classList.add('d-none');
    noPayments.classList.remove('d-none');
    return;
  }

  const fragment = document.createDocumentFragment();

  for (const payment of payments) {
    const row = document.createElement('tr');

    const cells = [
      instant(payment.paid_at),
      payment.plan_name ?? '(plan no longer offered)',
      calendarDay(payment.period_start),
      formatCard(payment.card_last4),
    ];

    for (const value of cells) {
      const td = document.createElement('td');
      td.textContent = value;
      row.append(td);
    }

    const amount = document.createElement('td');
    amount.className = 'text-end font-monospace';
    amount.textContent = formatMoney(payment.amount_paid);
    row.append(amount);

    fragment.append(row);
  }

  paymentsBody.replaceChildren(fragment);
};

async function loadPayments() {
  try {
    const data = await getJson('/payments/me');

    if (!data) return;

    renderUpcoming(data.history.upcoming);
    renderPayments(data.history.payments);
  } catch (e) {
    console.error(e);
    upcomingCard.classList.add('d-none');
    paymentsTableWrap.classList.add('d-none');
    showFormError('Could not load your billing history. Please refresh.');
  }
}

loadPayments();
