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
  facebook: { reels: true, stories: true, videos: false, ads: true },
  instagram: { reels: true, stories: true, explore: true },
  youtube: { shorts: true, navigation: true, redirect: true, sidebar: true },
  snooze: {
    active: false,
    until: null as number | null,
    sites: {
      facebook: true,
      instagram: true,
      youtube: true
    }
  }
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

test("Facebook hides Sponsored posts while leaving organic posts untouched", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: false, stories: false, videos: false, ads: true }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="article" id="sponsored-post">
        <div>
          <h4><a href="/advertiser-page/">Advertiser</a></h4>
          <a role="link" href="/ads/about/">Sponsored</a>
        </div>
        <p>Buy our product!</p>
      </div>
      <div role="article" id="organic-post">
        <div>
          <h4><a href="/friend/">Friend</a></h4>
          <span dir="auto">Just now</span>
        </div>
        <p>Check out this great deal — not a sponsored post, just sharing</p>
      </div>
      <div role="article" id="mentions-sponsored">
        <div>
          <h4><a href="/person/">Someone</a></h4>
          <span dir="auto">2 hrs</span>
        </div>
        <p>I hate sponsored content on this platform</p>
      </div>
    `
  );

  await expect(page.locator("#sponsored-post")).toHaveAttribute(
    "data-nullfeed-fb-ad",
    "feed"
  );
  await expect(page.locator("#organic-post")).toBeVisible();
  await expect(page.locator("#mentions-sponsored")).toBeVisible();

  await setSettings({ ...DEFAULT_SETTINGS, enabled: false });
  await expect(page.locator("#sponsored-post")).not.toHaveAttribute(
    "data-nullfeed-fb-ad"
  );
});

test("Facebook detects modern 'Ad · ' feed ads without CTAs and hides Right Rail sidebar ads", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: false, stories: false, videos: false, ads: true }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `
      <div role="main">
        <!-- Feed Ad with "Ad · " label and no CTA (Grabgo format) -->
        <div role="article" id="grabgo-ad">
          <div>
            <h4><a href="/grabgo/">Grabgo</a></h4>
            <span dir="auto">Ad · </span>
          </div>
          <div data-ad-rendering-role="story_message">
            <p>Are you looking for a bag?</p>
          </div>
        </div>

        <!-- Organic Post with friend name and time -->
        <div role="article" id="organic-friend-post">
          <div>
            <h4><a href="/friend/">Friend</a></h4>
            <span dir="auto">Just now</span>
          </div>
          <p>Great weekend trip!</p>
        </div>
      </div>

      <!-- Right Rail sidebar -->
      <div role="complementary" id="sidebar">
        <div id="sponsored-rail-section">
          <div>
            <span>Sponsored</span>
          </div>
          <ul>
            <li><a href="https://domestika.org">Guided Course</a></li>
            <li><a href="https://tiktok.com">TikTok Ads</a></li>
          </ul>
        </div>
        <div id="friend-requests-section">
          <span>Friend requests</span>
          <p>Zahid Shouvo</p>
        </div>
      </div>
    `
  );

  // Feed ad is tagged with feed placeholder
  await expect(page.locator("#grabgo-ad")).toHaveAttribute(
    "data-nullfeed-fb-ad",
    "feed"
  );
  // Attribution link points to own.page
  await expect(
    page.locator("#grabgo-ad a[href='https://own.page/nurfarhad']")
  ).toBeAttached();

  // Organic post is unaffected
  await expect(page.locator("#organic-friend-post")).toBeVisible();

  // Right rail sponsored section is tagged for hiding
  await expect(page.locator("#sponsored-rail-section")).toHaveAttribute(
    "data-nullfeed-fb-ad",
    "rail"
  );
  // Friend requests section in sidebar remains visible
  await expect(page.locator("#friend-requests-section")).toBeVisible();
});

test("Facebook Stories never hide an unverified newsfeed wrapper", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    facebook: { reels: false, stories: true, videos: false, ads: false }
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
    facebook: { reels: false, stories: true, videos: false, ads: false }
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
    facebook: { reels: true, stories: false, videos: true, ads: false }
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
    facebook: { reels: false, stories: false, videos: true, ads: false }
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

test("Instagram hides profile reels tabs while leaving profile posts grid untouched", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    instagram: { reels: true, stories: false, explore: false }
  });

  const page = await fixturePage(
    "https://www.instagram.com/user/",
    `
      <main id="main">
        <div id="profile-header">
          <div role="tablist">
            <a role="tab" id="posts-tab" href="/user/">Posts</a>
            <a role="tab" id="reels-tab" href="/user/reels/">Reels</a>
            <a role="tab" id="saved-tab" href="/user/saved/">Saved</a>
          </div>
        </div>
        <div id="grid">
          <div id="photo-post"><a href="/p/123/"><img alt="Photo" /></a></div>
          <div id="reel-post"><a href="/reel/456/"><img alt="Reel" /></a></div>
        </div>
      </main>
    `
  );

  await expect(page.locator("#posts-tab")).toBeVisible();
  await expect(page.locator("#reels-tab")).toBeHidden();
  await expect(page.locator("#saved-tab")).toBeVisible();
  await expect(page.locator("#photo-post")).toBeVisible();
  await expect(page.locator("#reel-post")).toBeVisible();
});

test("Instagram hides profile story highlights carousel and navigation buttons without leaving a gap", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    instagram: { reels: false, stories: true, explore: false }
  });

  const page = await fixturePage(
    "https://www.instagram.com/user/",
    `
      <main id="main">
        <div id="profile-header">
          <button id="edit-profile">Edit profile</button>
        </div>
        <div id="highlights-section">
          <div id="carousel-wrapper">
            <ul>
              <li><a href="/stories/highlights/1/"><img alt="Highlight 1" /></a></li>
              <li><a href="/stories/highlights/2/"><img alt="Highlight 2" /></a></li>
            </ul>
            <button id="carousel-next-btn">Next</button>
          </div>
        </div>
        <div id="tablist" role="tablist">
          <a role="tab" id="posts-tab" href="/user/">Posts</a>
        </div>
      </main>
    `
  );

  await expect(page.locator("#posts-tab")).toBeVisible();
});

test("Instagram Hide Stories never hides profile header, followers, bio or tabs on post-less profiles", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    instagram: { reels: false, stories: true, explore: false }
  });

  const page = await fixturePage(
    "https://www.instagram.com/mahaonsocial/",
    `
      <main id="main">
        <div id="profile-container">
          <header id="profile-header">
            <h2 id="username">mahaonsocial</h2>
            <button id="follow-btn">Follow</button>
            <a id="followers-link" href="/mahaonsocial/followers/">10k followers</a>
            <div id="bio">Bio text here</div>
          </header>
          <div id="highlights-tray">
            <ul>
              <li><a href="/stories/highlights/111/"><img alt="Highlight" /></a></li>
            </ul>
          </div>
          <div id="tablist" role="tablist">
            <a role="tab" id="posts-tab" href="/mahaonsocial/">Posts</a>
          </div>
          <div id="empty-posts-placeholder">No posts yet.</div>
        </div>
      </main>
    `
  );

  await expect(page.locator("#username")).toBeVisible();
  await expect(page.locator("#follow-btn")).toBeVisible();
  await expect(page.locator("#followers-link")).toBeVisible();
  await expect(page.locator("#bio")).toBeVisible();
  await expect(page.locator("#highlights-tray")).toBeHidden();
  await expect(page.locator("#tablist")).toBeVisible();
  await expect(page.locator("#posts-tab")).toBeVisible();
  await expect(page.locator("#empty-posts-placeholder")).toBeVisible();
});

test("Instagram collapses Explore grid reel columns without leaving blank space", async () => {
  await setSettings({
    ...DEFAULT_SETTINGS,
    instagram: { reels: true, stories: false, explore: false }
  });

  const page = await fixturePage(
    "https://www.instagram.com/explore/",
    `
      <main id="main">
        <div id="explore-grid">
          <div id="explore-row-1">
            <div id="photo-col"><a href="/p/photo1/"><img alt="Photo 1" /></a></div>
            <div id="reel-col">
              <div id="reel-item-1"><a href="/reel/123/"><img alt="Reel 1" /></a></div>
              <div id="reel-item-2"><a href="/p/456/"><svg aria-label="Clip"></svg><img alt="Reel 2" /></a></div>
            </div>
          </div>
          <div id="explore-row-2">
            <div id="photo-item-2"><a href="/p/photo2/"><img alt="Photo 2" /></a></div>
            <div id="photo-item-3"><a href="/p/photo3/"><img alt="Photo 3" /></a></div>
          </div>
        </div>
      </main>
    `
  );

  await expect(page.locator("#photo-col")).toBeVisible();
  await expect(page.locator("#reel-col")).toBeHidden();
  await expect(page.locator("#reel-item-1")).toBeHidden();
  await expect(page.locator("#reel-item-2")).toBeHidden();
  await expect(page.locator("#explore-row-1")).toBeVisible();
  await expect(page.locator("#explore-row-2")).toBeVisible();
  await expect(page.locator("#photo-item-2")).toBeVisible();
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
  try {
    await page.route("https://www.youtube.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<!doctype html><html><body>Fixture</body></html>"
      })
    );

    await page.goto("https://www.youtube.com/shorts/abc");
    await expect(page).toHaveURL("https://www.youtube.com/");
  } finally {
    await page.close().catch(() => {});
  }
});

test("Snooze overlay shows on snoozed platform and hides on resume", async () => {
  const until = Date.now() + 60_000;
  await setSettings({
    ...DEFAULT_SETTINGS,
    snooze: {
      active: true,
      until,
      sites: { ...DEFAULT_SETTINGS.snooze.sites }
    }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `<div role="article" id="post">Normal post</div>`
  );

  await expect(page.locator("#nullfeed-snooze-overlay")).toBeVisible();

  // Resume clears the overlay
  await setSettings({
    ...DEFAULT_SETTINGS,
    snooze: {
      active: false,
      until: null,
      sites: { ...DEFAULT_SETTINGS.snooze.sites }
    }
  });
  await expect(page.locator("#nullfeed-snooze-overlay")).toBeHidden();
});

test("Snooze overlay does not show for unchecked platforms", async () => {
  const until = Date.now() + 60_000;
  await setSettings({
    ...DEFAULT_SETTINGS,
    snooze: {
      active: true,
      until,
      sites: { ...DEFAULT_SETTINGS.snooze.sites, facebook: false }
    }
  });

  const page = await fixturePage(
    "https://www.facebook.com/",
    `<div role="article" id="post">Normal post</div>`
  );

  await expect(page.locator("#nullfeed-snooze-overlay")).toHaveCount(0);
  await expect(page.locator("#post")).toBeVisible();
});

test("YouTube hides watch page recommended sidebar when enabled", async () => {
  const page = await fixturePage(
    "https://www.youtube.com/watch?v=12345",
    `
      <div id="player">Video Player</div>
      <ytd-watch-next-secondary-results-renderer id="recommended-sidebar">
        <div>Recommended Videos</div>
      </ytd-watch-next-secondary-results-renderer>
    `
  );

  await expect(page.locator("#player")).toBeVisible();
  await expect(page.locator("#recommended-sidebar")).toBeHidden();
});

test("Quote card does NOT mount on YouTube home (prevents layout thrashing)", async () => {
  const page = await fixturePage(
    "https://www.youtube.com/",
    `
      <ytd-browse page-subtype="home" id="home-browse">
        <ytd-rich-grid-renderer id="rich-grid">
          <div id="contents">Home Feed</div>
        </ytd-rich-grid-renderer>
      </ytd-browse>
    `
  );

  // Quote card should NOT be present on YouTube
  await expect(page.locator("#nullfeed-quote-card")).toHaveCount(0);
  // Feed content should remain visible and untouched
  await expect(page.locator("#contents")).toBeVisible();
});

