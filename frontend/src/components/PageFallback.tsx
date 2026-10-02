/**
 * Shown while a lazily-loaded page chunk is still downloading.
 *
 * Deliberately not a spinner-only widget: it announces itself with
 * role="status" and a translated label, so a screen reader is told the page is
 * loading instead of landing on an empty document. Offline (the field case for
 * this app) a chunk that cannot be fetched would otherwise leave a blank screen
 * with no explanation at all.
 */
export function PageFallback() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="min-h-[50vh] flex flex-col items-center justify-center gap-3 px-6 text-center"
    >
      <div
        aria-hidden="true"
        className="h-8 w-8 rounded-full border-3 border-neutral-300 border-t-primary-600 animate-spin"
      />
      <p className="text-sm text-neutral-600 dark:text-neutral-400">Loading…</p>
    </div>
  );
}