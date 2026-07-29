import { getJson } from "./api.js";
import { showFormError, formatCount } from "./ui.js";

const logTableWrap = document.querySelector("#logTableWrap");
const logBody = document.querySelector("#logBody");
const noCalls = document.querySelector("#noCalls");
const pager = document.querySelector("#pager");
const prevItem = document.querySelector("#prevItem");
const prevPage = document.querySelector("#prevPage");
const nextItem = document.querySelector("#nextItem");
const nextPage = document.querySelector("#nextPage");
const pageStatus = document.querySelector("#pageStatus");

const PAGE_SIZE = 25;

// cursors[i] is the `before` value that produced page i. Page 0 is the newest
// page and needs no cursor, hence null. Kept as an array rather than a single
// "previous" value so a visited-page jump list stays cheap to add later.
//
// Stored cursors cannot go stale here: api_usage is append-only and we page
// api_usage_id DESC, so new rows can only ever appear above page 0 -- a cursor
// returns the same rows on every revisit.
const cursors = [null];
let pageIndex = 0;

// the id to page below on the next request. null once the server says there is
// nothing further, which is what disables Next
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

// both buttons are derived from state rather than blanket re-enabled, so page 1
// cannot be left with a live Previous. .disabled on the <li> is what Bootstrap
// styles; the property on the <button> is what actually blocks the click and
// tells a screen reader
const setPagerState = () => {
    prevItem.classList.toggle("disabled", pageIndex === 0);
    prevPage.disabled = pageIndex === 0;
    nextItem.classList.toggle("disabled", !nextBefore);
    nextPage.disabled = !nextBefore;
}

// moveFocus only on a pager click: the click replaces everything below the
// button, so focus follows the rows into the scroll region rather than sitting
// on a button whose surroundings silently changed. On first load there is no
// focus to move, and taking it would be rude
async function loadPage(moveFocus = false) {
    prevPage.disabled = true;
    nextPage.disabled = true;

    try {
        // `before` is a bigint id kept as a string the whole way -- turning it
        // into a JS number could round it and start skipping rows
        const query = new URLSearchParams({ limit: String(PAGE_SIZE) });
        const before = cursors[pageIndex];
        if (before) query.set("before", before);

        const data = await getJson(`/usage/log?${query}`);

        // a null means getJson saw a 401 and the browser is already navigating
        // to the login page -- there is nothing left to render
        if (!data) return;

        const { calls, next_before } = data.log;
        nextBefore = next_before;

        if (calls.length === 0 && pageIndex === 0) {
            logTableWrap.classList.add("d-none");
            pager.classList.add("d-none");
            noCalls.classList.remove("d-none");
            return;
        }

        // an empty page past the first should not happen on an append-only table,
        // but if it does, keep the rows that are there rather than blanking the
        // card -- setPagerState leaves Previous live to get back out of it
        if (calls.length > 0) renderCalls(calls);

        pageStatus.textContent =
            `Page ${pageIndex + 1} · ${formatCount(calls.length)} call${calls.length === 1 ? "" : "s"}`;

        // a single page of results needs no pager at all
        pager.classList.toggle("d-none", pageIndex === 0 && !nextBefore);

        if (moveFocus) logTableWrap.focus();
    } catch (e) {
        console.error(e);
        // clear the skeletons -- a shimmer that never resolves reads as a hang
        logTableWrap.classList.add("d-none");
        pager.classList.add("d-none");
        showFormError("Could not load your call log. Please refresh.");
    } finally {
        setPagerState();
    }
}

prevPage.addEventListener("click", () => {
    if (pageIndex === 0) return;

    showFormError(null);
    pageIndex -= 1;
    // the cursor for this page is already on the stack, so going back is a plain
    // re-fetch: no reverse sort, nothing asked of the server
    loadPage(true);
});

nextPage.addEventListener("click", () => {
    if (!nextBefore) return;

    showFormError(null);
    cursors[pageIndex + 1] = nextBefore;
    pageIndex += 1;
    loadPage(true);
});

loadPage();
