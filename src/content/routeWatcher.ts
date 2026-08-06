export type RouteCallback = (pathname: string) => void;

export const ROUTE_CHANGE_EVENT = "nullfeed:route-change";

const FALLBACK_INTERVAL_MS = 2_000;

export function watchRoutes(callback: RouteCallback): () => void {
  let previousPathname = location.pathname;

  const check = () => {
    if (location.pathname === previousPathname) {
      return;
    }
    previousPathname = location.pathname;
    callback(previousPathname);
  };

  // The page-world routeSignal content script emits synchronously after
  // pushState/replaceState. This isolated-world listener retains browser
  // navigation events and a rare backstop for platform-specific URL changes.
  const interval = window.setInterval(check, FALLBACK_INTERVAL_MS);
  window.addEventListener(ROUTE_CHANGE_EVENT, check);
  window.addEventListener("popstate", check);
  window.addEventListener("hashchange", check);

  return () => {
    window.clearInterval(interval);
    window.removeEventListener(ROUTE_CHANGE_EVENT, check);
    window.removeEventListener("popstate", check);
    window.removeEventListener("hashchange", check);
  };
}
