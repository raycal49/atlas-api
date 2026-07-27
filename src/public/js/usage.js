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
let loaded = 0;

// used_at is a real instant, so the local clock is the right thing to show it in
const timestamp = (value) => new Date(value).toLocaleString();

// appends rather than replaces: each page adds to the log rather than swapping
// it, which is the one place a render is deliberately additive
const appendCalls = (calls) => {
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

    logBody.append(fragment);
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

        if (calls.length === 0 && loaded === 0) {
            logTableWrap.classList.add("d-none");
            noCalls.classList.remove("d-none");
            return;
        }

        // this page appends rather than replaces, so the skeleton rows the markup
        // ships with have to be cleared explicitly before the first real page
        if (loaded === 0) logBody.replaceChildren();

        appendCalls(calls);
        loaded += calls.length;
        loadedCount.textContent = `Showing ${formatCount(loaded)} call${loaded === 1 ? "" : "s"}`;

        nextBefore = next_before;
        loadMoreBtn.classList.toggle("d-none", !nextBefore);
    } catch (e) {
        console.error(e);
        // clear the skeletons -- a shimmer that never resolves reads as a hang
        if (loaded === 0) logTableWrap.classList.add("d-none");
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
