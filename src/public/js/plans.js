import { getJson, postForm } from "./api.js";
import { showFormError, showFieldErrors, hideErrors } from "./ui.js";

const planList = document.querySelector("#planList");
const paymentForm = document.querySelector("#paymentForm");
const chosenPlanName = document.querySelector("#chosenPlanName");
const submitBtn = paymentForm.querySelector('button[type="submit"]');

// the inputs this page can get per-field errors back for
const FIELDS = ["card_number"];

// remembered when the user clicks a Choose button, sent on submit
let selectedPlan = null;

const choosePlan = (planName) => {
    selectedPlan = planName;
    chosenPlanName.textContent = planName;
    hideErrors(FIELDS);
    paymentForm.classList.remove("d-none");
    paymentForm.scrollIntoView({ behavior: "smooth" });
}

// build each card with createElement/textContent so plan data is always
// treated as text, never as HTML
const renderPlans = (plans) => {
    const fragment = document.createDocumentFragment();

    for (const plan of plans) {
        // Bootstrap card grid: each plan is a column with a card inside
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

        // both are built; the CSS in style.css drops whichever does not match the
        // visitor. a signed-out visitor never gets a path to the card field
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

    // replaceChildren so a re-render swaps the list rather than doubling it
    planList.replaceChildren(fragment);
}

async function loadPlans() {
    try {
        const data = await getJson("/plans");
        if (!data) return;

        renderPlans(data.plans);
    } catch (e) {
        console.error(e);
        showFormError("Could not load plans. Please refresh.");
    }
}

async function payForPlan() {
    submitBtn.disabled = true;

    try {
        const { ok, status, body } = await postForm("/subscriptions", {
            plan_name: selectedPlan,
            card_number: document.querySelector("#card_number").value,
        });

        if (ok) {
            // dashboard shows the receipt banner when it sees ?paid=
            window.location.href = "/dashboard?paid=" + body.paymentId;
            return;
        }

        if (status === 401) {
            // not logged in (or session expired) -- payment needs an account
            window.location.href = "/login.html";
            return;
        }

        if (status === 400 && body?.status === "fail") {
            showFieldErrors(FIELDS, body.errors);
            return;
        }

        // domain errors (already subscribed, unknown plan) arrive as a plain
        // JSON string -- show the server's own message
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

// stale errors disappear as soon as the user starts fixing their input
paymentForm.addEventListener("input", () => hideErrors(FIELDS));

loadPlans();
