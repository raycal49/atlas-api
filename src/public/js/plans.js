import { getJson, postForm } from './api.js';
import {
  showFormError,
  showFormNotice,
  showFieldErrors,
  hideErrors,
  formatMoney,
  monthDay,
  daysBetween,
} from './ui.js';

const planList = document.querySelector('#planList');
const paymentForm = document.querySelector('#paymentForm');
const chosenPlanName = document.querySelector('#chosenPlanName');
const submitBtn = paymentForm.querySelector('button[type="submit"]');
const cardField = document.querySelector('#cardField');
const cardInput = document.querySelector('#card_number');
const dueToday = document.querySelector('#dueToday');
const effectiveNote = document.querySelector('#effectiveNote');
const FIELDS = ['card_number'];

let selectedPlan = null;
let checkout = null;
let currentSubscription = null;

const isFree = (plan) => Number(plan.price_per_month) === 0;

const isPlanChange = (plan) =>
  currentSubscription !== null && plan.plan_name !== currentSubscription.plan;

const isDowngrade = (plan) =>
  isPlanChange(plan) &&
  Number(plan.price_per_month) <= Number(currentSubscription.price);

const isUpgrade = (plan) =>
  isPlanChange(plan) &&
  Number(plan.price_per_month) > Number(currentSubscription.price);

const isCurrent = (plan) => currentSubscription !== null && !isPlanChange(plan);

const startOfNextCycle = () =>
  currentSubscription?.bill_due ? monthDay(currentSubscription.bill_due) : null;

const previewProratedUpgrade = (newPrice) => {
  const difference = Number(newPrice) - Number(currentSubscription.price);

  if (Number(currentSubscription.price) === 0) return difference.toFixed(2);

  if (!currentSubscription.bill_start || !currentSubscription.bill_due)
    return null;

  const totalDays = daysBetween(
    currentSubscription.bill_start,
    currentSubscription.bill_due,
  );
  const daysRemaining = daysBetween(new Date(), currentSubscription.bill_due);

  const billableDays = daysRemaining <= 0 ? totalDays : daysRemaining;

  return ((difference * billableDays) / totalDays).toFixed(2);
};

const checkoutFor = (plan) => {
  const starts = startOfNextCycle();
  const upgradeAmount = isUpgrade(plan)
    ? previewProratedUpgrade(plan.price_per_month)
    : null;

  if (isDowngrade(plan))
    return {
      dueValue: formatMoney(0),
      note: starts ? `${plan.plan_name} starts ${starts}` : '',
      submit: 'Subscribe',
      needsCard: false,
    };

  if (isUpgrade(plan))
    return {
      dueValue:
        upgradeAmount === null
          ? 'prorated for the days left in your billing period'
          : formatMoney(upgradeAmount),
      note: '',
      submit: 'Pay',
      needsCard: true,
    };

  if (isFree(plan))
    return {
      dueValue: formatMoney(plan.price_per_month),
      note: '',
      submit: 'Subscribe',
      needsCard: false,
    };

  return {
    dueValue: formatMoney(plan.price_per_month),
    note: '',
    submit: 'Pay',
    needsCard: true,
  };
};

const choosePlan = (plan) => {
  selectedPlan = plan;
  checkout = checkoutFor(plan);

  chosenPlanName.textContent = plan.plan_name;
  dueToday.textContent = checkout.dueValue;
  effectiveNote.textContent = checkout.note;
  effectiveNote.classList.toggle('d-none', !checkout.note);
  submitBtn.textContent = checkout.submit;

  cardField.classList.toggle('d-none', !checkout.needsCard);
  cardInput.required = checkout.needsCard;
  if (!checkout.needsCard) cardInput.value = '';

  hideErrors(FIELDS);
  paymentForm.classList.remove('d-none');
  paymentForm.scrollIntoView({ behavior: 'smooth' });
};

const renderPlans = (plans) => {
  const fragment = document.createDocumentFragment();

  for (const plan of plans) {
    const col = document.createElement('div');
    col.className = 'col';

    const card = document.createElement('div');
    card.className = 'card h-100 shadow-sm';

    const body = document.createElement('div');
    body.className = 'card-body d-flex flex-column';

    const name = document.createElement('h2');
    name.className = 'card-title h5';
    name.textContent = plan.plan_name;

    const price = document.createElement('p');
    price.className = 'card-text fw-bold';
    price.textContent = `$${plan.price_per_month} / month`;

    const description = document.createElement('p');
    description.className = 'card-text text-body-secondary';
    description.textContent = plan.description ?? '';

    const chooseBtn = document.createElement('button');
    chooseBtn.type = 'button';
    chooseBtn.className = 'btn btn-primary mt-auto';
    chooseBtn.dataset.auth = 'in';
    chooseBtn.textContent = 'Choose';
    chooseBtn.addEventListener('click', () => choosePlan(plan));

    if (isCurrent(plan)) {
      chooseBtn.textContent = 'Current plan';
      chooseBtn.className = 'btn btn-outline-secondary mt-auto';
      chooseBtn.disabled = true;
    }

    const signInLink = document.createElement('a');
    signInLink.className = 'btn btn-outline-secondary mt-auto';
    signInLink.dataset.auth = 'out';
    signInLink.href = '/login.html';
    signInLink.textContent = 'Sign in to subscribe';

    body.append(name, price, description, chooseBtn, signInLink);
    card.append(body);
    col.append(card);
    fragment.append(col);
  }

  planList.replaceChildren(fragment);
};

async function loadCurrentPlan() {
  if (!document.documentElement.classList.contains('auth-in')) return;

  try {
    const data = await getJson('/data');
    currentSubscription = data?.dashboard ?? null;
  } catch (e) {
    console.error(e);
    currentSubscription = null;
  }
}

async function init() {
  try {
    const [plansData] = await Promise.all([
      getJson('/plans'),
      loadCurrentPlan(),
    ]);

    if (!plansData) return;

    renderPlans(plansData.plans);
  } catch (e) {
    console.error(e);
    showFormError('Could not load plans. Please refresh.');
  }
}

async function payForPlan() {
  submitBtn.disabled = true;

  try {
    const fields = { plan_name: selectedPlan.plan_name };
    if (checkout.needsCard) fields.card_number = cardInput.value;

    const { status, body } = await postForm('/subscriptions', fields);

    const { charged, payment_id } = body.subscription ?? {};

    if (charged == true) {
      window.location.href = '/dashboard?paid=' + payment_id;
      return;
    } else if (charged === false) {
      const starts = startOfNextCycle();

      showFormNotice(
        starts
          ? `You'll move to ${selectedPlan.plan_name} on ${starts}.`
          : `You'll move to ${selectedPlan.plan_name} at the start of your next billing cycle.`,
      );
      return;
    }

    if (status === 401) {
      window.location.href = '/login.html';
      return;
    }

    if (status === 400 && body?.status === 'fail') {
      showFieldErrors(FIELDS, body.errors);
      return;
    }

    if (status === 409 || status === 400) {
      showFormError(body);
      return;
    }

    showFormError('Something went wrong. Please try again.');
  } catch (e) {
    console.error(e);
    showFormError('Something went wrong. Please try again.');
  } finally {
    submitBtn.disabled = false;
  }
}

paymentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideErrors(FIELDS);
  await payForPlan();
});

paymentForm.addEventListener('input', () => hideErrors(FIELDS));

init();
