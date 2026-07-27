// The one place that knows what an expired session looks like. Every page that
// reads data goes through here, so the redirect rule is written once instead of
// once per page.

// GET JSON from a protected endpoint.
//   null    -- not signed in; the browser is already on its way to the login page
//   throws  -- server trouble; callers catch and show a message
export const getJson = async (url) => {
  const response = await fetch(url);

  if (response.status === 401) {
    window.location.href = "/login.html";
    return null;
  }

  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);

  return response.json();
};

// POST a form and hand back the status plus the parsed body, so each page can
// decide what its own 400s and 409s mean. The auth pages deliberately do NOT use
// getJson: a 401 from /auth/login means "wrong password", not "session expired",
// and must not turn into a redirect.
export const postForm = async (url, fields) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });

  // domain errors serialize as a bare JSON string, validation failures as an
  // object -- callers branch on status to know which they have
  const body = await response.json().catch(() => null);

  return { ok: response.ok, status: response.status, body };
};
