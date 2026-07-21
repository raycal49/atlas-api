const planList = document.querySelector("#planList");
const paymentForm = document.querySelector("#paymentForm");
const chosenPlanName = document.querySelector("#chosenPlanName");
const submitBtn = paymentForm.querySelector('button[type="submit"]');
const formError = document.querySelector("#form-error");

// remembered when the user clicks a Choose button, sent on submit
let selectedPlan = null;

const showFieldErrors = (fieldErrors) => {
    const fields = ["card_number"];

    for (const field of fields) {
        const span = document.querySelector(`#${field}-error`);
        span.classList.toggle("invisible", !fieldErrors[field]);
    }
}

// 409s and 500s are one message for the whole form, not tied to a field
const showFormError = (message) => {
    formError.textContent = message ?? "";
    formError.classList.toggle("invisible", !message);
}

const hideAllErrors = () => {
    showFieldErrors({});
    showFormError(null);
}

const choosePlan = (planName) => {
    selectedPlan = planName;
    chosenPlanName.textContent = planName;
    hideAllErrors();
    paymentForm.classList.remove("hidden");
    paymentForm.scrollIntoView({ behavior: "smooth" });
}

// build each card with createElement/textContent so plan data is always
// treated as text, never as HTML
const renderPlans = (plans) => {
    for (const plan of plans) {
        const card = document.createElement("section");
        card.className = "card";

        const name = document.createElement("h2");
        name.textContent = plan.plan_name;

        const price = document.createElement("p");
        price.textContent = `$${plan.price_per_month} / month`;

        const description = document.createElement("p");
        description.textContent = plan.description ?? "";

        const chooseBtn = document.createElement("button");
        chooseBtn.type = "button";
        chooseBtn.textContent = "Choose";
        chooseBtn.addEventListener("click", () => choosePlan(plan.plan_name));

        card.append(name, price, description, chooseBtn);
        planList.append(card);
    }
}

async function loadPlans() {
    try {
        const response = await fetch("/plans");

        if (!response.ok) {
            showFormError("Could not load plans. Please refresh.");
            return;
        }

        const { plans } = await response.json();
        renderPlans(plans);
    } catch (e) {
        console.error(e);
        showFormError("Could not load plans. Please refresh.");
    }
}

async function payForPlan() {
    submitBtn.disabled = true;

    const body = new URLSearchParams({
        plan_name: selectedPlan,
        card_number: document.querySelector("#card_number").value,
    });

    try {
        const response = await fetch("/subscriptions", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });

        if (response.status === 201) {
            const { paymentId } = await response.json();
            // dashboard shows the receipt banner when it sees ?paid=
            window.location.href = "/dashboard?paid=" + paymentId;
            return;
        }

        if (response.status === 401) {
            // not logged in (or session expired) -- payment needs an account
            window.location.href = "/login.html";
            return;
        }

        const responseBody = await response.json();

        if (response.status === 400 && responseBody.status === "fail") {
            showFieldErrors(responseBody.errors);
            return;
        }

        // domain errors (already subscribed, unknown plan) arrive as a plain
        // JSON string -- show the server's own message
        if (response.status === 409 || response.status === 400) {
            showFormError(responseBody);
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
    hideAllErrors();
    await payForPlan();
});

// stale errors disappear as soon as the user starts fixing their input
paymentForm.addEventListener("input", hideAllErrors);

loadPlans();
