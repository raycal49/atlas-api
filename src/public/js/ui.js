// Error display shared by every page. Each page used to carry its own byte-for-byte
// copy of these; the only thing that actually differed was which fields a form has,
// so that became a parameter.

// form-level errors: wrong credentials, a 409, server trouble. Every page names
// this span #form-error, so it is looked up here rather than passed in.
export const showFormError = (message) => {
  const span = document.querySelector("#form-error");
  if (!span) return;

  span.textContent = message ?? "";
  span.classList.toggle("invisible", !message);
};

// per-field validation errors. `fields` is the page's own list of input names;
// each one has a matching #<field>-error span holding the message already
export const showFieldErrors = (fields, errors = {}) => {
  for (const field of fields) {
    const span = document.querySelector(`#${field}-error`);
    if (span) span.classList.toggle("invisible", !errors[field]);
  }
};

// clears both kinds at once -- what every form calls before a submit, and again
// as soon as the user starts fixing their input
export const hideErrors = (fields) => {
  showFieldErrors(fields, {});
  showFormError(null);
};
