const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;
const HOST = "0.0.0.0";

const VERSION = "7.0.0";

const MX_API_HOSTS = [
  "https://api.mxplayer.in/v1/web",
  "https://api.mxplay.com/v1/web"
];

const MX_SEO_HOSTS = [
  "https://seo.mxplayer.in/v1/api/seo",
  "https://seo.mxplay.com/v1/api/seo"
];

const MX_WEB = "https://www.mxplayer.in";

const USER_ID =
  process.env.MX_USER_ID ||
  "stremio-" +
    Math.random().toString(36).slice(2) +
    "-" +
    Date.now().toString(36);

const COMMON_PARAMS = {
  "device-density": "2",
  platform: "com.mxplay.desktop",
  "content-languages": "hi,en,ta,te,ml,kn,bn,mr,gu,pa",
  "kids-mode-enabled": "false",
  userid: USER_ID
};

/*
 * VERIFIED STREAMS
 *
 * These were obtained from the actual MX Player web player's
 * successful HLS requests.
 *
 * E1:
 * tt8595766:2:1
 *
 * E2:
 * tt8595766:2:2
 */

const KNOWN_STREAMS = {
  "tt8595766:2:1":
    "https://d3sgzbosmwirao.cloudfront.net/video/637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218/3/hls/h264_high.m3u8",

  "tt8595766:2:2":
    "https://d3sgzbosmwirao.cloudfront.net/video/f275ab1d5b01a1c891d6948b650f3f6ca0f48b780ca7ab2a76ffea423a233c03/3/hls/h264_480_high_1750k.m3u8"
};

/*
 * VERIFIED SHOW / SEASON INFORMATION
 */

