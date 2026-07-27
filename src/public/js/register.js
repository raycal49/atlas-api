import { postForm } from "./api.js";
import { showFormError, showFieldErrors, hideErrors } from "./ui.js";

const form = document.querySelector("#userinfo");
const submitBtn = form.querySelector('button[type="submit"]');
const confirmError = document.querySelector("#confirm_password-error");

// the inputs the server can send per-field errors back for. confirm_password is
// checked here in the browser only, so it is not in this list
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

        // check success FIRST. this used to fall through to the redirect on any
        // response that wasn't a validation failure, so a taken username sent the
        // browser to /dashboard, which bounced it to the login page with no
        // explanation at all
        if (ok) {
            window.location.href = '/dashboard';
            return;
        }

        if (status === 400 && body?.status === "fail") {
            showFieldErrors(FIELDS, body.errors);
            return;
        }

        // a taken username or email arrives as a bare JSON string -- show the
        // server's own wording
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

// stale errors disappear as soon as the user starts fixing their input
form.addEventListener("input", () => hideErrors(FIELDS));
