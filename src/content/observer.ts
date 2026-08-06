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

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      mutation.addedNodes.forEach((node) => {
        if (node instanceof Element || node instanceof DocumentFragment) {
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
