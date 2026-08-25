import { getJson, postForm } from "./api.js";
import { showFormError, showFormNotice, showFieldErrors, hideErrors, formatMoney, monthDay, daysBetween } from "./ui.js";

const planList = document.querySelector("#planList");
const paymentForm = document.querySelector("#paymentForm");
const chosenPlanName = document.querySelector("#chosenPlanName");
const submitBtn = paymentForm.querySelector('button[type="submit"]');
const cardField = document.querySelector("#cardField");
const cardInput = document.querySelector("#card_number");
const dueToday = document.querySelector("#dueToday");
const effectiveNote = document.querySelector("#effectiveNote");
const FIELDS = ["card_number"];

let selectedPlan = null;
let checkout = null;
let currentPlan = null;   // GET /data payload for the signed-in user, or null

const isFree = (plan) => Number(plan.price_per_month) === 0;

const isPlanChange = (plan) =>
    currentPlan !== null && plan.plan_name !== currentPlan.plan;

const isDowngrade = (plan) =>
    isPlanChange(plan) && Number(plan.price_per_month) <= Number(currentPlan.price);

const isUpgrade = (plan) =>
    isPlanChange(plan) && Number(plan.price_per_month) > Number(currentPlan.price);

const startOfNextCycle = () =>
    currentPlan?.bill_due ? monthDay(currentPlan.bill_due) : null;

// Mirrors prorateUpgrade in src/services/userServices.js — keep both in step.
// The server is what actually charges; this is only the quote on the card.
const proratedUpgrade = (newPrice) => {
    const difference = Number(newPrice) - Number(currentPlan.price);

    // Nothing was paid for a free period, so there is no part-month to credit against.
    if (Number(currentPlan.price) === 0) return difference.toFixed(2);

    if (!currentPlan.bill_start || !currentPlan.bill_due) return null;

    const totalDays = daysBetween(currentPlan.bill_start, currentPlan.bill_due);
    const daysRemaining = daysBetween(new Date(), currentPlan.bill_due);

    // Past the due date the period would have rolled over, so a full period is owed.
    const billableDays = daysRemaining <= 0 ? totalDays : daysRemaining;

    return (difference * billableDays / totalDays).toFixed(2);
};

const checkoutFor = (plan) => {
    const starts = startOfNextCycle();
    const upgradeAmount = isUpgrade(plan) ? proratedUpgrade(plan.price_per_month) : null;

    if (isDowngrade(plan))
        return {
            dueValue: formatMoney(0),
            note: starts ? `${plan.plan_name} starts ${starts}` : "",
            submit: "Subscribe",
            needsCard: false,
        };

    if (isUpgrade(plan))
        return {
            dueValue: upgradeAmount === null
                ? "prorated for the days left in your billing period"
                : formatMoney(upgradeAmount),
            note: "",
            submit: "Pay",
            needsCard: true,
        };

    if (isFree(plan))
        return {
            dueValue: formatMoney(plan.price_per_month),
            note: "",
            submit: "Subscribe",
            needsCard: false,
        };

    return {
        dueValue: formatMoney(plan.price_per_month),
        note: "",
        submit: "Pay",
        needsCard: true,
    };
}

const choosePlan = (plan) => {
    selectedPlan = plan;
    checkout = checkoutFor(plan);

    chosenPlanName.textContent = plan.plan_name;
    dueToday.textContent = checkout.dueValue;
    effectiveNote.textContent = checkout.note;
    effectiveNote.classList.toggle("d-none", !checkout.note);
    submitBtn.textContent = checkout.submit;

    cardField.classList.toggle("d-none", !checkout.needsCard);
    cardInput.required = checkout.needsCard;
    if (!checkout.needsCard) cardInput.value = "";

    hideErrors(FIELDS);
    paymentForm.classList.remove("d-none");
    paymentForm.scrollIntoView({ behavior: "smooth" });
}

const renderPlans = (plans) => {
    const fragment = document.createDocumentFragment();

    for (const plan of plans) {
        const col = document.createElement("div");
        col.className = "col";

        const card = document.createElement("div");
        card.className = "card h-100 shadow-sm";

        const body = document.createElement("div");
        body.className = "card-body d-flex flex-column";

        const name = document.createElement("h2");
        name.className = "card-title h5";
        name.textContent = plan.plan_name;

        const price = document.createElement("p");
        price.className = "card-text fw-bold";
        price.textContent = `$${plan.price_per_month} / month`;

        const description = document.createElement("p");
        description.className = "card-text text-body-secondary";
        description.textContent = plan.description ?? "";

        const chooseBtn = document.createElement("button");
        chooseBtn.type = "button";
        chooseBtn.className = "btn btn-primary mt-auto";
        chooseBtn.dataset.auth = "in";
        chooseBtn.textContent = "Choose";
        chooseBtn.addEventListener("click", () => choosePlan(plan.plan_name));

        const signInLink = document.createElement("a");
        signInLink.className = "btn btn-outline-secondary mt-auto";
        signInLink.dataset.auth = "out";
        signInLink.href = "/login.html";
        signInLink.textContent = "Sign in to subscribe";

        body.append(name, price, description, chooseBtn, signInLink);
        card.append(body);
        col.append(card);
        fragment.append(col);
    }

    planList.replaceChildren(fragment);
}

async function loadCurrentPlan() {
    if (!document.documentElement.classList.contains("auth-in")) return;

    try {
        const data = await getJson("/data");
        currentPlan = data?.dashboardData ?? null;
    } catch (e) {
        console.error(e);
        currentPlan = null;   // fall back to plain sticker pricing
    }
}

async function init() {
    try {
        const [plansData] = await Promise.all([getJson("/plans"), loadCurrentPlan()]);

        if (!plansData) return;

        renderPlans(plansData.plans);
    } catch (e) {
        console.error(e);
        showFormError("Could not load plans. Please refresh.");
    }
}

async function payForPlan() {
    submitBtn.disabled = true;

    try {
        const fields = { plan_name: selectedPlan.plan_name };
        if (checkout.needsCard) fields.card_number = cardInput.value;

        const { ok, status, body } = await postForm("/subscriptions", fields);

        if (ok) {
            if (body?.scheduled) {
                const starts = startOfNextCycle();

                showFormNotice(starts
                    ? `You'll move to ${body.scheduled} on ${starts}.`
                    : `You'll move to ${body.scheduled} at the start of your next billing cycle.`);
                return;
            }

            window.location.href = "/dashboard?paid=" + body.paymentId;
            return;
        }

        if (status === 401) {
            window.location.href = "/login.html";
            return;
        }

        if (status === 400 && body?.status === "fail") {
            showFieldErrors(FIELDS, body.errors);
            return;
        }

        if (status === 409 || status === 400) {
            showFormError(body);
            return;
        }

        showFormError("Something went wrong. Please try again.");
    } catch (e) {
        console.error(e);
        showFormError("Something went wrong. Please try again.");
    } finally {
        submitBtn.disabled = false;
    }
}

paymentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideErrors(FIELDS);
    await payForPlan();
});

paymentForm.addEventListener("input", () => hideErrors(FIELDS));

init();
