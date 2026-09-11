const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

const MX_API = "https://api.mxplayer.in/v1/web";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

// Keep our confirmed working stream as a temporary fallback/test.
const TEST_HLS =
  "https://d3sgzbosmwirao.cloudfront.net/video/637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218/3/hls/h264_high.m3u8";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  next();
});

const manifest = {
  id: "com.my.stremio.video",
  version: "1.0.0",
  name: "MX Player",
  description: "MX Player streams for Stremio",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

function mxUrl(path, params = {}) {
  const url = new URL(MX_API + path);

  url.searchParams.set("device-density", "2");
  url.searchParams.set("platform", "com.mxplay.desktop");
  url.searchParams.set("content-languages", "hi,en");
  url.searchParams.set("kids-mode-enabled", "false");

  // Anonymous user ID.
  url.searchParams.set(
    "userid",
    "00000000-0000-4000-8000-000000000001"
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
      Accept: "application/json, text/plain, */*",
      Referer: "https://www.mxplayer.in/",
      Origin: "https://www.mxplayer.in"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.json();
}

// ------------------------------------------------------------
// Cinemeta metadata
// ------------------------------------------------------------

async function getCinemeta(type, id) {
  const url = `${CINEMETA}/${type}/${encodeURIComponent(id)}.json`;

  try {
    const data = await fetchJson(url);
    return data.meta || data;
  } catch (error) {
    console.log("Cinemeta failed:", error.message);
    return null;
  }
}

// ------------------------------------------------------------
// MX search
// ------------------------------------------------------------

async function searchMX(query) {
  console.log("MX search:", query);

  try {
    // Primary search endpoint.
    const data = await fetchJson(
      mxUrl("/search/suggest", { query })
    );

    return extractSearchItems(data);
  } catch (error) {
    console.log("MX suggest failed:", error.message);
  }

  // Secondary search endpoint.
  try {
    const data = await fetchJson(
      mxUrl("/search/resultv2", { query })
    );

    return extractSearchItems(data);
  } catch (error) {
    console.log("MX resultv2 failed:", error.message);
  }

  return [];
}

function extractSearchItems(data) {
  const result = [];

  function collect(value) {
    if (!value) return;

    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object") {
          collect(item);
        }
      }
      return;
    }

    if (typeof value !== "object") return;

    // Looks like an MX content item.
    if (
      value.id &&
      value.title &&
      (
        value.type ||
        value.webUrl ||
        value.subType
      )
    ) {
      result.push(value);
    }

    for (const key of [
      "data",
      "items",
      "sections",
      "results",
      "contents"
    ]) {
      if (value[key]) {
        collect(value[key]);
      }
    }
  }

  collect(data);

  // Remove duplicates.
  const seen = new Set();

  return result.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

// ------------------------------------------------------------
// Find best MX result
// ------------------------------------------------------------

