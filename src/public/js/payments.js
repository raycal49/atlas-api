import { getJson } from "./api.js";
import { showFormError, formatMoney, formatCard } from "./ui.js";

const upcomingCard = document.querySelector("#upcomingCard");
const noSubscriptionNote = document.querySelector("#noSubscriptionNote");
const paymentsTableWrap = document.querySelector("#paymentsTableWrap");
const paymentsBody = document.querySelector("#paymentsBody");
const noPayments = document.querySelector("#noPayments");

// paid_at is a real instant, so the local clock is the right thing to show it in
const instant = (value) => new Date(value).toLocaleDateString();

// period_start and due_on are calendar dates -- rendering them in UTC stops them
// slipping to the previous day for anyone west of UTC
const calendarDay = (value) =>
    new Date(value).toLocaleDateString(undefined, { timeZone: "UTC" });

const renderUpcoming = (upcoming) => {
    if (!upcoming) {
        noSubscriptionNote.classList.remove("d-none");
        return;
    }

    document.querySelector("#upcomingAmount").textContent = formatMoney(upcoming.amount);
    document.querySelector("#upcomingDue").textContent = upcoming.due_on
        ? `Due ${calendarDay(upcoming.due_on)}`
        : "No date scheduled";
    document.querySelector("#upcomingPlan").textContent = upcoming.plan_name ?? "";

    upcomingCard.classList.remove("d-none");
}

// one row per payment, built with createElement/textContent so plan names are
// always treated as text and never as HTML
const renderPayments = (payments) => {
    if (payments.length === 0) {
        noPayments.classList.remove("d-none");
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const payment of payments) {
        const row = document.createElement("tr");

        const cells = [
            instant(payment.paid_at),
            payment.plan_name ?? "(plan no longer offered)",
            calendarDay(payment.period_start),
            formatCard(payment.card_last4),
        ];

        for (const value of cells) {
            const td = document.createElement("td");
            td.textContent = value;
            row.append(td);
        }

        // amounts are the one column that must line up down the page, which is
        // exactly what tabular-nums is for
        const amount = document.createElement("td");
        amount.className = "text-end font-monospace";
        amount.textContent = formatMoney(payment.amount_paid);
        row.append(amount);

        fragment.append(row);
    }

    // replaceChildren so a re-render swaps the rows rather than doubling them
    paymentsBody.replaceChildren(fragment);
    paymentsTableWrap.classList.remove("d-none");
}

async function loadPayments() {
    try {
        const data = await getJson("/payments/me");

        // a null means getJson saw a 401 and the browser is already navigating
        // to the login page -- there is nothing left to render
        if (!data) return;

        renderUpcoming(data.history.upcoming);
        renderPayments(data.history.payments);
    } catch (e) {
        console.error(e);
        showFormError("Could not load your billing history. Please refresh.");
    }
}

loadPayments();
