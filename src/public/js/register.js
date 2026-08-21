import { postForm } from "./api.js";
import { showFormError, showFieldErrors, hideErrors } from "./ui.js";

const form = document.querySelector("#userinfo");
const submitBtn = form.querySelector('button[type="submit"]');
const confirmError = document.querySelector("#confirm_password-error");
const FIELDS = ["username", "email", "password"];

const passwordsMatch = () => {
    const password = document.querySelector("#password").value;
    const confirm  = document.querySelector("#confirm_password").value;
    const ok = password === confirm;
    confirmError.classList.toggle("invisible", ok);  // show the error only when they differ
    return ok;
}

async function registerUser() {
    submitBtn.disabled = true;

    try {
        const { ok, status, body } = await postForm("/auth/register", new FormData(form));

        if (ok) {
            window.location.href = '/dashboard';
            return;
        }

        if (status === 400 && body?.status === "fail") {
            showFieldErrors(FIELDS, body.errors);
            return;
        }

        if (status === 409) {
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

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideErrors(FIELDS);
    if (!passwordsMatch()) return;
    await registerUser();
});

form.addEventListener("input", () => hideErrors(FIELDS));
