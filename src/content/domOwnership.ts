const HIDDEN_ATTRIBUTE = "data-nullfeed-hidden";
const FEATURE_ATTRIBUTE = "data-nullfeed-feature";
const PREVIOUS_HIDDEN_ATTRIBUTE = "data-nullfeed-previous-hidden";
const PREVIOUS_DISPLAY_ATTRIBUTE = "data-nullfeed-previous-display";
const PREVIOUS_PRIORITY_ATTRIBUTE = "data-nullfeed-previous-display-priority";

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

  element.setAttribute(HIDDEN_ATTRIBUTE, "");
  element.setAttribute(FEATURE_ATTRIBUTE, feature);
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

export function cleanupOwnedElements(root: ParentNode = document): void {
  if (root instanceof Element && root.hasAttribute(HIDDEN_ATTRIBUTE)) {
    restoreElement(root);
  }

  root
    .querySelectorAll?.(`[${HIDDEN_ATTRIBUTE}]`)
    .forEach((element) => restoreElement(element));
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
