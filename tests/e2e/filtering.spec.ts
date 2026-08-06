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
  lastPlatform: "facebook",
  facebook: { reels: true, stories: true, videos: false },
  instagram: { reels: true, stories: true, explore: true },
  youtube: { shorts: true, navigation: true, redirect: true }
};

let context: BrowserContext;
let worker: Worker;

async function setSettings(settings = DEFAULT_SETTINGS): Promise<void> {
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
      contentType: "text/html",
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

test.beforeEach(async () => {
  await setSettings();
});

test("YouTube filters initial and dynamic Shorts and restores them on pause", async () => {
  const page = await fixturePage(
    "https://www.youtube.com/feed/subscriptions",
    `
      <ytd-guide-entry-renderer id="shorts-nav">
        <a href="/shorts">Shorts</a>
      </ytd-guide-entry-renderer>
      <ytd-rich-item-renderer id="short-card">
        <a href="/shorts/abc">Short</a>
      </ytd-rich-item-renderer>
      <ytd-rich-item-renderer id="normal-card">
        <a href="/watch?v=abc">Long video</a>
      </ytd-rich-item-renderer>
    `
  );

  await expect(page.locator("#shorts-nav")).toBeHidden();
  await expect(page.locator("#short-card")).toBeHidden();
  await expect(page.locator("#normal-card")).toBeVisible();

  await page.evaluate(() => {
    const card = document.createElement("ytd-video-renderer");
    card.id = "dynamic-short";
    card.innerHTML = '<a href="/shorts/dynamic">Dynamic short</a>';
    document.body.append(card);
  });
  await expect(page.locator("#dynamic-short")).toBeHidden();

  await setSettings({ ...DEFAULT_SETTINGS, enabled: false });
  await expect(page.locator("#shorts-nav")).toBeVisible();
  await expect(page.locator("#short-card")).toBeVisible();
  await expect(page.locator("#dynamic-short")).toBeVisible();
});

test("Facebook filters Reels and Stories while leaving Videos at its default", async () => {
  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="article" id="reel"><a href="/reel/123">Reel</a></div>
      <div data-pagelet="Stories" id="story">
        <a href="/stories/123">Story one</a>
        <a href="/stories/456">Story two</a>
      </div>
      <div role="article" id="video"><a href="/watch/?v=123">Video</a></div>
    `
  );

  await expect(page.locator("#reel")).toBeHidden();
  await expect(page.locator("#story")).toBeHidden();
  await expect(page.locator("#video")).toBeVisible();

  await setSettings({ ...DEFAULT_SETTINGS, enabled: false });
  await expect(page.locator("#reel")).toBeVisible();
  await expect(page.locator("#story")).toBeVisible();
});

test("Facebook Stories never hide an unverified newsfeed wrapper", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: false, stories: true, videos: false }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="main" id="main">
        <div id="feed-wrapper">
          <div id="story-tray">
            <a id="story-entry" href="/stories/person/123">Story</a>
          </div>
          <div role="article" id="normal-post">
            <p>Normal newsfeed post</p>
            <a id="shared-story-link" href="/stories/person/456">
              Shared story entry
            </a>
          </div>
        </div>
      </div>
    `
  );

  await expect(page.locator("#main")).toBeVisible();
  await expect(page.locator("#feed-wrapper")).toBeVisible();
  await expect(page.locator("#normal-post")).toBeVisible();
  await expect(page.locator("#story-entry")).toBeHidden();
  await expect(page.locator("#shared-story-link")).toBeVisible();
});

test("Facebook collapses a modern Stories carousel without leaving a gap", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: false, stories: true, videos: false }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="main" id="main">
        <div id="composer">What's on your mind?</div>
        <div id="story-carousel">
          <button id="previous-story">Previous</button>
          <div><a href="/stories/person/1">Story one</a></div>
          <div><a href="/stories/person/2">Story two</a></div>
          <button id="next-story">Next</button>
        </div>
        <div role="article" id="normal-post">Normal post</div>
      </div>
    `
  );

  await expect(page.locator("#story-carousel")).toBeHidden();
  await expect(page.locator("#previous-story")).toBeHidden();
  await expect(page.locator("#next-story")).toBeHidden();
  await expect(page.locator("#composer")).toBeVisible();
  await expect(page.locator("#normal-post")).toBeVisible();
  await expect(page.locator("#main")).toBeVisible();
});

test("Facebook Reels and Videos hide only verified feed units", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: true, stories: false, videos: true }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="main" id="main">
        <div id="feed-wrapper">
          <div role="article" id="reel-unit">
            <a href="/reel/123">Reel</a>
          </div>
          <div role="article" id="video-unit">
            <a href="/watch/?v=123">Video</a>
          </div>
          <div role="article" id="normal-post">
            <p>Normal newsfeed post</p>
          </div>
        </div>
      </div>
    `
  );

  await expect(page.locator("#main")).toBeVisible();
  await expect(page.locator("#feed-wrapper")).toBeVisible();
  await expect(page.locator("#reel-unit")).toBeHidden();
  await expect(page.locator("#video-unit")).toBeHidden();
  await expect(page.locator("#normal-post")).toBeVisible();
});