const KNOWN_SHOWS = {
  tt8595766: {
    title: "Yeh Meri Family",
    showId: "0f96e29c17b376b5ea2dab191ab97d83",

    seasons: {
      2: "1a8452f31b2fcff5e495b44afdb3fbdb"
    }
  }
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function absoluteUrl(url) {
  if (!url) return null;

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  if (url.startsWith("//")) {
    return "https:" + url;
  }

  if (url.startsWith("/")) {
    return "https://d3sgzbosmwirao.cloudfront.net" + url;
  }

  return url;
}

function decodeHtml(str) {
  if (!str) return str;

  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/*
 * Generic HTTP helpers
 */

async function mxGet(path, params = {}, timeoutMs = 15000) {
  let lastError = null;

  for (const host of MX_API_HOSTS) {
    try {
      const url = new URL(host + path);

      const merged = {
        ...COMMON_PARAMS,
        ...params
      };

      for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          Referer: MX_WEB + "/",
          Origin: MX_WEB
        },
        signal: controller.signal
      });

      clearTimeout(timer);

      const text = await response.text();

      let json = null;

      try {
        json = JSON.parse(text);
      } catch {}

      if (!response.ok) {
        lastError = new Error(
          `MX GET ${path} failed: ${response.status}`
        );
        lastError.status = response.status;
        lastError.raw = text;
        continue;
      }

      return {
        success: true,
        status: response.status,
        json,
        text,
        host
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("MX request failed");
}

async function mxPost(path, params = {}, body = null, timeoutMs = 15000) {
  let lastError = null;

  for (const host of MX_API_HOSTS) {
    try {
      const url = new URL(host + path);

      const merged = {
        ...COMMON_PARAMS,
        ...params
      };

      for (const [key, value] of Object.entries(merged)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          "Content-Type": "application/json",
          Referer: MX_WEB + "/",
          Origin: MX_WEB
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });

      clearTimeout(timer);

      const text = await response.text();

      let json = null;

      try {
        json = JSON.parse(text);
      } catch {}

      if (!response.ok) {
        lastError = new Error(
          `MX POST ${path} failed: ${response.status}`
        );
        lastError.status = response.status;
        lastError.raw = text;
        continue;
      }

      return {
        success: true,
        status: response.status,
        json,
        text,
        host
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("MX POST failed");
}

/*
 * SEO request
 */

async function mxSeo(urlPath) {
  let lastError = null;

  for (const host of MX_SEO_HOSTS) {
    try {
      const url = new URL(host + "/get-url-details");

      url.searchParams.set("url", urlPath);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
          Accept: "application/json,text/plain,*/*",
          Referer: MX_WEB + "/",
          Origin: MX_WEB
        },
        signal: controller.signal
      });

      clearTimeout(timer);

      const text = await response.text();

      let json = null;

      try {
        json = JSON.parse(text);
      } catch {}

      if (!response.ok) {
        lastError = new Error(
          `MX SEO failed: ${response.status}`
        );
        lastError.status = response.status;
        lastError.raw = text;
        continue;
      }

      return {
        success: true,
        status: response.status,
        json,
        text,
        host
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("MX SEO failed");
}

/*
 * Fetch the actual MX webpage.
 *
 * This is important because the public detail API can return
 * stream:null even though the web player obtains a valid CDN
 * playlist.
 */

async function fetchMxPage(urlPath) {
  const url = urlPath.startsWith("http")
    ? urlPath
    : MX_WEB + urlPath;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/131 Mobile Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        Referer: MX_WEB + "/"
      },
      signal: controller.signal
    });

    const text = await response.text();

    return {
      ok: response.ok,
      status: response.status,
      url,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

/*
 * Find playable HLS URLs in MX page HTML.
 */

function extractHlsUrls(text) {
  if (!text) return [];

  const results = new Set();

  /*
   * Normal quoted URLs.
   */
  const quotedRegex =
    /https?:\/\/[^"'\\\s<>]+?\.m3u8(?:\?[^"'\\\s<>]*)?/gi;

  for (const match of text.matchAll(quotedRegex)) {
    let url = decodeHtml(match[0]);

    url = url.replace(/\\u0026/g, "&");
    url = url.replace(/\\u003d/g, "=");
    url = url.replace(/\\\//g, "/");

    if (url.includes("cloudfront.net/video/")) {
      results.add(url);
    }
  }

  /*
   * Escaped JSON URLs.
   */
  const escapedRegex =
    /https?:\\\/\\\/[^"'\\\s<>]+?\.m3u8(?:\\\?[^"'\\\s<>]*)?/gi;

  for (const match of text.matchAll(escapedRegex)) {
    let url = match[0]
      .replace(/\\\//g, "/")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003d/g, "=");

    if (url.includes("cloudfront.net/video/")) {
      results.add(url);
    }
  }

  return [...results];
}

/*
 * Pick the best HLS playlist.
 *
 * Prefer 480p because it is a good Stremio/MX Player default
 * and was verified working for E2.
 */

function chooseBestHls(urls) {
  if (!urls || urls.length === 0) return null;

  const score = (url) => {
    const lower = url.toLowerCase();

    if (lower.includes("1080")) return 100;
    if (lower.includes("720")) return 90;
    if (lower.includes("480")) return 80;
    if (lower.includes("360")) return 60;
    if (lower.includes("180")) return 20;

    if (lower.includes("high")) return 70;

    return 50;
  };

  return [...urls].sort((a, b) => score(b) - score(a))[0];
}

/*
 * Extract HLS from page JSON-LD and embedded player data.
 */

async function resolveStreamFromPage(webUrl) {
  if (!webUrl) return null;

  try {
    const page = await fetchMxPage(webUrl);

    if (!page.ok) {
      return null;
    }

    const urls = extractHlsUrls(page.text);

    const selected = chooseBestHls(urls);

    if (selected) {
      return selected;
    }

    /*
     * Some pages may contain a JSON-LD contentUrl encoded
     * differently. Search around contentUrl.
     */

    const contentUrlRegex =
      /"contentUrl"\s*:\s*"([^"]+)"/gi;

    const contentUrls = [];

    for (const match of page.text.matchAll(contentUrlRegex)) {
      let value = match[1]
        .replace(/\\\//g, "/")
        .replace(/\\u0026/g, "&")
        .replace(/\\u003d/g, "=");

      if (value.includes(".m3u8")) {
        contentUrls.push(value);
      }
    }

    return chooseBestHls(contentUrls);
  } catch {
    return null;
  }
}

/*
 * Search MX
 */

async function searchMx(query) {
  const response = await mxPost(
    "/search/resultv2",
    {
      query
    },
    null
  );

  return response.json;
}

/*
 * Direct episode detail
 */

async function detailVideo(id, contentType = "episode") {
  const response = await mxGet("/detail/video", {
    type: contentType,
    id
  });

  return response.json;
}

/*
 * Next episode.
 *
 * This is the key discovery mechanism we verified with E1 -> E2.
 */

async function nextVideo(id, contentType = "episode") {
  const response = await mxGet("/detail/nextVideo", {
    type: contentType,
    id
  });

  return response.json;
}

/*
 * Season episode list
 */

async function seasonEpisodes(seasonId) {
  const all = [];

  let page = 0;
  const pageSize = 50;

  while (page < 10) {
    const response = await mxGet(
      "/detail/tab/tvshowepisodes",
      {
        type: "season",
        id: seasonId,
        sortOrder: "0",
        pageNum: String(page),
        pageSize: String(pageSize)
      }
    );

    const json = response.json;

    const containers =
      json?.containers ||
      json?.data?.containers ||
      json?.results ||
      json?.data?.results ||
      [];

    if (!Array.isArray(containers) || containers.length === 0) {
      break;
    }

    all.push(...containers);

    if (containers.length < pageSize) {
      break;
    }

    page++;
  }

  return all;
}

/*
 * Recursively find objects in arbitrary MX JSON.
 */

function findObjects(value, predicate, found = []) {
  if (!value || typeof value !== "object") {
    return found;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      findObjects(item, predicate, found);
    }
    return found;
  }

  try {
    if (predicate(value)) {
      found.push(value);
    }
  } catch {}

  for (const child of Object.values(value)) {
    if (child && typeof child === "object") {
      findObjects(child, predicate, found);
    }
  }

  return found;
}

/*
 * Extract an ID from MX nextVideo/detail responses.
 */

function extractEpisodeObject(json) {
  if (!json) return null;

  const candidates = findObjects(
    json,
    (obj) => {
      return (
        typeof obj.id === "string" &&
        (
          obj.type === "episode" ||
          obj.subType === "episode" ||
          typeof obj.title === "string" ||
          typeof obj.name === "string"
        )
      );
    }
  );

  if (candidates.length) {
    return candidates[0];
  }

  return null;
}

/*
 * Find webUrl/page URL inside arbitrary MX JSON.
 */

function extractWebUrl(json) {
  const objects = findObjects(
    json,
    (obj) => {
      return (
        typeof obj.webUrl === "string" &&
        obj.webUrl.includes("mxplayer")
          ? true
          : typeof obj.webUrl === "string" &&
            obj.webUrl.includes("/show/")
      );
    }
  );

  if (objects.length) {
    return objects[0].webUrl;
  }

  return null;
}

/*
 * Resolve a video's HLS through the normal MX webpage.
 */

async function resolveEpisodePageStream(episode) {
  if (!episode) return null;

  const possibleUrls = [];

  if (episode.webUrl) {
    possibleUrls.push(episode.webUrl);
  }

  if (episode.url) {
    possibleUrls.push(episode.url);
  }

  if (episode.web_url) {
    possibleUrls.push(episode.web_url);
  }

  /*
   * Build a likely page from title + ID when MX gives us
   * an episode ID but no webUrl.
   */

  if (episode.id && episode.title) {
    const slug = String(episode.title)
      .toLowerCase()
      .replace(/&/g, "and")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    possibleUrls.push(
      `/show/watch-yeh-meri-family/season-2/${slug}-online-${episode.id}`
    );
  }

  for (const url of possibleUrls) {
    const stream = await resolveStreamFromPage(url);

    if (stream) {
      return stream;
    }
  }

  return null;
}

/*
 * Main resolver for Yeh Meri Family.
 */

async function resolveYmfEpisode(season, episode) {
  const key = `tt8595766:${season}:${episode}`;

  /*
   * 1. Verified hardcoded stream.
   */
  if (KNOWN_STREAMS[key]) {
    return {
      url: KNOWN_STREAMS[key],
      method: "known-stream"
    };
  }

  /*
   * We currently have verified Season 2.
   */
  const show = KNOWN_SHOWS.tt8595766;

  const seasonId = show?.seasons?.[season];

  if (!seasonId) {
    return null;
  }

  /*
   * 2. Get the season list.
   */
  let list;

  try {
    list = await seasonEpisodes(seasonId);
  } catch {
    list = [];
  }

  /*
   * The season endpoint gives container/reference IDs.
   * Do NOT assume those IDs are playable IDs.
   */

  const listedEpisode =
    list.find((item) => {
      const seq =
        item.sequence ??
        item.episodeNumber ??
        item.episode_number;

      return Number(seq) === Number(episode);
    }) ||
    list[Number(episode) - 1];

  /*
   * 3. Try the episode's listed page first.
   */
  if (listedEpisode) {
    const pageStream =
      await resolveEpisodePageStream(listedEpisode);

    if (pageStream) {
      return {
        url: pageStream,
        method: "season-page"
      };
    }
  }

  /*
   * 4. Discover the real episode ID using nextVideo.
   *
   * For S2E2 we verified:
   *
   * season list ID
   *   434578...
   *
   * nextVideo from E1
   *   43d578...
   */

  let currentId = null;

  if (episode === 1 && listedEpisode?.id) {
    currentId = listedEpisode.id;
  }

  if (!currentId && episode > 1) {
    const first =
      list.find((item) => {
        const seq =
          item.sequence ??
          item.episodeNumber ??
          item.episode_number;

        return Number(seq) === 1;
      }) || list[0];

    currentId = first?.id || null;

    if (currentId) {
      for (let n = 2; n <= episode; n++) {
        try {
          const response = await nextVideo(currentId);

          const next = extractEpisodeObject(response);

          if (!next?.id) {
            break;
          }

          currentId = next.id;

          /*
           * If this is the requested episode, immediately
           * try its webpage.
           */
          if (n === episode) {
            const stream =
              await resolveEpisodePageStream(next);

            if (stream) {
              return {
                url: stream,
                method: "nextVideo-page"
              };
            }

            /*
             * The nextVideo object may contain the actual
             * webUrl under a nested structure.
             */
            const webUrl = extractWebUrl(response);

            if (webUrl) {
              const webStream =
                await resolveStreamFromPage(webUrl);

              if (webStream) {
                return {
                  url: webStream,
                  method: "nextVideo-webUrl"
                };
              }
            }
          }
        } catch {
          break;
        }
      }
    }
  }

  /*
   * 5. Direct detail as a final normal API attempt.
   */
  if (currentId) {
    try {
      const detail = await detailVideo(currentId);

      /*
       * Search the complete response for an HLS URL.
       */
      const text = safeJson(detail);

      const urls = extractHlsUrls(text);

      const stream = chooseBestHls(urls);

      if (stream) {
        return {
          url: stream,
          method: "detail-api"
        };
      }

      const detailObject = extractEpisodeObject(detail);

      const pageStream =
        await resolveEpisodePageStream(detailObject);

      if (pageStream) {
        return {
          url: pageStream,
          method: "detail-page"
        };
      }
    } catch {}
  }

  return null;
}

/*
 * Generic resolver.
 */

async function resolveStream(videoId) {
  /*
   * IMDb movie:
   * tt1234567
   *
   * Series:
   * tt1234567:2:3
   */

  const match = String(videoId).match(
    /^(tt\d+):(\d+):(\d+)$/
  );

  if (match) {
    const imdbId = match[1];
    const season = Number(match[2]);
    const episode = Number(match[3]);

    /*
     * Yeh Meri Family.
     */
    if (imdbId === "tt8595766") {
      return resolveYmfEpisode(season, episode);
    }
  }

  /*
   * Known direct stream fallback.
   */
  if (KNOWN_STREAMS[videoId]) {
    return {
      url: KNOWN_STREAMS[videoId],
      method: "known-stream"
    };
  }

  return null;
}

/*
 * =========================
 * STREMIO MANIFEST
 * =========================
 */

const manifest = {
  id: "com.my.stremio.video",
  version: VERSION,
  name: "MX Player Resolver",
  description:
    "Resolves playable MX Player HLS streams for supported titles.",
  resources: [
    {
      name: "stream",
      types: ["movie", "series"],
      idPrefixes: ["tt"]
    }
  ],
  types: ["movie", "series"],
  catalogs: []
};

/*
 * Root
 */

app.get("/", (req, res) => {
  res.json({
    addon: "MX Player Resolver",
    version: VERSION,
    status: "online"
  });
});

/*
 * Health
 */

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    version: VERSION
  });
});

/*
 * Manifest
 */

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

/*
 * Stremio stream endpoint
 */

app.get("/stream/:type/:videoId.json", async (req, res) => {
  const { type, videoId } = req.params;

  console.log(
    `[STREAM] type=${type} videoId=${videoId}`
  );

  try {
    const result = await resolveStream(videoId);

    if (!result?.url) {
      console.log(
        `[STREAM] No stream found for ${videoId}`
      );

      return res.json({
        streams: []
      });
    }

    console.log(
      `[STREAM] Found via ${result.method}: ${result.url}`
    );

    res.json({
      streams: [
        {
          name: "MX Player",
          title: "MX Player HLS",
          url: result.url,
          notWebReady: true
        }
      ]
    });
  } catch (error) {
    console.error(
      `[STREAM ERROR] ${videoId}`,
      error
    );

    res.json({
      streams: []
    });
  }
});

/*
 * =========================
 * DEBUG ROUTES
 * =========================
 */

/*
 * Debug series
 */

app.get("/debug/series/:videoId", async (req, res) => {
  try {
    const videoId = req.params.videoId;

    if (videoId === "tt8595766") {
      return res.json({
        success: true,
        source: "known-show",
        data: KNOWN_SHOWS.tt8595766
      });
    }

    const result = await searchMx(videoId);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.status || null,
      raw: error.raw || null
    });
  }
});

