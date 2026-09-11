const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIG
// ============================================================

const MX_API = "https://api.mxplayer.in/v1/web";
const MX_SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

const CDN = "https://d3sgzbosmwirao.cloudfront.net";

const USER_ID =
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Safari/537.36";

// ============================================================
// MANIFEST
// ============================================================

const manifest = {
  id: "com.my.stremio.video",
  version: "1.1.0",
  name: "MX Player",
  description: "MX Player streams for Stremio",
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
// CORS
// ============================================================

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  next();
});

// ============================================================
// HELPERS
// ============================================================

function mxParams(extra = {}) {
  const params = new URLSearchParams();

  params.set("device-density", "2");
  params.set("platform", "com.mxplay.desktop");
  params.set("content-languages", "hi,en");
  params.set("kids-mode-enabled", "false");
  params.set("userid", USER_ID);

  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }

  return params;
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent": USER_AGENT,
      "Accept": "application/json, text/plain, */*",
      "Referer": "https://www.mxplayer.in/",
      "Origin": "https://www.mxplayer.in",
      ...(options.headers || {})
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid JSON response: ${text.slice(0, 300)}`
    );
  }
}

async function mxGet(path, params = {}) {
  const url =
    `${MX_API}${path}?${mxParams(params).toString()}`;

  console.log("MX GET:", path);

  return getJson(url);
}

async function mxPost(path, params = {}, body = {}) {
  const url =
    `${MX_API}${path}?${mxParams(params).toString()}`;

  console.log("MX POST:", path);

  return getJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

async function mxSeo(path) {
  const params = mxParams({
    url: path
  });

  const url =
    `${MX_SEO}/get-url-details?${params.toString()}`;

  console.log("MX SEO:", path);

  return getJson(url);
}

// ============================================================
// CINEMETA
// ============================================================

async function getMeta(type, id) {
  const url =
    `${CINEMETA}/${type}/${encodeURIComponent(id)}.json`;

  console.log("Cinemeta:", url);

  try {
    const data = await getJson(url);
    return data.meta || data;
  } catch (error) {
    console.log(
      "Cinemeta error:",
      error.message
    );

    return null;
  }
}

// ============================================================
// TITLE NORMALIZATION
// ============================================================

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleScore(wanted, candidate) {
  const a = normalizeTitle(wanted);
  const b = normalizeTitle(candidate);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 100;
  }

  if (b.includes(a)) {
    return 90;
  }

  if (a.includes(b)) {
    return 80;
  }

  const aw = new Set(a.split(" "));
  const bw = new Set(b.split(" "));

  let common = 0;

  for (const word of aw) {
    if (word.length >= 2 && bw.has(word)) {
      common++;
    }
  }

  return common * 10;
}

// ============================================================
// SEARCH
//
// IMPORTANT:
// MX's current search API is POST /search/resultv2.
// ============================================================

async function searchMX(query) {
  console.log(
    `Searching MX: "${query}"`
  );

  try {
    const data = await mxPost(
      "/search/resultv2",
      { query },
      {}
    );

    const items = extractContentItems(data);

    console.log(
      `MX search returned ${items.length} items`
    );

    return items;
  } catch (error) {
    console.log(
      "MX search failed:",
      error.message
    );

    return [];
  }
}

// Recursively find MX content objects.
function extractContentItems(root) {
  const results = [];
  const visited = new Set();

  function walk(value) {
    if (!value) {
      return;
    }

    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }

      return;
    }

    if (typeof value !== "object") {
      return;
    }

    if (visited.has(value)) {
      return;
    }

    visited.add(value);

    if (
      value.id &&
      value.title &&
      value.type
    ) {
      results.push(value);
    }

    for (const key of Object.keys(value)) {
      walk(value[key]);
    }
  }

  walk(root);

  const seen = new Set();

  return results.filter(item => {
    const key =
      `${item.type}:${item.id}`;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

// ============================================================
// FIND MX MOVIE / SHOW
// ============================================================

function chooseMovie(results, title) {
  const movies =
    results.filter(item =>
      String(item.type).toLowerCase() === "movie"
    );

  const pool =
    movies.length > 0
      ? movies
      : results;

  const ranked =
    pool
      .map(item => ({
        item,
        score: titleScore(title, item.title)
      }))
      .sort((a, b) => b.score - a.score);

  console.log(
    "Movie matches:",
    ranked.slice(0, 5).map(x => ({
      title: x.item.title,
      id: x.item.id,
      type: x.item.type,
      score: x.score
    }))
  );

  return ranked[0]?.item || null;
}

function chooseShow(results, title) {
  const shows =
    results.filter(item => {
      const type =
        String(item.type).toLowerCase();

      return (
        type === "tvshow" ||
        type === "series" ||
        type === "tv_show"
      );
    });

  const pool =
    shows.length > 0
      ? shows
      : results;

  const ranked =
    pool
      .map(item => ({
        item,
        score: titleScore(title, item.title)
      }))
      .sort((a, b) => b.score - a.score);

  console.log(
    "Show matches:",
    ranked.slice(0, 5).map(x => ({
      title: x.item.title,
      id: x.item.id,
      type: x.item.type,
      score: x.score,
      webUrl: x.item.webUrl
    }))
  );

  return ranked[0]?.item || null;
}

// ============================================================
// MX DETAIL
// ============================================================

async function getMXDetail(id, type) {
  return mxGet(
    "/detail/video",
    {
      id,
      type
    }
  );
}

// ============================================================
// STREAM EXTRACTION
// ============================================================

function extractHLS(stream) {
  if (!stream) {
    return null;
  }

  const hls =
    stream?.hls?.high ||
    stream?.hls?.base ||
    stream?.hls?.main ||
    stream?.thirdParty?.hlsUrl ||
    stream?.altBalaji?.hlsUrl ||
    stream?.mxplay?.hls?.high ||
    null;

  if (!hls) {
    return null;
  }

  if (
    typeof hls === "string" &&
    hls.startsWith("http")
  ) {
    return hls;
  }

  return `${CDN}/${String(hls).replace(/^\/+/, "")}`;
}

// ============================================================
// MOVIE RESOLVER
// ============================================================

async function resolveMovie(imdbId) {
  console.log("");
  console.log("==============================");
  console.log("MOVIE");
  console.log("IMDb:", imdbId);
  console.log("==============================");

  const meta =
    await getMeta("movie", imdbId);

  if (!meta?.name) {
    throw new Error(
      "Cinemeta movie metadata not found"
    );
  }

  const title = meta.name;

  console.log(
    "Movie title:",
    title
  );

  const results =
    await searchMX(title);

  if (!results.length) {
    throw new Error(
      `MX search returned no results for "${title}"`
    );
  }

  const match =
    chooseMovie(results, title);

  if (!match) {
    throw new Error(
      `MX movie not found: ${title}`
    );
  }

  console.log(
    "Selected MX movie:",
    match.title,
    match.id
  );

  const detail =
    await getMXDetail(
      match.id,
      "movie"
    );

  const hls =
    extractHLS(detail?.stream);

  if (!hls) {
    throw new Error(
      `MX movie has no HLS stream: ${match.title}`
    );
  }

  return {
    url: hls,
    title: match.title,
    mxId: match.id
  };
}

// ============================================================
// SERIES RESOLVER
// ============================================================

async function resolveSeries(stremioId) {
  console.log("");
  console.log("==============================");
  console.log("SERIES");
  console.log("Stremio ID:", stremioId);
  console.log("==============================");

  const parts =
    stremioId.split(":");

  if (parts.length < 3) {
    throw new Error(
      `Invalid series ID: ${stremioId}`
    );
  }

  const imdbId = parts[0];

  const seasonNumber =
    Number(parts[1]);

  const episodeNumber =
    Number(parts[2]);

  if (
    !Number.isFinite(seasonNumber) ||
    !Number.isFinite(episodeNumber)
  ) {
    throw new Error(
      `Invalid season/episode: ${stremioId}`
    );
  }

  console.log(
    `IMDb ${imdbId} -> S${seasonNumber}E${episodeNumber}`
  );

  const meta =
    await getMeta(
      "series",
      imdbId
    );

  if (!meta?.name) {
    throw new Error(
      "Cinemeta series metadata not found"
    );
  }

  const showTitle =
    meta.name;

  console.log(
    "Series title:",
    showTitle
  );

  // ----------------------------------------------------------
  // Find MX show
  // ----------------------------------------------------------

  const results =
    await searchMX(showTitle);

  if (!results.length) {
    throw new Error(
      `MX search returned no results for "${showTitle}"`
    );
  }

  const show =
    chooseShow(
      results,
      showTitle
    );

  if (!show) {
    throw new Error(
      `MX show not found: ${showTitle}`
    );
  }

  console.log(
    "Selected MX show:",
    show.title,
    show.id,
    show.type
  );

  // ----------------------------------------------------------
  // Find season
  // ----------------------------------------------------------

  const season =
    await findSeason(
      show,
      seasonNumber
    );

  if (!season) {
    throw new Error(
      `MX Season ${seasonNumber} not found for "${show.title}"`
    );
  }

  console.log(
    "Selected season:",
    season
  );

  // ----------------------------------------------------------
  // Find episode
  // ----------------------------------------------------------

  const episode =
    await findEpisode(
      season.id,
      episodeNumber
    );

  if (!episode) {
    throw new Error(
      `MX Episode S${seasonNumber}E${episodeNumber} not found`
    );
  }

  console.log(
    "Selected episode:",
    episode
  );

  // ----------------------------------------------------------
  // Get actual playable detail
  // ----------------------------------------------------------

  const detail =
    await getMXDetail(
      episode.id,
      "episode"
    );

  const hls =
    extractHLS(detail?.stream);

  if (!hls) {
    throw new Error(
      `MX episode has no HLS stream: ${episode.title || episode.id}`
    );
  }

  return {
    url: hls,
    title:
      `${showTitle} S${seasonNumber}E${episodeNumber}` +
      (episode.title
        ? ` — ${episode.title}`
        : ""),
    mxId: episode.id
  };
}

// ============================================================
// FIND SEASON
//
// We try several methods:
//
// 1. Search "show season N"
// 2. SEO resolver on show page
// 3. Search exact season title
//
// This avoids depending on Render receiving the full browser HTML.
// ============================================================

async function findSeason(show, wantedSeason) {
  const showTitle =
    show.title || "";

  // ----------------------------------------------------------
  // Method 1: search show + season
  // ----------------------------------------------------------

  const seasonQuery =
    `${showTitle} Season ${wantedSeason}`;

  console.log(
    "Looking for season:",
    seasonQuery
  );

  const seasonResults =
    await searchMX(seasonQuery);

  const seasonMatch =
    findSeasonInResults(
      seasonResults,
      wantedSeason
    );

  if (seasonMatch) {
    return seasonMatch;
  }

  // ----------------------------------------------------------
  // Method 2: SEO resolve show URL
  // ----------------------------------------------------------

  if (show.webUrl) {
    try {
      const path =
        getPath(show.webUrl);

      const seo =
        await mxSeo(path);

      const data =
        seo?.data;

      const dependency =
        data?.dependencies?.season;

      if (
        dependency?.id &&
        Number(dependency.season_no) === wantedSeason
      ) {
        return {
          id: dependency.id,
          title:
            dependency.name ||
            `Season ${wantedSeason}`,
          seasonNo:
            Number(dependency.season_no)
        };
      }

      // Sometimes the SEO resolver returns
      // the season dependency without season_no.
      if (
        dependency?.id &&
        wantedSeason === 1
      ) {
        return {
          id: dependency.id,
          title:
            dependency.name ||
            "Season 1",
          seasonNo: 1
        };
      }
    } catch (error) {
      console.log(
        "SEO season lookup failed:",
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // Method 3: search just "show Season N"
  // and inspect everything recursively.
  // ----------------------------------------------------------

  const exactResults =
    await searchMX(
      `${showTitle} ${wantedSeason}`
    );

  const exact =
    findSeasonInResults(
      exactResults,
      wantedSeason
    );

  if (exact) {
    return exact;
  }

  return null;
}

function findSeasonInResults(
  results,
  wantedSeason
) {
  for (const item of results) {
    const type =
      String(item.type || "")
        .toLowerCase();

    if (type !== "season") {
      continue;
    }

    const title =
      String(item.title || "");

    const match =
      title.match(
        /season\s*(\d+)/i
      );

    if (
      match &&
      Number(match[1]) === wantedSeason
    ) {
      return {
        id: item.id,
        title,
        seasonNo: wantedSeason,
        webUrl: item.webUrl
      };
    }
  }

  return null;
}

// ============================================================
// FIND EPISODE
// ============================================================

async function findEpisode(
  seasonId,
  wantedEpisode
) {
  console.log(
    `Getting episodes for season ${seasonId}`
  );

  let next = null;

  for (let page = 0; page < 20; page++) {
    const params = {
      type: "season",
      id: seasonId,
      sortOrder: "0"
    };

    if (next) {
      const nextParams =
        new URLSearchParams(next);

      for (const [key, value] of nextParams) {
        params[key] = value;
      }
    }

    const data =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    const payload =
      data?.data ?? data;

    let items = [];

    if (Array.isArray(payload)) {
      items = payload;
    } else if (
      Array.isArray(payload?.items)
    ) {
      items = payload.items;
    }

    console.log(
      `Episode page ${page + 1}: ${items.length} items`
    );

    for (const item of items) {
      const number =
        Number(
          item.episodeNo ??
          item.episode_number ??
          item.sequence
        );

      if (
        number === wantedEpisode
      ) {
        return {
          id: item.id,
          title: item.title,
          episodeNo: number,
          webUrl: item.webUrl
        };
      }
    }

    next =
      payload?.next ||
      null;

    if (!next) {
      break;
    }
  }

  return null;
}

// ============================================================
// URL HELPER
// ============================================================

function getPath(urlOrPath) {
  if (
    String(urlOrPath).startsWith("http")
  ) {
    return new URL(urlOrPath).pathname;
  }

  return String(urlOrPath);
}

// ============================================================
// STREAM ROUTE
// ============================================================

app.get(
  "/stream/:type/:id.json",
  async (req, res) => {
    const type =
      req.params.type;

    const id =
      decodeURIComponent(req.params.id);

    console.log("");
    console.log("################################");
    console.log("STREMIO STREAM REQUEST");
    console.log("Type:", type);
    console.log("ID:", id);
    console.log("################################");

    try {
      let result;

      if (type === "movie") {
        result =
          await resolveMovie(id);
      } else if (type === "series") {
        result =
          await resolveSeries(id);
      } else {
        return res.json({
          streams: []
        });
      }

      console.log(
        "SUCCESS:",
        result.url
      );

      return res.json({
        streams: [
          {
            name: "MX Player",
            title: result.title,
            url: result.url,
            behaviorHints: {
              notWebReady: true
            }
          }
        ]
      });

    } catch (error) {
      console.error(
        "RESOLVER ERROR:",
        error.message
      );

      return res.json({
        streams: []
      });
    }
  }
);

// ============================================================
// DEBUG ROUTE
// ============================================================

app.get(
  "/debug/movie/:id",
  async (req, res) => {
    try {
      const result =
        await resolveMovie(
          decodeURIComponent(req.params.id)
        );

      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message
      });
    }
  }
);

app.get(
  "/debug/series/:id",
  async (req, res) => {
    try {
      const result =
        await resolveSeries(
          decodeURIComponent(req.params.id)
        );

      res.json({
        success: true,
        result
      });
    } catch (error) {
      res.json({
        success: false,
        error: error.message
      });
    }
  }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {
    res.json({
      ok: true,
      addon: "MX Player",
      version: manifest.version
    });
  }
);

// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (req, res) => {
    res.json(manifest);
  }
);

// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (req, res) => {
    res.send(`
      <h2>MX Player Stremio Addon</h2>
      <p>Running.</p>
      <ul>
        <li><a href="/manifest.json">Manifest</a></li>
        <li><a href="/health">Health</a></li>
      </ul>
    `);
  }
);

// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `MX Player Stremio addon running on port ${PORT}`
    );

    console.log(
      `Anonymous MX user: ${USER_ID}`
    );
  }
);
