const HIDDEN_ATTRIBUTE = "data-nullfeed-hidden";
const FEATURE_ATTRIBUTE = "data-nullfeed-feature";
const PREVIOUS_HIDDEN_ATTRIBUTE = "data-nullfeed-previous-hidden";
const PREVIOUS_DISPLAY_ATTRIBUTE = "data-nullfeed-previous-display";
const PREVIOUS_PRIORITY_ATTRIBUTE = "data-nullfeed-previous-display-priority";

function getFeatures(element: Element): string[] {
  const raw = element.getAttribute(FEATURE_ATTRIBUTE) ?? "";
  return raw.split(" ").filter(Boolean);
}

function setFeatures(element: Element, features: string[]): void {
  if (features.length === 0) {
    element.removeAttribute(FEATURE_ATTRIBUTE);
  } else {
    element.setAttribute(FEATURE_ATTRIBUTE, features.join(" "));
  }
}

/**
 * Hides `element` on behalf of `feature`. Multiple features can hide the
 * same element concurrently — the element only becomes visible again once
 * every feature that hid it has released it via `restoreElement` /
 * `cleanupOwnedFeature`, so turning one feature off never uncovers content
 * that another active feature still wants hidden.
 */
export function hideElement(element: Element, feature: string): void {
  if (!(element instanceof HTMLElement)) {
    return;
  }

  if (!element.hasAttribute(HIDDEN_ATTRIBUTE)) {
    element.setAttribute(PREVIOUS_HIDDEN_ATTRIBUTE, String(element.hidden));
    element.setAttribute(
      PREVIOUS_DISPLAY_ATTRIBUTE,
      element.style.getPropertyValue("display")
    );
    element.setAttribute(
      PREVIOUS_PRIORITY_ATTRIBUTE,
      element.style.getPropertyPriority("display")
    );
  }

  const features = getFeatures(element);
  if (!features.includes(feature)) {
    features.push(feature);
  }
  setFeatures(element, features);

  element.setAttribute(HIDDEN_ATTRIBUTE, "");
  element.hidden = true;
  element.style.setProperty("display", "none", "important");
}

export function restoreElement(element: Element): void {
  if (!(element instanceof HTMLElement) || !element.hasAttribute(HIDDEN_ATTRIBUTE)) {
    return;
  }

  const previousDisplay =
    element.getAttribute(PREVIOUS_DISPLAY_ATTRIBUTE) ?? "";
  const previousPriority =
    element.getAttribute(PREVIOUS_PRIORITY_ATTRIBUTE) ?? "";
  const previousHidden =
    element.getAttribute(PREVIOUS_HIDDEN_ATTRIBUTE) === "true";

  if (previousDisplay) {
    element.style.setProperty("display", previousDisplay, previousPriority);
  } else {
    element.style.removeProperty("display");
  }

  element.hidden = previousHidden;
  element.removeAttribute(HIDDEN_ATTRIBUTE);
  element.removeAttribute(FEATURE_ATTRIBUTE);
  element.removeAttribute(PREVIOUS_HIDDEN_ATTRIBUTE);
  element.removeAttribute(PREVIOUS_DISPLAY_ATTRIBUTE);
  element.removeAttribute(PREVIOUS_PRIORITY_ATTRIBUTE);
}

/**
 * Restores every Nullfeed-hidden element under `root`, except elements that
 * are being held hidden solely by `excludeFeature` (e.g. an in-progress
 * Focus Cycle block). An element hidden by both `excludeFeature` and another
 * feature keeps the other feature's hold and stays hidden.
 */
export function cleanupOwnedElements(
  root: ParentNode = document,
  excludeFeature = "focus-cycle"
): void {
  const release = (element: Element) => {
    const features = getFeatures(element).filter((f) => f !== excludeFeature);
    if (features.length === 0) {
      restoreElement(element);
    } else {
      setFeatures(element, features);
    }
  };

  if (root instanceof Element && root.hasAttribute(HIDDEN_ATTRIBUTE)) {
    release(root);
  }

  root.querySelectorAll?.(`[${HIDDEN_ATTRIBUTE}]`).forEach(release);
}

/**
 * Releases `feature`'s hold on every element it hid under `root`. An element
 * still held hidden by another feature stays hidden; it only becomes visible
 * once no feature holds it anymore.
 */
export function cleanupOwnedFeature(feature: string, root: ParentNode = document): void {
  const release = (element: Element) => {
    const features = getFeatures(element).filter((f) => f !== feature);
    if (features.length === 0) {
      restoreElement(element);
    } else {
      setFeatures(element, features);
    }
  };

  if (root instanceof Element && getFeatures(root).includes(feature)) {
    release(root);
  }

  root
    .querySelectorAll?.(`[${FEATURE_ATTRIBUTE}~="${feature}"]`)
    .forEach(release);
}

export function hideClosest(
  element: Element,
  containers: readonly string[],
  feature: string
): void {
  for (const selector of containers) {
    const container = element.closest(selector);
    if (container) {
      hideElement(container, feature);
      return;
    }
  }

  hideElement(element, feature);
}

const DEFAULT_COLLAPSE_BOUNDARY =
  'main, [role="main"], [role="feed"], [role="navigation"], [role="banner"], [role="article"], header, nav, [data-pagelet="NavBar"], [data-pagelet="MNav"]';

function isVisiblyEmpty(element: Element): boolean {
  if (element.hasAttribute(HIDDEN_ATTRIBUTE)) {
    return true;
  }
  if (element instanceof HTMLElement && element.style.display === "none") {
    return true;
  }
  if (
    element instanceof HTMLImageElement ||
    element instanceof HTMLVideoElement ||
    element instanceof HTMLCanvasElement
  ) {
    return false;
  }
  if (element.children.length === 0) {
    return (element.textContent ?? "").trim().length === 0;
  }
  for (const child of Array.from(element.children)) {
    if (!isVisiblyEmpty(child)) {
      return false;
    }
  }
  return (element.textContent ?? "").trim().length === 0;
}

/**
 * After hiding `element`, walk up its ancestors and hide any wrapper whose
 * *entire remaining visible content* is empty — i.e. every child is either
 * already Nullfeed-hidden or contains no rendered text. Stops at a real
 * layout boundary or after `maxDepth` levels, whichever comes first.
 */
export function collapseEmptyAncestors(
  element: Element,
  feature: string,
  boundarySelector: string = DEFAULT_COLLAPSE_BOUNDARY,
  maxDepth = 4
): void {
  let candidate = element.parentElement;

  for (let depth = 0; candidate && depth < maxDepth; depth += 1) {
    if (
      candidate === document.body ||
      candidate === document.documentElement ||
      candidate.matches(boundarySelector)
    ) {
      break;
    }
    if (!isVisiblyEmpty(candidate)) {
      break;
    }
    hideElement(candidate, feature);
    candidate = candidate.parentElement;
  }
}
