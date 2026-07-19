const form = document.querySelector("#userinfo");
const submitBtn = form.querySelector('button[type="submit"]');
const formError = document.querySelector("#form-error");

const showFieldErrors = (fieldErrors) => {
    const fields = ["username", "password"];

    for (const field of fields) {
        const span = document.querySelector(`#${field}-error`);
        span.classList.toggle("invisible", !fieldErrors[field]);
    }
}

// 401s and 500s are one message for the whole form, not tied to a field
const showFormError = (message) => {
    formError.textContent = message ?? "";
    formError.classList.toggle("invisible", !message);
}

const hideAllErrors = () => {
    showFieldErrors({});
    showFormError(null);
}

async function loginUser() {
    submitBtn.disabled = true;

    const body = new URLSearchParams(new FormData(form));

    try {
        const response = await fetch("/auth/login", {
            method: form.method,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });

        if (response.ok) {
            window.location.href = './protected/dashboard.html';
            return;
        }

        const responseBody = await response.json();

        console.log("The result of the server-side validation is: " + JSON.stringify(responseBody, null, 2));

        if (response.status === 400 && responseBody.status === "fail") {
            showFieldErrors(responseBody.errors);
            return;
        }

        if (response.status === 401) {
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
    hideAllErrors();
    await loginUser();
});

// stale errors disappear as soon as the user starts fixing their input
form.addEventListener("input", hideAllErrors);
