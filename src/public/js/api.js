export const getJson = async (url) => {
  const response = await fetch(url);

  if (response.status === 401) {
    window.location.href = "/login.html";
    return null;
  }

  if (!response.ok) throw new Error(`${url} failed with ${response.status}`);

  return response.json();
};

export const postForm = async (url, fields) => {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });

  const body = await response.json().catch(() => null);

  return { ok: response.ok, status: response.status, body };
};
