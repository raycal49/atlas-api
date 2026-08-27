import { getJson } from "./api.js";
import { showFormError } from "./ui.js";

const filtersForm = document.querySelector("#filters");
const apiSelect = document.querySelector("#api");
const fromInput = document.querySelector("#from");
const toInput = document.querySelector("#to");
const logTableWrap = document.querySelector("#logTableWrap");
const logBody = document.querySelector("#logBody");
const noCalls = document.querySelector("#noCalls");
const loadMore = document.querySelector("#loadMore");
const pageStatus = document.querySelector("#pageStatus");

const params = new URLSearchParams(location.search);

params.delete("page");
params.delete("limit");
params.delete("cursor_at");
params.delete("cursor_id");

let cursor = null;
let loading = false;
let loadedCount = 0;

const when = (value) => new Date(value).toLocaleString();

const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const localDayBoundary = (isoDate, dayOffset) => {
    if (!DATE_SHAPE.test(isoDate))
        return isoDate;
    
    const [year, month, day] = isoDate.split("-").map(Number);
    return new Date(year, month - 1, day + dayOffset).toISOString();
};

filtersForm.addEventListener("formdata", (event) => {
    for (const [name, value] of [...event.formData]) {
        if (value === "") event.formData.delete(name);
    }
});

const fillApiOptions = (apis) => {
    for (const api of apis) {
        const option = document.createElement("option");
        option.value = String(api.api_product_id);
        option.textContent = api.api_name;
        apiSelect.append(option);
    }
};

const syncDateBounds = () => {
    toInput.min = fromInput.value;
    fromInput.max = toInput.value;
};

fromInput.addEventListener("input", syncDateBounds);
toInput.addEventListener("input", syncDateBounds);

const restoreFilters = () => {
    apiSelect.value = params.get("api_product_id") ?? "";
    fromInput.value = params.get("from") ?? "";
    toInput.value = params.get("to") ?? "";
    syncDateBounds();
};

const renderCalls = (calls, replace) => {
    const fragment = document.createDocumentFragment();

    for (const call of calls) {
        const row = document.createElement("tr");

        const whenCell = document.createElement("td");
        whenCell.className = "text-nowrap";
        whenCell.textContent = when(call.used_at);

        const apiCell = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = "badge text-bg-secondary";
        badge.textContent = call.api_name;
        apiCell.append(badge);

        row.append(whenCell, apiCell);
        fragment.append(row);
    }

    if (replace) logBody.replaceChildren(fragment);
    else logBody.append(fragment);
};

const logUrl = () => {
    const query = new URLSearchParams(params);

    const from = params.get("from");
    const to = params.get("to");

    if (from) query.set("from", localDayBoundary(from, 0));
    if (to) query.set("to", localDayBoundary(to, 1));

    if (cursor) {
        query.set("cursor_at", cursor.at);
        query.set("cursor_id", cursor.id);
    }

    return `/usage/log?${query}`;
};

const describeLoaded = () => {
    const plural = loadedCount === 1 ? "" : "s";
    const scope = cursor ? "Showing" : "Showing all";
    return `${scope} ${loadedCount.toLocaleString()} call${plural}`;
};

const applyPage = (log, replace) => {
    renderCalls(log.calls, replace);

    loadedCount += log.calls.length;
    cursor = log.next_cursor;

    loadMore.classList.toggle("d-none", !cursor);
    pageStatus.textContent = describeLoaded();
};

const showEmptyLog = () => {
    logTableWrap.classList.add("d-none");
    noCalls.classList.remove("d-none");
    loadMore.classList.add("d-none");
    pageStatus.textContent = "";
};

const startRequest = () => {
    loading = true;
    loadMore.disabled = true;
    loadMore.textContent = "Loading\u2026";
};

const endRequest = () => {
    loading = false;
    loadMore.disabled = false;
    loadMore.textContent = "Load more";
};

async function init() {
    try {
        const [apisData, logData] = await Promise.all([
            getJson("/usage/apis"),
            getJson(logUrl()),
        ]);

        if (!apisData || !logData) return;

        fillApiOptions(apisData.apis);
        restoreFilters();

        if (logData.log.calls.length === 0) {
            showEmptyLog();
            return;
        }

        applyPage(logData.log, true);
    } catch (e) {
        console.error(e);
        logTableWrap.classList.add("d-none");
        showFormError("Could not load your call log. Please refresh.");
    }
}

async function loadNextPage() {
    if (loading || !cursor) return;

    startRequest();

    try {
        const logData = await getJson(logUrl());

        if (!logData) return;

        showFormError(null);
        applyPage(logData.log, false);
    } catch (e) {
        console.error(e);
        showFormError("Could not load more calls. Please try again.");
    } finally {
        endRequest();
    }
}

loadMore.addEventListener("click", loadNextPage);

init();