function normalizeTitle(title) {
  return String(title || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitle(target, candidate) {
  const a = normalizeTitle(target);
  const b = normalizeTitle(candidate);

  if (!a || !b) return 0;

  if (a === b) return 100;

  if (b.includes(a)) return 85;
  if (a.includes(b)) return 80;

  const aWords = new Set(a.split(" "));
  const bWords = new Set(b.split(" "));

  let common = 0;

  for (const word of aWords) {
    if (word.length >= 2 && bWords.has(word)) {
      common++;
    }
  }

  return common * 10;
}

function chooseBestResult(items, title, type) {
  if (!items.length) return null;

  const wantedType =
    type === "movie"
      ? ["movie", "movie"]
      : ["tvshow", "series"];

  const scored = items.map(item => {
    let score = scoreTitle(title, item.title);

    const itemType = String(item.type || "").toLowerCase();

    if (wantedType.includes(itemType)) {
      score += 30;
    }

    if (item.webUrl) {
      score += 5;
    }

    return {
      item,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  console.log(
    "MX candidates:",
    scored.slice(0, 5).map(x => ({
      title: x.item.title,
      type: x.item.type,
      id: x.item.id,
      score: x.score
    }))
  );

  return scored[0]?.item || null;
}

// ------------------------------------------------------------
// MX detail
// ------------------------------------------------------------

async function mxDetail(id, type) {
  const data = await fetchJson(
    mxUrl("/detail/video", {
      id,
      type
    })
  );

  return data;
}

function extractHls(stream) {
  if (!stream) return null;

  const hls =
    stream?.hls?.high ||
    stream?.hls?.base ||
    stream?.hls?.main ||
    stream?.thirdParty?.hlsUrl ||
    stream?.altBalaji?.hlsUrl ||
    stream?.mxplay?.hls?.high ||
    null;

  if (!hls) return null;

  if (hls.startsWith("http")) {
    return hls;
  }

  return "https://d3sgzbosmwirao.cloudfront.net/" + hls;
}

// ------------------------------------------------------------
// Resolve a movie
// ------------------------------------------------------------

async function resolveMovie(imdbId) {
  console.log("Resolving movie:", imdbId);

  const meta = await getCinemeta("movie", imdbId);

  if (!meta?.name) {
    throw new Error("Could not get movie metadata");
  }

  console.log("Movie title:", meta.name);

  const results = await searchMX(meta.name);

  const match = chooseBestResult(
    results,
    meta.name,
    "movie"
  );

  if (!match) {
    throw new Error(`MX movie not found: ${meta.name}`);
  }

  console.log(
    "MX movie:",
    match.title,
    match.id,
    match.type
  );

  const type = match.type || "movie";

  const detail = await mxDetail(match.id, type);

  const hls = extractHls(detail.stream);

  if (!hls) {
    throw new Error(
      `MX returned no HLS stream for ${match.title}`
    );
  }

  return {
    url: hls,
    title: match.title,
    id: match.id
  };
}

// ------------------------------------------------------------
// Resolve a series episode
// Stremio ID looks like:
// tt1234567:1:2
// ------------------------------------------------------------

async function resolveEpisode(stremioId) {
  const parts = stremioId.split(":");

  const imdbId = parts[0];
  const seasonNumber = Number(parts[1]);
  const episodeNumber = Number(parts[2]);

  if (
    !imdbId ||
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber)
  ) {
    throw new Error(
      `Invalid series ID: ${stremioId}`
    );
  }

  console.log(
    `Resolving series ${imdbId} S${seasonNumber}E${episodeNumber}`
  );

  const meta = await getCinemeta(
    "series",
    stremioId
  );

  const showTitle =
    meta?.name ||
    meta?.seriesInfo?.name;

  if (!showTitle) {
    throw new Error("Could not get series metadata");
  }

  console.log("Series title:", showTitle);

  // Search MX for the show.
  const results = await searchMX(showTitle);

  const match = chooseBestResult(
    results,
    showTitle,
    "series"
  );

  if (!match) {
    throw new Error(
      `MX series not found: ${showTitle}`
    );
  }

  console.log(
    "MX series:",
    match.title,
    match.id,
    match.type
  );

  // First try the MX show's firstVideo.
  let showDetail;

  try {
    showDetail = await mxDetail(
      match.id,
      match.type || "tvshow"
    );
  } catch (error) {
    console.log(
      "Show detail failed:",
      error.message
    );
  }

  // Some MX responses expose firstVideo.
  if (showDetail?.firstVideo?.id) {
    console.log(
      "MX firstVideo:",
      showDetail.firstVideo.id
    );
  }

  // Get the season list from the MX show page.
  const webUrl =
    match.webUrl ||
    showDetail?.webUrl;

  if (!webUrl) {
    throw new Error(
      "MX show has no webUrl"
    );
  }

  const seasonId =
    await findSeasonId(
      webUrl,
      seasonNumber
    );

  if (!seasonId) {
    throw new Error(
      `MX season ${seasonNumber} not found`
    );
  }

  console.log(
    `MX season ${seasonNumber}:`,
    seasonId
  );

  const episode =
    await findEpisode(
      seasonId,
      episodeNumber
    );

  if (!episode?.id) {
    throw new Error(
      `MX episode S${seasonNumber}E${episodeNumber} not found`
    );
  }

  console.log(
    "MX episode:",
    episode.id,
    episode.title
  );

  // Get the actual episode detail.
  const detail = await mxDetail(
    episode.id,
    "episode"
  );

  const hls = extractHls(detail.stream);

  if (!hls) {
    throw new Error(
      `MX returned no HLS for S${seasonNumber}E${episodeNumber}`
    );
  }

  return {
    url: hls,
    title:
      `${showTitle} S${seasonNumber}E${episodeNumber}`,
    id: episode.id
  };
}

// ------------------------------------------------------------
// Find season from MX show page
// ------------------------------------------------------------

async function findSeasonId(webUrl, wantedSeason) {
  const url = webUrl.startsWith("http")
    ? webUrl
    : `https://www.mxplayer.in${webUrl}`;

  console.log("MX show URL:", url);

  // Use MX SEO resolver.
  const seoUrl =
    "https://seo.mxplayer.in/v1/api/seo/get-url-details?" +
    new URLSearchParams({
      url: new URL(url).pathname,
      "device-density": "2",
      platform: "com.mxplay.desktop",
      "content-languages": "hi,en",
      "kids-mode-enabled": "false",
      userid: "00000000-0000-4000-8000-000000000001"
    }).toString();

  try {
    const seo = await fetchJson(seoUrl);

    const deps =
      seo?.data?.dependencies;

    const season =
      deps?.season;

    if (
      season?.id &&
      Number(season.season_no) === wantedSeason
    ) {
      return season.id;
    }

    // If SEO gives a season URL, try that.
    if (season?.id && !season.season_no) {
      return season.id;
    }
  } catch (error) {
    console.log(
      "SEO season lookup failed:",
      error.message
    );
  }

  // Fallback: inspect MX page data.
  try {
    const page = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36",
        Referer: "https://www.mxplayer.in/"
      }
    });

    const html = await page.text();

    const match =
      html.match(/__mxs__\s*=\s*(\{.*)/s);

    if (match) {
      const decoder = JSON.parse;

      try {
        const state =
          decoder(match[1]);

        const entities =
          state.entities || {};

        for (const entity of Object.values(entities)) {
          if (entity?.type !== "tvshow") continue;

          for (const tab of entity.tabs || []) {
            if (tab.type !== "tvshowepisodes") continue;

            for (const container of tab.containers || []) {
              if (
                container.type === "season" &&
                Number(
                  container.sequence ??
                  container.season_number ??
                  container.seasonNo
                ) === wantedSeason
              ) {
                return container.id;
              }
            }
          }
        }
      } catch (_) {}
    }
  } catch (error) {
    console.log(
      "MX page season lookup failed:",
      error.message
    );
  }

  return null;
}

// ------------------------------------------------------------
// Find episode inside MX season
// ------------------------------------------------------------

async function findEpisode(seasonId, episodeNumber) {
  const data = await fetchJson(
    mxUrl("/detail/tab/tvshowepisodes", {
      type: "season",
      id: seasonId,
      sortOrder: "0"
    })
  );

  let payload =
    data?.data ?? data;

  let items = [];

  if (Array.isArray(payload)) {
    items = payload;
  } else if (Array.isArray(payload?.items)) {
    items = payload.items;
  }

  // Try exact episode number.
  let episode = items.find(item =>
    Number(
      item.episodeNo ??
      item.episode_number
    ) === episodeNumber
  );

  if (episode) {
    return episode;
  }

  // Some APIs paginate. Follow next token once.
  const next = payload?.next;

  if (next) {
    try {
      const nextParams =
        new URLSearchParams(next);

      const nextData =
        await fetchJson(
          mxUrl(
            "/detail/tab/tvshowepisodes",
            {
              type: "season",
              id: seasonId,
              sortOrder: "0",
              ...Object.fromEntries(nextParams)
            }
          )
        );

      const nextPayload =
        nextData?.data ?? nextData;

      const nextItems =
        Array.isArray(nextPayload)
          ? nextPayload
          : Array.isArray(nextPayload?.items)
            ? nextPayload.items
            : [];

      episode = nextItems.find(item =>
        Number(
          item.episodeNo ??
          item.episode_number
        ) === episodeNumber
      );

      if (episode) {
        return episode;
      }
    } catch (error) {
      console.log(
        "Episode pagination failed:",
        error.message
      );
    }
  }

  return null;
}

// ------------------------------------------------------------
// Stremio stream endpoint
// ------------------------------------------------------------

app.get("/stream/:type/:id.json", async (req, res) => {
  const type = req.params.type;
  const id = decodeURIComponent(req.params.id);

  console.log("\n==============================");
  console.log("Stremio request");
  console.log("type:", type);
  console.log("id:", id);
  console.log("==============================");

  try {
    let result;

    if (type === "movie") {
      result = await resolveMovie(id);
    } else if (type === "series") {
      result = await resolveEpisode(id);
    } else {
      return res.json({ streams: [] });
    }

    console.log("Resolved HLS:", result.url);

    return res.json({
      streams: [
        {
          name: "MX Player",
          title: result.title,
          url: result.url
        }
      ]
    });
  } catch (error) {
    console.error(
      "RESOLUTION ERROR:",
      error.message
    );

    return res.json({
      streams: []
    });
  }
});

// ------------------------------------------------------------
// Debug endpoints
// ------------------------------------------------------------

app.get("/", (req, res) => {
  res.send(`
    <h2>MX Player Stremio Addon</h2>
    <p>Running.</p>
    <p><a href="/manifest.json">manifest.json</a></p>
  `);
});

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// Simple health check.
app.get("/health", (req, res) => {
  res.json({
    ok: true,
    addon: "MX Player",
    version: manifest.version
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `MX Player Stremio addon listening on port ${PORT}`
  );
});