test("Facebook hides and pauses native feed videos without a watch link", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: false, stories: false, videos: true }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="main" id="main">
        <div role="article" id="video-post">
          <p>Native feed video</p>
          <video id="native-video"></video>
        </div>
        <div role="article" id="image-post">
          <p>Normal image post</p>
          <img alt="Normal image" />
        </div>
      </div>
    `
  );

  // Reinsert the video so the mutation observer exercises the native-video pass.
  await page.locator("#native-video").evaluate((video) => {
    video.remove();
    document.querySelector("#video-post")?.append(video);
  });

  await expect(page.locator("#video-post")).toBeHidden();
  await expect(page.locator("#image-post")).toBeVisible();
  await expect(page.locator("#main")).toBeVisible();
  await expect(page.locator("#native-video")).toHaveAttribute(
    "data-nullfeed-paused",
    ""
  );

  await setSettings({ ...DEFAULT_SETTINGS, enabled: false });
  await expect(page.locator("#video-post")).toBeVisible();
  await expect(page.locator("#native-video")).not.toHaveAttribute(
    "data-nullfeed-paused",
    ""
  );
});

test("Instagram filters Reels, Stories, and Explore and restores them", async () => {
  const page = await fixturePage(
    "https://www.instagram.com/",
    `
      <nav id="nav"><a id="explore" href="/explore/">Explore</a></nav>
      <article id="reel"><a href="/reel/123/">Reel</a></article>
      <section id="story">
        <a href="/stories/person/123/">Story one</a>
        <a href="/stories/person/456/">Story two</a>
      </section>
      <article id="normal"><a href="/p/123/">Post</a></article>
    `
  );

  await expect(page.locator("#explore")).toBeHidden();
  await expect(page.locator("#reel")).toBeHidden();
  await expect(page.locator("#story")).toBeHidden();
  await expect(page.locator("#normal")).toBeVisible();

  await setSettings({ ...DEFAULT_SETTINGS, enabled: false });
  await expect(page.locator("#explore")).toBeVisible();
  await expect(page.locator("#reel")).toBeVisible();
  await expect(page.locator("#story")).toBeVisible();
});

test("Instagram never hides broad feed wrappers or adjacent profile cells", async () => {
  const page = await fixturePage(
    "https://www.instagram.com/",
    `
      <main id="main">
        <div id="feed-shell">
          <div id="feed-column">
            <section id="single-story">
              <a id="story-link" href="/stories/person/123/">Story</a>
              <span>Stories</span>
            </section>
            <article id="photo-post">
              <a href="/p/photo-post/">Photo post</a>
              <a id="photo-author-story" href="/stories/author/123/">Author</a>
            </article>
          </div>
        </div>
        <div id="profile-grid">
          <div id="reel-cell"><a href="/reel/reel-item/">Reel</a></div>
          <div id="photo-cell"><a href="/p/photo-item/">Photo</a></div>
        </div>
      </main>
    `
  );

  await expect(page.locator("#story-link")).toBeHidden();
  await expect(page.locator("#reel-cell")).toBeHidden();
  await expect(page.locator("#main")).toBeVisible();
  await expect(page.locator("#feed-shell")).toBeVisible();
  await expect(page.locator("#feed-column")).toBeVisible();
  await expect(page.locator("#single-story")).toBeVisible();
  await expect(page.locator("#photo-post")).toBeVisible();
  await expect(page.locator("#photo-author-story")).toBeVisible();
  await expect(page.locator("#profile-grid")).toBeVisible();
  await expect(page.locator("#photo-cell")).toBeVisible();
});

test("Instagram hides only Reels in an untagged multi-link sidebar", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    instagram: { reels: true, stories: false, explore: false }
  });

  const page = await fixturePage(
    "https://www.instagram.com/",
    `
      <div id="sidebar-shell">
        <div id="sidebar">
          <div id="home-item"><a href="/">Home</a></div>
          <div id="search-item"><a href="/search/">Search</a></div>
          <div id="explore-item"><a href="/explore/">Explore</a></div>
          <div id="reels-item"><a href="/reels/">Reels</a></div>
          <div id="messages-item"><a href="/direct/inbox/">Messages</a></div>
          <div id="notifications-item"><a href="/notifications/">Notifications</a></div>
          <div id="profile-item"><a href="/profile/">Profile</a></div>
        </div>
      </div>
      <main><article id="normal-post"><a href="/p/photo/">Photo</a></article></main>
    `
  );

  await expect(page.locator("#reels-item")).toBeHidden();
  await expect(page.locator("#sidebar-shell")).toBeVisible();
  await expect(page.locator("#sidebar")).toBeVisible();
  await expect(page.locator("#home-item")).toBeVisible();
  await expect(page.locator("#search-item")).toBeVisible();
  await expect(page.locator("#explore-item")).toBeVisible();
  await expect(page.locator("#messages-item")).toBeVisible();
  await expect(page.locator("#notifications-item")).toBeVisible();
  await expect(page.locator("#profile-item")).toBeVisible();
  await expect(page.locator("#normal-post")).toBeVisible();
});

test("History API navigation is blocked without waiting for the polling backstop", async () => {
  const page = await fixturePage(
    "https://www.youtube.com/",
    `<button id="open-shorts">Open Shorts</button>`
  );

  await expect(page.locator("html")).toHaveAttribute("data-nullfeed-enabled", "");

  const started = Date.now();
  await page.locator("#open-shorts").evaluate((button) => {
    button.addEventListener("click", () => {
      history.pushState({}, "", "/shorts/client-navigation");
    });
    (button as HTMLButtonElement).click();
  });
  await expect(page).toHaveURL("https://www.youtube.com/", { timeout: 500 });
  expect(Date.now() - started).toBeLessThan(500);
});

test("blocked routes use replacement navigation to the platform home", async () => {
  const page = await context.newPage();
  await page.route("https://www.youtube.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Fixture</body></html>"
    })
  );

  await page.goto("https://www.youtube.com/shorts/abc");
  await expect(page).toHaveURL("https://www.youtube.com/");
});
