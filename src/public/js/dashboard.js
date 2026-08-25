import { getJson } from "./api.js";
import { showFormError, formatCount, formatMoney, monthDay, daysBetween } from "./ui.js";

const myPlanSection = document.querySelector("#myPlanSection");
const pickPlanPrompt = document.querySelector("#pickPlanPrompt");
const paidBanner = document.querySelector("#paidBanner");
const usageSection = document.querySelector("#usageSection");
const usageList = document.querySelector("#usageList");

const WARNING_AT = 80;
const CRITICAL_AT = 100;

const percentOf = (used, limit) =>
    limit > 0 ? Math.min(Math.round((used / limit) * 100), 100) : 0;

const stateFor = (percent) =>
    percent >= CRITICAL_AT ? "critical" : percent >= WARNING_AT ? "warning" : "ok";

const daysUntil = (value) => {
    if (!value) return null;
    if (Number.isNaN(new Date(value).getTime())) return null;

    return daysBetween(new Date(), value);
};

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

const periodLabel = (start, end) => {
    if (!start || !end) return "";

    const year = new Date(end).toLocaleDateString(undefined, { timeZone: "UTC", year: "numeric" });
    return `${monthDay(start)} – ${monthDay(end)}, ${year}`;
}

const daysLabel = (days) => {
    if (days === null || days === undefined) return "";
    if (days < 0) return "overdue";
    if (days === 0) return "due today";
    if (days === 1) return "due tomorrow";
    return `in ${days} days`;
}

const toApiRow = (api) => {
    const percentUsed = percentOf(api.calls_used, api.monthly_limit);

    return {
        api_name: api.api_name,
        monthly_limit: api.monthly_limit,
        calls_used: api.calls_used,
        calls_remaining: Math.max(api.monthly_limit - api.calls_used, 0),
        percent_used: percentUsed,
        state: stateFor(percentUsed),
    };
};

const renderKpis = (data, apis) => {
    document.querySelector("#planName").textContent = data.plan ?? "—";
    document.querySelector("#planPrice").textContent = `${formatMoney(data.price)} / month`;

    document.querySelector("#nextBillDue").textContent = data.bill_due
        ? monthDay(data.bill_due)
        : "—";

    document.querySelector("#nextBillIn").textContent = daysLabel(daysUntil(data.bill_due));

    const totalCalls = apis.reduce((sum, api) => sum + api.calls_used, 0);

    document.querySelector("#totalCalls").textContent = formatCount(totalCalls);
    document.querySelector("#apiCount").textContent =
        `across ${apis.length} API${apis.length === 1 ? "" : "s"}`;
}

const renderUsage = (apis) => {
    if (apis.length === 0) {
        const empty = document.createElement("p");
        empty.className = "text-body-secondary mb-0";
        empty.textContent = "Your plan doesn't include any APIs yet.";
        usageList.replaceChildren(empty);
        return;
    }

    const fragment = document.createDocumentFragment();

    for (const api of apis) {
        const state = STATE[api.state] ?? STATE.ok;

        const row = document.createElement("div");
        row.className = "mb-3";
        row.dataset.state = api.state;

        const head = document.createElement("div");
        head.className = "d-flex justify-content-between align-items-baseline gap-2 mb-1";

        const name = document.createElement("span");
        name.className = "fw-semibold";
        name.textContent = api.api_name;

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

        track.style.setProperty("--bs-progress-height", ".625rem");
        track.style.setProperty("--bs-progress-bg", state.track);

        const bar = document.createElement("div");
        bar.className = "progress-bar rounded-end";
        bar.style.setProperty("--bs-progress-bar-bg", state.fill);
        bar.style.width = `${api.percent_used}%`;

        head.append(name, counts);
        track.append(bar);
        row.append(head, track);
        fragment.append(row);
    }

    usageList.replaceChildren(fragment);
}

async function loadDashboard() {
    try {
        const body = await getJson("/data");
        if (!body) return;

        const { dashboardData } = body;

        if (!dashboardData) {
            myPlanSection.classList.add("d-none");
            usageSection.classList.add("d-none");
            pickPlanPrompt.classList.remove("d-none");
            return;
        }

        const apis = (dashboardData.apis ?? []).map(toApiRow);

        renderKpis(dashboardData, apis);

        document.querySelector("#planSince").textContent =
            new Date(dashboardData.plan_start).toLocaleDateString();

        document.querySelector("#usagePeriod").textContent =
            periodLabel(dashboardData.bill_start, dashboardData.bill_due);

        renderUsage(apis);
    } catch (e) {
        console.error(e);
        myPlanSection.classList.add("d-none");
        usageSection.classList.add("d-none");
        showFormError("Could not load your dashboard. Please refresh.");
    }
}

const showReceiptIfJustPaid = () => {
    const paymentId = new URLSearchParams(window.location.search).get("paid");

    if (!paymentId) return;

    document.querySelector("#receiptId").textContent = paymentId;
    paidBanner.classList.remove("d-none");

    history.replaceState(null, "", "/dashboard");
}

showReceiptIfJustPaid();
loadDashboard();