/*
 * Debug season episodes
 */

app.get("/debug/episodes/:seasonId", async (req, res) => {
  try {
    const data =
      await seasonEpisodes(req.params.seasonId);

    res.json({
      success: true,
      count: data.length,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.status || null,
      raw: error.raw || null
    });
  }
});

/*
 * Debug detail
 */

app.get("/debug/detail/:id", async (req, res) => {
  try {
    const data =
      await detailVideo(req.params.id);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.status || null,
      raw: error.raw || null
    });
  }
});

/*
 * Debug nextVideo
 */

app.get("/debug/next/:id", async (req, res) => {
  try {
    const data =
      await nextVideo(req.params.id);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.status || null,
      raw: error.raw || null
    });
  }
});

/*
 * Debug SEO
 */

app.get("/debug/seo", async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({
        success: false,
        error: "Missing ?url="
      });
    }

    const data =
      await mxSeo(req.query.url);

    res.json({
      success: true,
      data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      status: error.status || null,
      raw: error.raw || null
    });
  }
});

/*
 * Debug actual MX webpage stream extraction.
 */

app.get("/debug/page-stream", async (req, res) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({
        success: false,
        error: "Missing ?url="
      });
    }

    const page = await fetchMxPage(req.query.url);
    const urls = extractHlsUrls(page.text);

    res.json({
      success: true,
      status: page.status,
      pageUrl: page.url,
      count: urls.length,
      streams: urls,
      selected: chooseBestHls(urls)
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/*
 * Debug full resolver.
 */

app.get("/debug/resolve/:videoId", async (req, res) => {
  try {
    const result =
      await resolveStream(req.params.videoId);

    res.json({
      success: !!result,
      videoId: req.params.videoId,
      result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      videoId: req.params.videoId,
      error: error.message
    });
  }
});

/*
 * Start
 */

app.listen(PORT, HOST, () => {
  console.log(
    `MX Player Resolver v${VERSION} listening on ${HOST}:${PORT}`
  );
});
