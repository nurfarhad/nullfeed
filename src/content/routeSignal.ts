const ROUTE_CHANGE_EVENT = "nullfeed:route-change";
const PATCH_MARKER = "__nullfeedHistoryPatched";

type PatchedHistory = History & {
  [PATCH_MARKER]?: boolean;
};

const patchedHistory = history as PatchedHistory;

if (!patchedHistory[PATCH_MARKER]) {
  patchedHistory[PATCH_MARKER] = true;

  for (const method of ["pushState", "replaceState"] as const) {
    const original = history[method];

    history[method] = function (
      this: History,
      ...args: Parameters<History[typeof method]>
    ): void {
      Reflect.apply(original, this, args);
      window.dispatchEvent(new Event(ROUTE_CHANGE_EVENT));
    };
  }
}
