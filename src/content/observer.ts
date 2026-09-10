export type ScanCallback = (root: ParentNode) => void;

const MAX_ROOTS_PER_FRAME = 100;

export function observeDynamicContent(scan: ScanCallback): () => void {
  const pending = new Set<ParentNode>();
  let frame: number | null = null;

  const flush = () => {
    frame = null;
    const roots = [...pending].slice(0, MAX_ROOTS_PER_FRAME);
    roots.forEach((root) => pending.delete(root));
    roots.forEach(scan);

    if (pending.size > 0) {
      frame = requestAnimationFrame(flush);
    }
  };

  const schedule = (root: ParentNode) => {
    pending.add(root);
    if (frame === null) {
      frame = requestAnimationFrame(flush);
    }
  };

  const isNullfeedNode = (node: Node): boolean => {
    if (!(node instanceof Element)) return false;
    return (
      node.id === "nullfeed-quote-card" ||
      node.id === "nullfeed-feed-quote-card" ||
      node.id === "nullfeed-yt-grid-wrapper" ||
      node.id === "nullfeed-snooze-overlay" ||
      node.hasAttribute("data-nullfeed-hidden") ||
      node.hasAttribute("data-nullfeed-top-quote") ||
      node.hasAttribute("data-nullfeed-yt-card") ||
      node.classList.contains("nullfeed-ad-label") ||
      Boolean(node.closest?.("[data-nullfeed-hidden]")) ||
      Boolean(
        node.closest?.(
          "#nullfeed-quote-card, #nullfeed-feed-quote-card, #nullfeed-yt-grid-wrapper, [data-nullfeed-top-quote], [data-nullfeed-yt-card]"
        )
      )
    );
  };

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element || node instanceof DocumentFragment) {
          // Skip Nullfeed's own injected/modified nodes to prevent feedback loops
          if (node instanceof Element && isNullfeedNode(node)) return;
          schedule(node);
        }
      });
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });

  return () => {
    observer.disconnect();
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
    pending.clear();
  };
}
