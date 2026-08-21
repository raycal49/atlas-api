import { getJson, postForm } from "./api.js";
import { showFormError, showFieldErrors, hideErrors } from "./ui.js";

const planList = document.querySelector("#planList");
const paymentForm = document.querySelector("#paymentForm");
const chosenPlanName = document.querySelector("#chosenPlanName");
const submitBtn = paymentForm.querySelector('button[type="submit"]');
const FIELDS = ["card_number"];

let selectedPlan = null;

const choosePlan = (planName) => {
    selectedPlan = planName;
    chosenPlanName.textContent = planName;
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

loadPlans();
