import { getJson } from "./api.js";
import { showFormError, formatCount } from "./ui.js";

const logoutBtn = document.querySelector("#logout-button");
const myPlanSection = document.querySelector("#myPlanSection");
const pickPlanPrompt = document.querySelector("#pickPlanPrompt");
const paidBanner = document.querySelector("#paidBanner");
const usageSection = document.querySelector("#usageSection");
const usageList = document.querySelector("#usageList");

// the server decides which state an API is in; this only maps that decision to
// a Bootstrap colour. Phase 2 replaces these with CSS driven off data-state
const STATE_CLASS = {
    warning: "bg-warning",
    critical: "bg-danger",
};

async function logoutUser() {
    logoutBtn.disabled = true;

    try {
        const response = await fetch("/auth/logout", {
            method: "POST",
        });

        if (response.ok) {
            window.location.href = '/login.html';
            return;
        }

        showFormError("Something went wrong. Please try again.");
    } catch (e) {
        console.error(e);
        showFormError("Something went wrong. Please try again.");
    } finally {
        logoutBtn.disabled = false;
    }
}

const daysLabel = (days) => {
    if (days === null || days === undefined) return "";
    if (days < 0) return "overdue";
    if (days === 0) return "due today";
    if (days === 1) return "due tomorrow";
    return `in ${days} days`;
}

// the three tiles are fixed structure with only their values changing, so the
// markup lives in dashboard.html and this just fills the spans. createElement is
// for lists whose length comes from the data -- see renderUsage below
const renderKpis = (usage, plan) => {
    document.querySelector("#planName").textContent = plan?.plan_name ?? "(plan no longer offered)";
    document.querySelector("#planPrice").textContent = plan ? `$${plan.price_per_month} / month` : "";

    // next_bill_due is a calendar date, not an instant -- rendering it in UTC
    // stops it slipping to the previous day for users west of UTC
    document.querySelector("#nextBillDue").textContent = usage.next_bill_due
        ? new Date(usage.next_bill_due).toLocaleDateString(undefined,
            { timeZone: "UTC", month: "short", day: "numeric" })
        : "—";

    document.querySelector("#nextBillIn").textContent = daysLabel(usage.days_until_next_bill);

    document.querySelector("#totalCalls").textContent = formatCount(usage.total_calls);
    document.querySelector("#apiCount").textContent =
        `across ${usage.api_count} API${usage.api_count === 1 ? "" : "s"}`;
}

// one row per API in the plan: name, the used/limit counts, and a bar so the
// state is readable without reading the numbers. built with
// createElement/textContent so api names are always treated as text, never HTML
const renderUsage = (apis) => {
    if (apis.length === 0) {
        const empty = document.createElement("p");
        empty.className = "text-muted mb-0";
        empty.textContent = "Your plan doesn't include any APIs yet.";
        usageList.replaceChildren(empty);
        return;
    }

    // rows are assembled off-document and attached in one go: N appends to a live
    // node means N chances to trigger layout, and this list grows with the plan
    const fragment = document.createDocumentFragment();

    for (const api of apis) {
        const row = document.createElement("div");
        row.className = "mb-3";
        // the semantic state, for CSS to style -- JS never picks a colour
        row.dataset.state = api.state;

        const name = document.createElement("p");
        name.className = "mb-1 fw-semibold";
        name.textContent = api.api_name;

        const counts = document.createElement("p");
        counts.className = "mb-1 small text-muted";
        counts.textContent =
            `${api.calls_used} / ${api.monthly_limit} calls used — ${api.calls_remaining} left`;

        const track = document.createElement("div");
        track.className = "progress";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${api.api_name} usage`);
        track.setAttribute("aria-valuenow", api.percent_used);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");

        const bar = document.createElement("div");
        bar.className = "progress-bar";

        const stateClass = STATE_CLASS[api.state];
        if (stateClass) bar.classList.add(stateClass);

        bar.style.width = `${api.percent_used}%`;

        track.append(bar);
        row.append(name, counts, track);
        fragment.append(row);
    }

    // replaceChildren, not append: rendering twice must produce the same list,
    // not two of everything
    usageList.replaceChildren(fragment);
}

// the dashboard never assumes how you got here -- it asks the server what is
// true right now and renders exactly one of its two states
// dashboard has two hidden segments--the "my plan" section and the "plan picker" section
// it unhides whichever section based off whether or not you have a plan or not
async function loadDashboard() {
    try {
        const [subData, plansData, usageData] = await Promise.all([
            getJson("/subscriptions/me"),
            getJson("/plans"),
            getJson("/usage/me"),
        ]);

        // a null means getJson saw a 401 and the browser is already navigating
        // to the login page -- there is nothing left to render
        if (!subData || !plansData || !usageData) return;

        const { subscription } = subData;
        const { plans } = plansData;
        const { usage } = usageData;

        // subscription response is supposed to hold the user's subscription
        // if it doesn't, then we reveal pick plan prompt and return from the function here
        if (!subscription) {
            pickPlanPrompt.classList.remove("hidden");
            return;
        }

        // from here on out, we know the user has a subscription and the subscription variable stores the plan id
        // /subscriptions/me only knows the plan_id; the display details
        // (name, price) come from matching it against the /plans list
        const plan = plans.find((p) => p.plan_id === subscription.plan_id);

        document.querySelector("#planSince").textContent =
            new Date(subscription.started_at).toLocaleDateString();

        // usage is non-null whenever a subscription is, but guard anyway so a
        // surprise here can't blank out the plan details we just rendered
        if (usage) {
            renderKpis(usage, plan);
            renderUsage(usage.apis);
            usageSection.classList.remove("hidden");
        }

        myPlanSection.classList.remove("hidden");
    } catch (e) {
        console.error(e);
        showFormError("Could not load your dashboard. Please refresh.");
    }
}

// after a successful payment, plans.js redirects here with ?paid=<receipt id>
const showReceiptIfJustPaid = () => {
    const paymentId = new URLSearchParams(window.location.search).get("paid");

    if (!paymentId) return;

    document.querySelector("#receiptId").textContent = paymentId;
    paidBanner.classList.remove("hidden");

    // strip ?paid= from the address bar so a refresh doesn't re-show the banner
    history.replaceState(null, "", "/dashboard");
}

logoutBtn.addEventListener("click", async () => {
    showFormError(null);
    await logoutUser();
});

showReceiptIfJustPaid();
loadDashboard();
