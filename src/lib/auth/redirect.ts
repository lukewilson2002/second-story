const PLACEHOLDER_ORIGIN = "http://second-story.invalid";

/**
 * Returns the path to open after login, or "/" if `next` could leave the site.
 *
 * `next` comes from the URL, so anyone can send a login link with any value in it.
 * Browsers drop tabs and newlines from a URL and read "\" as "/". So "/\t/evil.example" opens "//evil.example", another site.
 * If `next` holds a control character or a backslash, it is refused.
 * If it does not resolve to a path on this site, it is refused.
 * The result is rebuilt from the parsed path, query and hash, never passed through as typed.
 */
export function safeNextPath(next: string | undefined | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (/[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  let url: URL;
  try {
    url = new URL(next, PLACEHOLDER_ORIGIN);
  } catch {
    return "/";
  }
  if (url.origin !== PLACEHOLDER_ORIGIN) return "/";
  // "/./" and "/../" segments are already resolved, so a path that still starts with "//" is another host.
  if (url.pathname.startsWith("//")) return "/";
  return `${url.pathname}${url.search}${url.hash}`;
}
