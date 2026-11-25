/**
PR previews of the site run on `pr-<N>-<worker>.<subdomain>.workers.dev` (`build.yml`, job "Site
preview") and call this API from there. `PREVIEW_HOST_SUFFIX` (`-hse-lecture-notes.nalinor.workers.dev`)
names the preview Worker: only its numbered aliases pass, not any workers.dev page.
*/
const PREVIEW_LABEL = /^pr-\d{1,6}$/u;

export function isPreviewHost(host: string, suffix: string | undefined): boolean {
  if (!suffix) return false;
  const lower = host.toLowerCase();
  if (!lower.endsWith(suffix.toLowerCase())) return false;
  return PREVIEW_LABEL.test(lower.slice(0, lower.length - suffix.length));
}

export function isPreviewOrigin(origin: string, suffix: string | undefined): boolean {
  if (!origin.startsWith("https://")) return false;
  return isPreviewHost(origin.slice("https://".length), suffix);
}
