import type { Settings } from "../shared/settings";

export interface SiteAdapter {
  platform: "youtube" | "facebook" | "instagram";
  homeUrl: string;
  blockedRoute(pathname: string, settings: Settings): boolean;
  scan(root: ParentNode, settings: Settings): void;
  cleanup(): void;
}

export function queryAll(
  root: ParentNode,
  selector: string
): Element[] {
  const matches: Element[] = [];

  try {
    if (root instanceof Element && root.matches(selector)) {
      matches.push(root);
    }
    matches.push(...root.querySelectorAll(selector));
  } catch {
    // Fail open: one obsolete or malformed selector must not stop an adapter.
  }

  return matches;
}
