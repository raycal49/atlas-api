import { getJson } from "./api.js";
import { showFormError, formatCount } from "./ui.js";

const logTableWrap = document.querySelector("#logTableWrap");
const logBody = document.querySelector("#logBody");
const noCalls = document.querySelector("#noCalls");
const loadMoreBtn = document.querySelector("#loadMore");
const loadedCount = document.querySelector("#loadedCount");

const PAGE_SIZE = 50;

// the id to page below on the next request. null once the server says there is
// nothing further, which is what hides the button
let nextBefore = null;

// used_at is a real instant, so the local clock is the right thing to show it in
const timestamp = (value) => new Date(value).toLocaleString();

// one row per call, built with createElement/textContent so api names are always
// treated as text and never as HTML
const renderCalls = (calls) => {
    const fragment = document.createDocumentFragment();

    for (const call of calls) {
        const row = document.createElement("tr");

        const when = document.createElement("td");
        when.className = "text-nowrap";
        when.textContent = timestamp(call.used_at);

        const api = document.createElement("td");
        api.textContent = call.api_name;

        row.append(when, api);
        fragment.append(row);
    }

    // replaceChildren so a page swaps the rows rather than doubling them -- and it
    // is what clears the skeleton rows the markup ships with
    logBody.replaceChildren(fragment);
}

async function loadPage() {
    loadMoreBtn.disabled = true;

    try {
        // `before` is a bigint id kept as a string the whole way -- turning it
        // into a JS number could round it and start skipping rows
        const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
        if (nextBefore) query.set("before", nextBefore);

        const data = await getJson(`/usage/log?${query}`);

        // a null means getJson saw a 401 and the browser is already navigating
        // to the login page -- there is nothing left to render
        if (!data) return;

        const { calls, next_before } = data.log;

        if (calls.length === 0) {
            logTableWrap.classList.add("d-none");
            noCalls.classList.remove("d-none");
            return;
        }

        renderCalls(calls);
        loadedCount.textContent = `Showing ${formatCount(calls.length)} call${calls.length === 1 ? "" : "s"}`;

        nextBefore = next_before;
        loadMoreBtn.classList.toggle("d-none", !nextBefore);
    } catch (e) {
        console.error(e);
        // clear the skeletons -- a shimmer that never resolves reads as a hang
        logTableWrap.classList.add("d-none");
        showFormError("Could not load your call log. Please refresh.");
    } finally {
        loadMoreBtn.disabled = false;
    }
}

loadMoreBtn.addEventListener("click", () => {
    showFormError(null);
    loadPage();
});

loadPage();
