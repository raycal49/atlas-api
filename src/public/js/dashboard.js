import { getJson } from "./api.js";
import { showFormError, formatCount } from "./ui.js";

const logoutBtn = document.querySelector("#logout-button");
const myPlanSection = document.querySelector("#myPlanSection");
const pickPlanPrompt = document.querySelector("#pickPlanPrompt");
const paidBanner = document.querySelector("#paidBanner");
const usageSection = document.querySelector("#usageSection");
const usageList = document.querySelector("#usageList");

// the server decides which state an API is in; this maps that decision onto
// Bootstrap's own tokens. the -bg-subtle variables are the same hue as the solid
// one, a few steps lighter, and Bootstrap redefines them for dark mode -- which
// is exactly the "track is a lighter step of the fill's own ramp" rule, already
// themed, with no CSS from us
const STATE = {
    ok: {
        fill: "var(--bs-primary)",
        track: "var(--bs-primary-bg-subtle)",
    },
    warning: {
        fill: "var(--bs-warning)",
        track: "var(--bs-warning-bg-subtle)",
        badge: "#warningBadge",
    },
    critical: {
        fill: "var(--bs-danger)",
        track: "var(--bs-danger-bg-subtle)",
        badge: "#criticalBadge",
    },
};

// a calendar date rendered in UTC -- these are dates, not instants, so using the
// local clock would slide them a day for anyone west of UTC
const monthDay = (value) =>
    new Date(value).toLocaleDateString(undefined, { timeZone: "UTC", month: "short", day: "numeric" });

const periodLabel = (start, end) => {
    if (!start || !end) return "";

    const year = new Date(end).toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric" });
    return `${monthDay(start)} – ${monthDay(end)}, ${year}`;
}

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

    document.querySelector("#nextBillDue").textContent = usage.next_bill_due
        ? monthDay(usage.next_bill_due)
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
        empty.className = "text-body-secondary mb-0";
        empty.textContent = "Your plan doesn't include any APIs yet.";
        usageList.replaceChildren(empty);
        return;
    }

    // rows are assembled off-document and attached in one go: N appends to a live
    // node means N chances to trigger layout, and this list grows with the plan
    const fragment = document.createDocumentFragment();

    for (const api of apis) {
        const state = STATE[api.state] ?? STATE.ok;

        const row = document.createElement("div");
        row.className = "mb-3";
        row.dataset.state = api.state;

        // name on the left, counts on the right, sharing a baseline
        const head = document.createElement("div");
        head.className = "d-flex justify-content-between align-items-baseline gap-2 mb-1";

        const name = document.createElement("span");
        name.className = "fw-semibold";
        name.textContent = api.api_name;

        // status is never colour alone: warning and critical carry a written
        // label and an icon, so the state survives colourblindness and greyscale
        if (state.badge) {
            const badge = document.querySelector(state.badge).content.firstElementChild.cloneNode(true);
            badge.classList.add("ms-2");
            name.append(badge);
        }

        const counts = document.createElement("span");
        counts.className = "small text-body-secondary text-nowrap";
        counts.textContent = `${formatCount(api.calls_used)} / ${formatCount(api.monthly_limit)}` +
            ` · ${formatCount(api.calls_remaining)} left`;

        const track = document.createElement("div");
        track.className = "progress";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${api.api_name} usage`);
        track.setAttribute("aria-valuenow", api.percent_used);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");
        // restyle the component by setting its own variables rather than writing
        // rules for it -- these are the two Bootstrap already uses internally
        track.style.setProperty("--bs-progress-height", ".625rem");
        track.style.setProperty("--bs-progress-bg", state.track);

        // rounded-end is a Bootstrap utility: square where the bar grows from,
        // rounded at the data end
        const bar = document.createElement("div");
        bar.className = "progress-bar rounded-end";
        bar.style.setProperty("--bs-progress-bar-bg", state.fill);
        bar.style.width = `${api.percent_used}%`;

        head.append(name, counts);
        track.append(bar);
        row.append(head, track);
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
            pickPlanPrompt.classList.remove("d-none");
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

            document.querySelector("#usagePeriod").textContent =
                periodLabel(usage.period_start, usage.next_bill_due);

            renderUsage(usage.apis);
            usageSection.classList.remove("d-none");
        }

        myPlanSection.classList.remove("d-none");
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
    paidBanner.classList.remove("d-none");

    // strip ?paid= from the address bar so a refresh doesn't re-show the banner
    history.replaceState(null, "", "/dashboard");
}

logoutBtn.addEventListener("click", async () => {
    showFormError(null);
    await logoutUser();
});

showReceiptIfJustPaid();
loadDashboard();
