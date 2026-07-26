const logoutBtn = document.querySelector("#logout-button");
const formError = document.querySelector("#form-error");
const myPlanSection = document.querySelector("#myPlanSection");
const pickPlanPrompt = document.querySelector("#pickPlanPrompt");
const paidBanner = document.querySelector("#paidBanner");
const usageSection = document.querySelector("#usageSection");
const usageList = document.querySelector("#usageList");

const showFormError = (message) => {
    formError.textContent = message ?? "";
    formError.classList.toggle("invisible", !message);
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

// one row per API in the plan: name, the used/limit counts, and a bar so the
// state is readable without reading the numbers. built with
// createElement/textContent so api names are always treated as text, never HTML
const renderUsage = (apis) => {
    if (apis.length === 0) {
        const empty = document.createElement("p");
        empty.className = "text-muted mb-0";
        empty.textContent = "Your plan doesn't include any APIs yet.";
        usageList.append(empty);
        return;
    }

    for (const api of apis) {
        const row = document.createElement("div");
        row.className = "mb-3";

        const name = document.createElement("p");
        name.className = "mb-1 fw-semibold";
        name.textContent = api.api_name;

        const counts = document.createElement("p");
        counts.className = "mb-1 small text-muted";
        counts.textContent =
            `${api.calls_used} / ${api.monthly_limit} calls used — ${api.calls_remaining} left`;

        // capped at 100 so a maxed-out API can't overflow its track
        const percent = api.monthly_limit > 0
            ? Math.min(Math.round((api.calls_used / api.monthly_limit) * 100), 100)
            : 0;

        const track = document.createElement("div");
        track.className = "progress";
        track.setAttribute("role", "progressbar");
        track.setAttribute("aria-label", `${api.api_name} usage`);
        track.setAttribute("aria-valuenow", percent);
        track.setAttribute("aria-valuemin", "0");
        track.setAttribute("aria-valuemax", "100");

        const bar = document.createElement("div");
        bar.className = "progress-bar";
        if (percent >= 100) bar.classList.add("bg-danger");
        else if (percent >= 80) bar.classList.add("bg-warning");
        bar.style.width = `${percent}%`;

        track.append(bar);
        row.append(name, counts, track);
        usageList.append(row);
    }
}

// the dashboard never assumes how you got here -- it asks the server what is
// true right now and renders exactly one of its two states
// dashboard has two hidden segments--the "my plan" section and the "plan picker" section
// it unhides whichever section based off whether or not you have a plan or not
async function loadDashboard() {
    try {
        const [subResponse, plansResponse, usageResponse] = await Promise.all([
            fetch("/subscriptions/me"),
            fetch("/plans"),
            fetch("/usage/me"),
        ]);

        // if we have an auth error, redirect to login.html
        if (subResponse.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        // if we, for whatever reason, just don't get any HTTP success codes, then just show generic error and
        // stop loading the dashboard
        if (!subResponse.ok || !plansResponse.ok || !usageResponse.ok) {
            showFormError("Could not load your dashboard. Please refresh.");
            return;
        }

        const { subscription } = await subResponse.json();
        const { plans } = await plansResponse.json();
        const { usage } = await usageResponse.json();

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

        document.querySelector("#planName").textContent = plan?.plan_name ?? "(plan no longer offered)";
        document.querySelector("#planPrice").textContent = plan ? `$${plan.price_per_month} / month` : "";
        document.querySelector("#planSince").textContent =
            new Date(subscription.started_at).toLocaleDateString();

        myPlanSection.classList.remove("hidden");

        // usage is non-null whenever a subscription is, but guard anyway so a
        // surprise here can't blank out the plan details we just rendered
        if (usage) {
            // next_bill_due is a date, not an instant -- rendering it in UTC
            // stops it slipping to the previous day for users west of UTC
            document.querySelector("#nextBillDue").textContent = usage.next_bill_due
                ? new Date(usage.next_bill_due).toLocaleDateString(undefined, { timeZone: "UTC" })
                : "—";

            renderUsage(usage.apis);
            usageSection.classList.remove("hidden");
        }
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
