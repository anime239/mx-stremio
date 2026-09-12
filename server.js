const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// CONFIG
// ============================================================

const MX_API = "https://api.mxplayer.in/v1/web";
const MX_SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

const USER_ID = crypto.randomUUID();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36",

  Accept: "application/json, text/plain, */*",
  Referer: "https://www.mxplayer.in/",
  Origin: "https://www.mxplayer.in"
};

const MX_PARAMS = {
  "device-density": "2",
  platform: "com.mxplay.desktop",
  "content-languages": "hi,en",
  "kids-mode-enabled": "false",
  userid: USER_ID
};

// ============================================================
// MANIFEST
// ============================================================

const manifest = {
  id: "com.my.stremio.video",
  version: "2.1.0",
  name: "MX Player Resolver",
  description:
    "Resolves playable MX Player streams for movies and series episodes.",

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

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function get(obj, path, fallback = null) {
  try {
    let value = obj;

    for (const key of path.split(".")) {
      if (value == null) return fallback;
      value = value[key];
    }

    return value == null ? fallback : value;
  } catch {
    return fallback;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

// Recursively find objects matching a predicate.
function findObjects(root, predicate, limit = 1000) {
  const result = [];
  const seen = new Set();

  function walk(value) {
    if (result.length >= limit) return;
    if (value == null || typeof value !== "object") return;

    if (seen.has(value)) return;
    seen.add(value);

    if (!Array.isArray(value)) {
      try {
        if (predicate(value)) {
          result.push(value);
        }
      } catch {}
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
        if (result.length >= limit) return;
      }
    } else {
      for (const child of Object.values(value)) {
        walk(child);
        if (result.length >= limit) return;
      }
    }
  }

  walk(root);
  return result;
}

function getFirstString(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function getNumber(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}

function absoluteMXUrl(value) {
  if (!value || typeof value !== "string") return null;

  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return "https://d3sgzbosmwirao.cloudfront.net" + value;
  }

  return null;
}

// ============================================================
// HTTP HELPERS
// ============================================================

async function mxGet(path, params = {}) {
  const url = new URL(MX_API + path);

  const merged = {
    ...MX_PARAMS,
    ...params
  };

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "GET",
    headers: HEADERS
  });

  const text = await response.text();

  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `MX GET ${path} returned non-JSON (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(`MX GET ${path} HTTP ${response.status}`);
  }

  return json;
}

async function mxPost(path, params = {}, body = {}) {
  const url = new URL(MX_API + path);

  const merged = {
    ...MX_PARAMS,
    ...params
  };

  for (const [key, value] of Object.entries(merged)) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();

  let json = null;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `MX POST ${path} returned non-JSON (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(`MX POST ${path} HTTP ${response.status}`);
  }

  return json;
}

