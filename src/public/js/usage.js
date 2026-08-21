import { getJson } from "./api.js";
import { showFormError } from "./ui.js";

const filtersForm = document.querySelector("#filters");
const apiSelect = document.querySelector("#api");
const fromInput = document.querySelector("#from");
const toInput = document.querySelector("#to");
const logTableWrap = document.querySelector("#logTableWrap");
const logBody = document.querySelector("#logBody");
const noCalls = document.querySelector("#noCalls");
const pager = document.querySelector("#pager");
const pageStatus = document.querySelector("#pageStatus");

const params = new URLSearchParams(location.search);

const pageHref = (page) => {
    const next = new URLSearchParams(params);
    next.set("page", String(page));
    return `/usage?${next}`;
};

const when = (value) => new Date(value).toLocaleString();

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
    apiSelect.value = params.get("api") ?? "";
    fromInput.value = params.get("from") ?? "";
    toInput.value = params.get("to") ?? "";
    syncDateBounds();
};

const renderCalls = (calls) => {
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

    logBody.replaceChildren(fragment);
};

const pageItem = (content, { href = null, current = false, disabled = false } = {}) => {
    const item = document.createElement("li");
    item.className = "page-item";
    if (current) item.classList.add("active");
    if (disabled) item.classList.add("disabled");

    const link = document.createElement(href && !disabled ? "a" : "span");
    link.className = "page-link";
    link.textContent = content;
    if (href && !disabled) link.href = href;
    if (current) item.setAttribute("aria-current", "page");

    item.append(link);
    return item;
};

const windowPages = (page, pageCount) => {
    const start = Math.max(1, Math.min(page - 2, pageCount - 4));
    const end = Math.min(pageCount, start + 4);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
};

const renderPager = (page, pageCount) => {
    if (pageCount <= 1) {
        pager.classList.add("d-none");
        return;
    }

    const items = [
        pageItem("Previous", { href: pageHref(page - 1), disabled: page === 1 }),
        ...windowPages(page, pageCount).map((n) =>
            pageItem(String(n), { href: pageHref(n), current: n === page })),
        pageItem("Next", { href: pageHref(page + 1), disabled: page === pageCount }),
    ];

    pager.replaceChildren(...items);
    pager.classList.remove("d-none");
};

async function loadPage() {
    try {
        const [apisData, logData] = await Promise.all([
            getJson("/usage/apis"),
            getJson(`/usage/log?${params}`),
        ]);

        if (!apisData || !logData)
            return;

        fillApiOptions(apisData.apis);
        restoreFilters();

        const { calls, total, page, page_count, capped } = logData.log;

        if (total === 0) {
            logTableWrap.classList.add("d-none");
            noCalls.classList.remove("d-none");
            pageStatus.textContent = "";
            return;
        }

        if (page > page_count) {
            logTableWrap.classList.add("d-none");
            pageStatus.replaceChildren("This page is out of range. ");
            const back = document.createElement("a");
            back.href = pageHref(1);
            back.textContent = "Go to page 1";
            pageStatus.append(back);
            return;
        }

        renderCalls(calls);
        pageStatus.textContent =
            `Page ${page} of ${page_count} · ${total.toLocaleString()} call${total === 1 ? "" : "s"}`;
        if (capped) {
            pageStatus.textContent +=
                ` — showing the most recent ${page_count} pages; narrow with filters to see older calls`;
        }
        renderPager(page, page_count);
    } catch (e) {
        console.error(e);
        logTableWrap.classList.add("d-none");
        showFormError("Could not load your call log. Please refresh.");
    }
}

loadPage();
