import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { resolve } from "node:path";

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  enabled: true,
  showQuotes: true,
  lastPlatform: "facebook",
  facebook: { reels: true, stories: true, videos: false, ads: true },
  instagram: { reels: true, stories: true, explore: true },
  youtube: { shorts: true, navigation: true, redirect: true, sidebar: true },
  snooze: {
    active: false,
    until: null,
    sites: {
      facebook: true,
      instagram: true,
      youtube: true
    }
  }
};

let context: BrowserContext;

test.beforeAll(async () => {
  const extensionPath = resolve(
    process.env.NULLFEED_EXTENSION_PATH ?? "dist"
  );
  const executablePath = process.env.NULLFEED_BROWSER_EXECUTABLE;
  context = await chromium.launchPersistentContext("", {
    ...(executablePath
      ? { executablePath }
      : { channel: "chromium" as const }),
    headless: true,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });
});

test.afterAll(async () => {
  await context.close();
});

test.afterEach(async () => {
  for (const page of context.pages()) {
    await page.close().catch(() => {});
  }
});

test.beforeEach(async () => {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent("serviceworker");
  }
  await worker.evaluate(async (defaults) => {
    await chrome.storage.sync.set({ settings: defaults });
  }, DEFAULT_SETTINGS);
});

test("popup exposes the approved controls and pause state", async () => {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent("serviceworker");
  }
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const stored = await chrome.storage.sync.get("settings");
        return stored.settings;
      })
    )
    .toEqual(DEFAULT_SETTINGS);

  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.emulateMedia({ colorScheme: "dark" });
  const outgoingRequests: string[] = [];

  page.on("request", (request) => {
    if (/^https?:/.test(request.url())) {
      outgoingRequests.push(request.url());
    }
  });

  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.getByRole("heading", { name: "Nullfeed" })).toBeVisible();
  await expect(page.getByText("Protected", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: "Protection" })).toBeChecked();
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(3);
  expect(await tabs.allTextContents()).toEqual([
    "Facebook",
    "Instagram",
    "YouTube"
  ]);
  await expect(page.getByRole("tab", { name: "Facebook" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await expect(
    page.getByRole("switch", { name: "Hide Reels", exact: true })
  ).toBeChecked();

  await page.getByRole("tab", { name: "Facebook" }).press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Instagram" })).toHaveAttribute(
    "aria-selected",
    "true"
  );
  await page.getByRole("tab", { name: "Instagram" }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "Facebook" })).toHaveAttribute(
    "aria-selected",
    "true"
  );

  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(17, 18, 20)"
  );
  await expect(page.locator(".protection")).toHaveCSS(
    "background-color",
    "rgb(26, 27, 30)"
  );

  await page.getByRole("switch", { name: "Protection" }).click();

  await expect(page.getByText("Paused", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Hide Reels", exact: true })
  ).toBeDisabled();

  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const stored = (await chrome.storage.sync.get("settings")) as {
          settings?: { enabled?: boolean };
        };
        return stored.settings?.enabled;
      })
    )
    .toBe(false);

  await worker.evaluate(async () => {
    const stored = await chrome.storage.sync.get("settings");
    const settings = stored.settings as Record<string, unknown>;
    await chrome.storage.sync.set({
      settings: { ...settings, enabled: true }
    });
  });

  await expect(page.getByText("Protected", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Hide Reels", exact: true })
  ).toBeEnabled();

  // Verify Snooze controls are visible
  await expect(page.getByRole("region", { name: "Snooze controls" })).toBeVisible();
  await expect(page.getByRole("button", { name: "5m", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "15m", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "30m", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "1h", exact: true })).toBeVisible();

  // Test starting a 5m snooze
  await page.getByRole("button", { name: "5m", exact: true }).click();
  await expect(page.getByText(/Snoozing ·/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Resume now" })).toBeVisible();

  // Verify storage updated
  await expect
    .poll(() =>
      worker.evaluate(async () => {
        const stored = (await chrome.storage.sync.get("settings")) as {
          settings?: { snooze?: { active?: boolean; until?: number | null } };
        };
        return stored.settings?.snooze?.active;
      })
    )
    .toBe(true);

  // Click Resume now
  await page.getByRole("button", { name: "Resume now" }).click();
  await expect(page.getByRole("button", { name: "5m", exact: true })).toBeVisible();

  // Verify P1 fix: turning off all granular toggles displays "No filters selected"
  await page.getByRole("switch", { name: "Hide Reels", exact: true }).click();
  await page.getByRole("switch", { name: "Hide Stories", exact: true }).click();
  await page.getByRole("tab", { name: "Instagram" }).click();
  await page.getByRole("switch", { name: "Hide Reels", exact: true }).click();
  await page.getByRole("switch", { name: "Hide Stories", exact: true }).click();
  await page.getByRole("switch", { name: "Hide Explore", exact: true }).click();
  await page.getByRole("tab", { name: "YouTube" }).click();
  await page.getByRole("switch", { name: "Hide Shorts", exact: true }).click();
  await page.getByRole("switch", { name: "Hide Shorts Nav", exact: true }).click();
  await page.getByRole("switch", { name: "Hide Recommended", exact: true }).click();

  await expect(page.getByText("No filters selected", { exact: true })).toBeVisible();

  expect(outgoingRequests).toEqual([]);
});

test("popup automatically adapts to dark and light system themes", async () => {
  let worker = context.serviceWorkers()[0];
  if (!worker) {
    worker = await context.waitForEvent("serviceworker");
  }

  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();

  // 1. Dark theme by default / when dark is preferred
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.getByRole("heading", { name: "Nullfeed" })).toBeVisible();
  await expect(page.locator(".popup-shell")).toHaveCSS(
    "background-color",
    "rgb(17, 18, 20)"
  );
  await expect(page.locator(".brand h1")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)"
  );
  await expect(page.locator(".protection")).toHaveCSS(
    "background-color",
    "rgb(26, 27, 30)"
  );
  await page.screenshot({ path: "test-results/popup_dark_theme.png" });

  // 2. Light theme when system/browser prefers light
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator(".popup-shell")).toHaveCSS(
    "background-color",
    "rgb(244, 245, 247)"
  );
  await expect(page.locator(".brand h1")).toHaveCSS(
    "color",
    "rgb(17, 24, 39)"
  );
  await expect(page.locator(".protection")).toHaveCSS(
    "background-color",
    "rgb(255, 255, 255)"
  );
  await expect(page.locator(".status-active")).toHaveCSS(
    "color",
    "rgb(16, 185, 129)"
  );
  await page.screenshot({ path: "test-results/popup_light_theme.png" });

  // 3. Automatically switches back to dark theme when preference changes
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator(".popup-shell")).toHaveCSS(
    "background-color",
    "rgb(17, 18, 20)"
  );
  await expect(page.locator(".brand h1")).toHaveCSS(
    "color",
    "rgb(255, 255, 255)"
  );
  await expect(page.locator(".protection")).toHaveCSS(
    "background-color",
    "rgb(26, 27, 30)"
  );

  // Switch to Instagram
  await page.getByRole("tab", { name: "Instagram" }).click();
  await page.screenshot({ path: "test-results/popup_ig_dark.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.screenshot({ path: "test-results/popup_ig_light.png" });

  // Switch to YouTube
  await page.getByRole("tab", { name: "YouTube" }).click();
  await page.screenshot({ path: "test-results/popup_yt_light.png" });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "test-results/popup_yt_dark.png" });
});