async function cinemeta(type, id) {
  const url =
    `${CINEMETA}/${type}/${encodeURIComponent(id)}.json`;

  const response = await fetch(url, {
    headers: {
      "User-Agent": HEADERS["User-Agent"],
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Cinemeta HTTP ${response.status}`);
  }

  return response.json();
}

// ============================================================
// CINEMETA
// ============================================================

async function getCinemetaMovie(imdbId) {
  const data = await cinemeta("movie", imdbId);

  if (!data?.meta) {
    throw new Error(`Cinemeta movie not found: ${imdbId}`);
  }

  return data.meta;
}

async function getCinemetaSeries(imdbId) {
  const data = await cinemeta("series", imdbId);

  if (!data?.meta) {
    throw new Error(`Cinemeta series not found: ${imdbId}`);
  }

  return data.meta;
}

// ============================================================
// MX SEARCH
// ============================================================

async function searchMX(query) {
  const cleanQuery = String(query || "").trim();

  if (!cleanQuery) return [];

  // Primary current search API
  try {
    const result = await mxPost(
      "/search/resultv2",
      {
        query: cleanQuery
      },
      {}
    );

    const candidates = findObjects(
      result,
      obj => {
        const id =
          obj.id ||
          obj.contentId ||
          obj.content_id;

        const title =
          obj.title ||
          obj.name ||
          obj.displayTitle;

        return (
          typeof id === "string" &&
          id.length >= 8 &&
          typeof title === "string" &&
          title.trim().length > 0
        );
      },
      500
    );

    if (candidates.length) {
      return candidates;
    }
  } catch (error) {
    console.log("search_resultv2 failed:", error.message);
  }

  return [];
}

// ============================================================
// FIND MX SHOW
// ============================================================

async function findMXShow(title) {
  const wanted = normalizeTitle(title);

  console.log("Searching MX show:", title);

  const queries = [
    title,
    `"${title}"`,
    `${title} series`
  ];

  let all = [];

  for (const query of queries) {
    const results = await searchMX(query);

    all.push(...results);

    const exact = results.find(item => {
      const itemTitle = getFirstString(item, [
        "title",
        "name",
        "displayTitle"
      ]);

      return normalizeTitle(itemTitle) === wanted;
    });

    if (exact) {
      console.log(
        "Exact MX show found:",
        exact.title || exact.name,
        exact.id
      );

      return exact;
    }

    await sleep(100);
  }

  // Remove duplicates
  const unique = [];
  const ids = new Set();

  for (const item of all) {
    const id =
      item.id ||
      item.contentId ||
      item.content_id;

    if (!id || ids.has(id)) continue;

    ids.add(id);
    unique.push(item);
  }

  // Strong title match
  const strong = unique.find(item => {
    const itemTitle = getFirstString(item, [
      "title",
      "name",
      "displayTitle"
    ]);

    const normalized = normalizeTitle(itemTitle);

    return (
      normalized === wanted ||
      normalized.includes(wanted) ||
      wanted.includes(normalized)
    );
  });

  if (strong) {
    console.log(
      "Strong MX show match:",
      strong.title || strong.name,
      strong.id
    );

    return strong;
  }

  console.log(
    "MX show candidates:",
    unique.slice(0, 10).map(x => ({
      title: x.title || x.name,
      id: x.id,
      type: x.type
    }))
  );

  throw new Error(`MX show not found for "${title}"`);
}

// ============================================================
// FIND MX SEASON
// ============================================================

async function findMXSeason(show, seasonNumber) {
  const showId =
    show.id ||
    show.contentId ||
    show.content_id;

  if (!showId) {
    throw new Error("MX show has no ID");
  }

  console.log(
    `Finding MX Season ${seasonNumber} for show ${showId}`
  );

  // ==========================================================
  // PRIMARY METHOD:
  // /detail/tab/tvshowseasons
  // ==========================================================

  const types = ["tv_show", "tvshow"];

  for (const type of types) {
    try {
      const result = await mxGet(
        "/detail/tab/tvshowseasons",
        {
          type,
          id: showId
        }
      );

      const seasonObjects = findObjects(
        result,
        obj => {
          const id =
            obj.id ||
            obj.contentId ||
            obj.content_id;

          const number = getNumber(obj, [
            "sequence",
            "season_number",
            "seasonNo",
            "season_no",
            "seasonNumber"
          ]);

          return (
            typeof id === "string" &&
            id.length >= 8 &&
            number !== null
          );
        },
        500
      );

      console.log(
        "Season API candidates:",
        seasonObjects.map(x => ({
          id: x.id,
          sequence:
            x.sequence ??
            x.season_number ??
            x.seasonNo ??
            x.season_no ??
            x.seasonNumber,
          title: x.title || x.name
        }))
      );

      const exact = seasonObjects.find(obj => {
        const number = getNumber(obj, [
          "sequence",
          "season_number",
          "seasonNo",
          "season_no",
          "seasonNumber"
        ]);

        return number === Number(seasonNumber);
      });

      if (exact) {
        console.log(
          `MX Season ${seasonNumber} found:`,
          exact.id
        );

        return exact;
      }
    } catch (error) {
      console.log(
        `Season endpoint ${type} failed:`,
        error.message
      );
    }
  }

  // ==========================================================
  // FALLBACK:
  // Search specifically for "Show Season N"
  // ==========================================================

  const queries = [
    `${show.title || show.name} Season ${seasonNumber}`,
    `${show.title || show.name} ${seasonNumber}`
  ];

  for (const query of queries) {
    try {
      const results = await searchMX(query);

      const season = results.find(item => {
        const number = getNumber(item, [
          "sequence",
          "season_number",
          "seasonNo",
          "season_no",
          "seasonNumber"
        ]);

        const title = normalizeTitle(
          item.title || item.name || ""
        );

        const expected = normalizeTitle(
          `${show.title || show.name} Season ${seasonNumber}`
        );

        return (
          number === Number(seasonNumber) ||
          title === expected ||
          (
            title.includes(normalizeTitle(show.title || show.name)) &&
            title.includes(`season ${seasonNumber}`)
          )
        );
      });

      if (season) {
        console.log(
          "Season found through search:",
          season.id
        );

        return season;
      }
    } catch (error) {
      console.log(
        "Season search failed:",
        error.message
      );
    }
  }

  throw new Error(
    `MX Season ${seasonNumber} not found for "${show.title || show.name}"`
  );
}

// ============================================================
// FIND EPISODE
// ============================================================

async function findMXEpisode(season, episodeNumber) {
  const seasonId =
    season.id ||
    season.contentId ||
    season.content_id;

  if (!seasonId) {
    throw new Error("MX season has no ID");
  }

  console.log(
    `Finding MX Episode ${episodeNumber} in season ${seasonId}`
  );

  const result = await mxGet(
    "/detail/tab/tvshowepisodes",
    {
      type: "season",
      id: seasonId,
      sortOrder: "0"
    }
  );

  const episodes = findObjects(
    result,
    obj => {
      const id =
        obj.id ||
        obj.contentId ||
        obj.content_id;

      const type = String(obj.type || "").toLowerCase();

      return (
        typeof id === "string" &&
        id.length >= 8 &&
        (
          type === "episode" ||
          type === "video" ||
          obj.sequence !== undefined ||
          obj.episode_number !== undefined ||
          obj.episodeNo !== undefined ||
          obj.episode_no !== undefined
        )
      );
    },
    1000
  );

  console.log(
    "Episode candidates:",
    episodes.slice(0, 20).map(x => ({
      id: x.id,
      title: x.title || x.name,
      type: x.type,
      sequence:
        x.sequence ??
        x.episode_number ??
        x.episodeNo ??
        x.episode_no
    }))
  );

  // Exact episode number
  const exact = episodes.find(ep => {
    const number = getNumber(ep, [
      "sequence",
      "episode_number",
      "episodeNo",
      "episode_no",
      "episodeNumber"
    ]);

    return number === Number(episodeNumber);
  });

  if (exact) {
    console.log(
      `MX Episode ${episodeNumber} found:`,
      exact.id
    );

    return exact;
  }

  // Sometimes sequence is absent but title contains "Episode 1"
  const byTitle = episodes.find(ep => {
    const title = String(
      ep.title ||
      ep.name ||
      ep.displayTitle ||
      ""
    ).toLowerCase();

    return (
      title.includes(`episode ${episodeNumber}`) ||
      title.includes(`ep ${episodeNumber}`)
    );
  });

  if (byTitle) {
    console.log(
      "Episode found through title:",
      byTitle.id
    );

    return byTitle;
  }

  throw new Error(
    `MX Episode ${episodeNumber} not found in season ${seasonId}`
  );
}

// ============================================================
// EPISODE DETAIL
// ============================================================

async function getMXEpisodeDetail(episodeId) {
  console.log("Getting MX episode detail:", episodeId);

  const result = await mxGet(
    "/detail/video",
    {
      type: "episode",
      id: episodeId
    }
  );

  return result;
}

// ============================================================
// EXTRACT HLS
// ============================================================

function extractHLS(root) {
  const urls = [];
  const seen = new Set();

  function add(value) {
    if (typeof value !== "string") return;

    const url = absoluteMXUrl(value);

    if (!url) return;

    if (!url.includes(".m3u8")) return;

    if (seen.has(url)) return;

    seen.add(url);
    urls.push(url);
  }

  function walk(value) {
    if (value == null) return;

    if (typeof value === "string") {
      add(value);
      return;
    }

    if (typeof value !== "object") return;

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }

      return;
    }

    for (const [key, child] of Object.entries(value)) {
      if (
        typeof child === "string" &&
        (
          key.toLowerCase().includes("hls") ||
          child.includes(".m3u8")
        )
      ) {
        add(child);
      }

      walk(child);
    }
  }

  // Prefer stream-related fields.
  const stream =
    root?.stream ||
    root?.data?.stream ||
    root?.data?.data?.stream;

  if (stream) {
    walk(stream);
  }

  // If the API structure differs, search the entire response.
  if (!urls.length) {
    walk(root);
  }

  return urls;
}

// ============================================================
// RESOLVE EPISODE
// ============================================================

async function resolveSeriesEpisode(imdbId, seasonNumber, episodeNumber) {
  console.log(
    `Resolving ${imdbId}:${seasonNumber}:${episodeNumber}`
  );

  // 1. Cinemeta
  const meta = await getCinemetaSeries(imdbId);

  const title = meta.name;

  if (!title) {
    throw new Error("Cinemeta returned no series title");
  }

  console.log("Cinemeta title:", title);

  // 2. MX show
  const show = await findMXShow(title);

  // 3. MX season
  const season = await findMXSeason(
    show,
    seasonNumber
  );

  // 4. MX episode
  const episode = await findMXEpisode(
    season,
    episodeNumber
  );

  const episodeId =
    episode.id ||
    episode.contentId ||
    episode.content_id;

  // 5. Episode detail
  const detail = await getMXEpisodeDetail(
    episodeId
  );

  // 6. HLS
  const hlsUrls = extractHLS(detail);

  if (!hlsUrls.length) {
    throw new Error(
      `MX episode has no HLS stream: ${
        episode.title ||
        episode.name ||
        `Episode ${episodeNumber}`
      }`
    );
  }

  console.log("HLS URLs found:", hlsUrls);

  return {
    meta,
    show,
    season,
    episode,
    detail,
    hlsUrls
  };
}

// ============================================================
// MOVIE RESOLVER
// ============================================================

async function resolveMovie(imdbId) {
  const meta = await getCinemetaMovie(imdbId);

  const title = meta.name;

  if (!title) {
    throw new Error("Cinemeta returned no movie title");
  }

  console.log("Resolving movie:", title);

  const results = await searchMX(title);

  const wanted = normalizeTitle(title);

  const movie = results.find(item => {
    const itemTitle = normalizeTitle(
      item.title ||
      item.name ||
      item.displayTitle ||
      ""
    );

    const type = String(
      item.type || ""
    ).toLowerCase();

    return (
      itemTitle === wanted &&
      (
        type === "movie" ||
        type === "video" ||
        type === "episode" ||
        type === ""
      )
    );
  });

  if (!movie) {
    throw new Error(
      `MX movie not found for "${title}"`
    );
  }

  const movieId =
    movie.id ||
    movie.contentId ||
    movie.content_id;

  const detail = await mxGet(
    "/detail/video",
    {
      type: movie.type || "movie",
      id: movieId
    }
  );

  const hlsUrls = extractHLS(detail);

  if (!hlsUrls.length) {
    throw new Error(
      `MX movie has no HLS stream: ${title}`
    );
  }

  return {
    meta,
    movie,
    detail,
    hlsUrls
  };
}

// ============================================================
// STREAM ROUTE
// ============================================================

app.get(
  "/stream/:type/:id.json",
  async (req, res) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "*"
    );

    const type = req.params.type;
    const id = decodeURIComponent(req.params.id);

    console.log(
      "=========================================="
    );

    console.log(
      "STREAM REQUEST:",
      type,
      id
    );

    try {
      // ------------------------------------------------------
      // SERIES
      // ------------------------------------------------------

      if (type === "series") {
        const match = id.match(
          /^(tt\d+):(\d+):(\d+)$/
        );

        if (!match) {
          console.log(
            "Invalid series ID:",
            id
          );

          return res.json({
            streams: []
          });
        }

        const imdbId = match[1];
        const seasonNumber = Number(match[2]);
        const episodeNumber = Number(match[3]);

        const result =
          await resolveSeriesEpisode(
            imdbId,
            seasonNumber,
            episodeNumber
          );

        const streams =
          result.hlsUrls.map(
            (url, index) => ({
              name:
                index === 0
                  ? "MX Player"
                  : "MX Player HLS",

              title:
                `${result.meta.name} S${seasonNumber}E${episodeNumber}`,

              url,

              behaviorHints: {
                notWebReady: true,
                bingeGroup: "mxplayer"
              }
            })
          );

        console.log(
          "RETURNING STREAMS:",
          streams
        );

        return res.json({
          streams
        });
      }

      // ------------------------------------------------------
      // MOVIE
      // ------------------------------------------------------

      if (type === "movie") {
        const result =
          await resolveMovie(id);

        const streams =
          result.hlsUrls.map(
            (url, index) => ({
              name:
                index === 0
                  ? "MX Player"
                  : "MX Player HLS",

              title:
                result.meta.name,

              url,

              behaviorHints: {
                notWebReady: true,
                bingeGroup: "mxplayer"
              }
            })
          );

        console.log(
          "RETURNING MOVIE STREAMS:",
          streams
        );

        return res.json({
          streams
        });
      }

      return res.json({
        streams: []
      });

    } catch (error) {
      console.error(
        "RESOLUTION ERROR:",
        error
      );

      return res.json({
        streams: []
      });
    }
  }
);

// ============================================================
// DEBUG SERIES
// ============================================================

app.get(
  "/debug/series/:id",
  async (req, res) => {
    const id = decodeURIComponent(req.params.id);

    try {
      const match = id.match(
        /^(tt\d+):(\d+):(\d+)$/
      );

      if (!match) {
        return res.json({
          success: false,
          error:
            "Expected IMDb series ID like tt8595766:2:1"
        });
      }

      const imdbId = match[1];
      const seasonNumber = Number(match[2]);
      const episodeNumber = Number(match[3]);

      const result =
        await resolveSeriesEpisode(
          imdbId,
          seasonNumber,
          episodeNumber
        );

      return res.json({
        success: true,

        request: {
          imdbId,
          seasonNumber,
          episodeNumber
        },

        cinemeta: {
          id: result.meta.id,
          name: result.meta.name,
          year: result.meta.year
        },

        mxShow: {
          id: result.show.id,
          title:
            result.show.title ||
            result.show.name,
          type: result.show.type
        },

        mxSeason: {
          id: result.season.id,
          title:
            result.season.title ||
            result.season.name,

          sequence:
            result.season.sequence ??
            result.season.season_number ??
            result.season.seasonNo ??
            result.season.season_no ??
            result.season.seasonNumber
        },

        mxEpisode: {
          id: result.episode.id,
          title:
            result.episode.title ||
            result.episode.name,

          sequence:
            result.episode.sequence ??
            result.episode.episode_number ??
            result.episode.episodeNo ??
            result.episode.episode_no
        },

        hlsUrls: result.hlsUrls
      });

    } catch (error) {
      return res.json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// DEBUG MX SEASONS
// ============================================================

app.get(
  "/debug/mx/seasons/:showId",
  async (req, res) => {
    const showId =
      decodeURIComponent(req.params.showId);

    try {
      const result =
        await mxGet(
          "/detail/tab/tvshowseasons",
          {
            type: "tv_show",
            id: showId
          }
        );

      return res.json({
        success: true,
        showId,
        result
      });

    } catch (error) {
      return res.json({
        success: false,
        showId,
        error: error.message
      });
    }
  }
);

// ============================================================
// DEBUG MX EPISODES
// ============================================================

app.get(
  "/debug/mx/episodes/:seasonId",
  async (req, res) => {
    const seasonId =
      decodeURIComponent(req.params.seasonId);

    try {
      const result =
        await mxGet(
          "/detail/tab/tvshowepisodes",
          {
            type: "season",
            id: seasonId,
            sortOrder: "0"
          }
        );

      return res.json({
        success: true,
        seasonId,
        result
      });

    } catch (error) {
      return res.json({
        success: false,
        seasonId,
        error: error.message
      });
    }
  }
);

// ============================================================
// DEBUG EPISODE DETAIL
// ============================================================

app.get(
  "/debug/mx/detail/:episodeId",
  async (req, res) => {
    const episodeId =
      decodeURIComponent(req.params.episodeId);

    try {
      const result =
        await getMXEpisodeDetail(
          episodeId
        );

      return res.json({
        success: true,
        episodeId,

        topLevelKeys:
          Object.keys(result || {}),

        stream:
          result?.stream || null,

        hlsUrls:
          extractHLS(result)
      });

    } catch (error) {
      return res.json({
        success: false,
        episodeId,
        error: error.message
      });
    }
  }
);

// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    addon: "MX Player Resolver",
    version: "2.1.0"
  });
});

// ============================================================
// MANIFEST
// ============================================================

app.get("/manifest.json", (req, res) => {
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.json(manifest);
});

// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {
  res.send(`
    <h2>MX Player Resolver</h2>
    <p>Addon is running.</p>

    <p>
      <a href="/manifest.json">
        Open manifest.json
      </a>
    </p>

    <p>
      <a href="/health">
        Open health
      </a>
    </p>

    <p>
      Test:
      /debug/series/tt8595766%3A2%3A1
    </p>
  `);
});

// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `MX Player Resolver running on port ${PORT}`
    );
  }
);
