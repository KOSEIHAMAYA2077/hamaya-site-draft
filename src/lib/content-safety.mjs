/**
 * Shared validation for values that can become navigation or image attributes.
 * URL parsing alone silently normalizes whitespace, backslashes and credentials.
 * @param {unknown} value
 */
export function validHttpsUrl(value) {
  if (
    typeof value !== 'string' ||
    /[\s\u0000-\u001f\u007f-\u009f\\]/u.test(value) ||
    !/^https:\/\//i.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      Boolean(url.hostname) &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

/** Public, owner-approved raster files only; never a source-file import.
 * @param {unknown} value A path relative to public/.
 */
export function validImagePath(value) {
  return (
    typeof value === 'string' &&
    /^images\/[a-zA-Z0-9_./-]+\.(?:png|jpe?g|webp|gif|avif)$/i.test(value) &&
    value
      .split('/')
      .every((segment) => segment && segment !== '.' && segment !== '..')
  );
}

/** @param {unknown} value */
export function validMarkdownLink(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    /[\s\u0000-\u001f\u007f-\u009f\\<>"`]/u.test(value)
  )
    return false;
  if (/^https:/i.test(value)) return validHttpsUrl(value);
  if (value.startsWith('//') || /^[^/?#]*:/.test(value)) return false;
  try {
    return (
      new URL(value, 'https://content.invalid/').origin ===
      'https://content.invalid'
    );
  } catch {
    return false;
  }
}

/** @param {unknown} value @param {string} [base] */
export function validMarkdownImage(value, base = '/') {
  if (typeof value !== 'string' || !value.startsWith('/')) return false;
  const prefix = `/${base.replace(/^\/+|\/+$/g, '')}`;
  const relative =
    prefix !== '/' && value.startsWith(`${prefix}/`)
      ? value.slice(prefix.length + 1)
      : value.slice(1);
  return validImagePath(relative);
}
