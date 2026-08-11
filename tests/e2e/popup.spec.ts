import { chromium, expect, test, type BrowserContext } from "@playwright/test";
import { resolve } from "node:path";

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  enabled: true,
  lastPlatform: "facebook",
  facebook: { reels: true, stories: true, videos: false },
  instagram: { reels: true, stories: true, explore: true },
  youtube: { shorts: true, navigation: true, redirect: true }
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
        const stored = await chrome.storage.sync.get("settings");
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
  expect(outgoingRequests).toEqual([]);
});
