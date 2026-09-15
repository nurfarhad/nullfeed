export type RouteCallback = (pathname: string) => void;

export const ROUTE_CHANGE_EVENT = "nullfeed:route-change";

const FALLBACK_INTERVAL_MS = 2_000;

export function watchRoutes(callback: RouteCallback): () => void {
  // Track pathname + search so same-path SPA navigations (e.g. YouTube's
  // /watch?v=A -> /watch?v=B) are treated as route changes too, not just
  // full pathname changes. Hash is intentionally excluded — hashchange is
  // handled as its own trigger below and most platforms use it for in-page
  // anchors rather than navigation.
  let previousRoute = location.pathname + location.search;

  const check = () => {
    const currentRoute = location.pathname + location.search;
    if (currentRoute === previousRoute) {
      return;
    }
    previousRoute = currentRoute;
    callback(location.pathname);
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
