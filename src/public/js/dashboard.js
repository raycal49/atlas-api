const logoutBtn = document.querySelector("#logout-button");
const formError = document.querySelector("#form-error");
const myPlanSection = document.querySelector("#myPlanSection");
const pickPlanPrompt = document.querySelector("#pickPlanPrompt");
const paidBanner = document.querySelector("#paidBanner");

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

// the dashboard never assumes how you got here -- it asks the server what is
// true right now and renders exactly one of its two states
// dashboard has two hidden segments--the "my plan" section and the "plan picker" section
// it unhides whichever section based off whether or not you have a plan or not
async function loadDashboard() {
    try {
        const [subResponse, plansResponse] = await Promise.all([
            fetch("/subscriptions/me"),
            fetch("/plans"),
        ]);

        // if we have an auth error, redirect to login.html
        if (subResponse.status === 401) {
            window.location.href = "/login.html";
            return;
        }

        // if we, for whatever reason, just don't get any HTTP success codes, then just show generic error and
        // stop loading the dashboard
        if (!subResponse.ok || !plansResponse.ok) {
            showFormError("Could not load your dashboard. Please refresh.");
            return;
        }

        const { subscription } = await subResponse.json();
        const { plans } = await plansResponse.json();

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
