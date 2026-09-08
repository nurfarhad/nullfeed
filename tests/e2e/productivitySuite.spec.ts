import {
  chromium,
  expect,
  test,
  type BrowserContext,
  type Page,
  type Worker
} from "@playwright/test";
import { resolve } from "node:path";

const DEFAULT_SETTINGS = {
  schemaVersion: 1,
  enabled: true,
  showQuotes: true,
  lastPlatform: "facebook",
  facebook: { reels: true, stories: true, videos: false, ads: true, messages: false, interactions: false },
  instagram: { reels: true, stories: true, explore: true, messages: false },
  youtube: {
    shorts: true,
    redirect: true,
    sidebar: true,
    feed: false,
    comments: false,
    endscreen: true
  }
};

let context: BrowserContext;
let worker: Worker;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function setSettings(settings: Record<string, any> = DEFAULT_SETTINGS): Promise<void> {
  await worker.evaluate(
    async ({ value }) => {
      await chrome.storage.sync.set({ settings: value });
    },
    { value: settings }
  );
}

async function fixturePage(url: string, html: string): Promise<Page> {
  const page = await context.newPage();
  await page.route(url, (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body>${html}</body></html>`
    })
  );
  await page.goto(url);
  return page;
}

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

  worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
});

test.afterAll(async () => {
  await context.close();
});

test.afterEach(async () => {
  for (const page of context.pages()) {
    await page.close().catch(() => {});
  }
  await worker.evaluate(async () => {
    await chrome.storage.local.remove("nullfeed-snooze-until");
  });
});

test.beforeEach(async () => {
  await setSettings();
});

test("Direct to Messages redirects root Facebook to /messages/ when enabled", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { ...DEFAULT_SETTINGS.facebook, messages: true }
  });

  const page = await context.newPage();
  await page.route("https://www.facebook.com/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><h1>Facebook Feed</h1></body></html>`
    })
  );
  await page.route("https://www.facebook.com/messages/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><h1>Messenger Inbox</h1></body></html>`
    })
  );

  await page.goto("https://www.facebook.com/");
  await expect(page).toHaveURL("https://www.facebook.com/messages/");
});

test("Direct to Messages redirects root Instagram to /direct/inbox/ when enabled", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    instagram: { ...DEFAULT_SETTINGS.instagram, messages: true }
  });

  const page = await context.newPage();
  await page.route("https://www.instagram.com/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><h1>Instagram Feed</h1></body></html>`
    })
  );
  await page.route("https://www.instagram.com/direct/inbox/", (route) =>
    route.fulfill({
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html><body><h1>Instagram Direct</h1></body></html>`
    })
  );

  await page.goto("https://www.instagram.com/");
  await expect(page).toHaveURL("https://www.instagram.com/direct/inbox/");
});

test("Snooze protection temporarily unpauses filters without modifying persistent settings", async () => {
  const page = await fixturePage(
    "https://www.facebook.com/fixture-snooze",
    `
      <div role="feed">
        <a id="fb-reel" href="/reel/123">Reel link</a>
      </div>
    `
  );

  // Initially active, reel is hidden
  await expect(page.locator("#fb-reel")).not.toBeVisible();

  // Set snooze for 5 minutes in local storage
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ "nullfeed-snooze-until": Date.now() + 300_000 });
  });

  // Snoozed attribute appears and reel becomes visible
  await expect(page.locator("html")).toHaveAttribute("data-nullfeed-snoozed", "");
  await expect(page.locator("#fb-reel")).toBeVisible();

  // Cancel snooze
  await worker.evaluate(async () => {
    await chrome.storage.local.remove("nullfeed-snooze-until");
  });

  // Protection re-asserts
  await expect(page.locator("html")).not.toHaveAttribute("data-nullfeed-snoozed");
  await expect(page.locator("#fb-reel")).not.toBeVisible();
});

test("Mindful Intent Prompt persists goal in sessionStorage and allows clearing", async () => {
  // Seed focus cycle in 'on' (focus) phase
  await worker.evaluate(async () => {
    await chrome.storage.local.set({
      "nullfeed-focus-cycle-anchors": {
        facebook: Date.now() - 20 * 60_000
      }
    });
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="feed" id="fb-feed">
        <div role="article">Post 1</div>
      </div>
    `
  );

  // Quote card and intent input render
  const input = page.locator(".nullfeed-intent-input");
  await expect(input).toBeVisible();

  // Type intent and submit
  await input.fill("Research TypeScript generics");
  await page.locator(".nullfeed-intent-submit").click();

  // Badge appears with the intent text
  const badge = page.locator(".nullfeed-intent-badge");
  await expect(badge).toBeVisible();
  await expect(badge).toContainText("Research TypeScript generics");

  // Verified in sessionStorage
  const storedGoal = await page.evaluate(() => sessionStorage.getItem("nullfeed-session-intent"));
  expect(storedGoal).toBe("Research TypeScript generics");

  // Click clear button
  await page.locator(".nullfeed-intent-clear").click();

  // Input form is restored and badge is gone
  await expect(input).toBeVisible();
  await expect(badge).toHaveCount(0);
  const clearedGoal = await page.evaluate(() => sessionStorage.getItem("nullfeed-session-intent"));
  expect(clearedGoal).toBeNull();
});

test("Popup snooze controls trigger countdown and resume", async () => {
  const extensionId = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);

  await expect(page.getByText("Protected", { exact: true })).toBeVisible();

  // Click 5m snooze pill
  const pill5m = page.getByRole("button", { name: "Pause protection for 5 minutes" });
  await expect(pill5m).toBeVisible();
  await pill5m.click();

  // Status changes to Snoozed
  await expect(page.getByText("Snoozed", { exact: true })).toBeVisible();
  await expect(page.getByText(/Paused for/)).toBeVisible();

  // Resume button resumes protection
  const resumeBtn = page.getByRole("button", { name: "Resume" });
  await expect(resumeBtn).toBeVisible();
  await resumeBtn.click();

  await expect(page.getByText("Protected", { exact: true })).toBeVisible();
});
