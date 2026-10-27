// Prefix a site-internal path with the configured `base` (currently "/", since the site
// is served from perocho.com). Handles BASE_URL with or without a trailing slash.
export function withBase(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${base}/${path.replace(/^\//, "")}`;
}
