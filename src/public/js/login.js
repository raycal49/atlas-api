import { postForm } from "./api.js";
import { showFormError, showFieldErrors, hideErrors } from "./ui.js";

const form = document.querySelector("#userinfo");
const submitBtn = form.querySelector('button[type="submit"]');
const FIELDS = ["username", "password"];

async function loginUser() {
    submitBtn.disabled = true;

    try {
        const { ok, status, body } = await postForm("/auth/login", new FormData(form));

        if (ok) {
            window.location.href = '/dashboard';
            return;
        }

        if (status === 400 && body?.status === "fail") {
            showFieldErrors(FIELDS, body.errors);
            return;
        }

        if (status === 401) {
            showFormError("Invalid username or password");
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

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideErrors(FIELDS);
    await loginUser();
});

form.addEventListener("input", () => hideErrors(FIELDS));
