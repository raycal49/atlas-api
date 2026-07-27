import { postForm } from "./api.js";
import { showFormError, showFieldErrors, hideErrors } from "./ui.js";

const form = document.querySelector("#userinfo");
const submitBtn = form.querySelector('button[type="submit"]');

// the inputs this form can get per-field errors back for
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
            // deliberately vague -- never say which of the two was wrong
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

// stale errors disappear as soon as the user starts fixing their input
form.addEventListener("input", () => hideErrors(FIELDS));
