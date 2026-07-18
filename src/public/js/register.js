const form = document.querySelector("#userinfo");
const submitBtn = form.querySelector('button[type="submit"]');

const showFieldErrors = (fieldErrors) => {
    const fields = ["username", "email", "password"];

    for (const field of fields) {
        const span = document.querySelector(`#${field}-error`);
        span.classList.toggle("invisible", !fieldErrors[field]);
    }
}

async function registerUser() {
    submitBtn.disabled = true;

    const body = new URLSearchParams(new FormData(form));

        try {
        const response = await fetch("/auth/register", {
            method: form.method,
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body,
        });

        const responseBody = await response.json();

        console.log("The result of the server-side validation is: " + JSON.stringify(responseBody, null, 2));
        // console.log("The result of the server-side validation is: " + JSON.stringify(responseBody.errors.password, null, 2));
        console.log("Has the server-side validation failed? The answer is: " + (responseBody.status === "fail"));

        if (responseBody.status === "fail") {
            showFieldErrors(responseBody.errors);
            return;
        }
        
        window.location.href = '/dashboard.html'
    } catch (e) {
        console.error(e);
    } finally {
        submitBtn.disabled = false;
    }
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await registerUser();
});