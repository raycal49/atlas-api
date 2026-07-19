const logoutBtn = document.querySelector("#logout-button");
const formError = document.querySelector("#form-error");

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

logoutBtn.addEventListener("click", async () => {
    showFormError(null);
    await logoutUser();
});
