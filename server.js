const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================================
// CONFIG
// ============================================================

const MX_API = "https://api.mxplayer.in/v1/web";
const MX_SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

const MX_CDN = "https://d3sgzbosmwirao.cloudfront.net";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Safari/537.36";

// Generate one anonymous UUID when the server starts.
const USER_ID = cryptoRandomUUID();

// ============================================================
// MANIFEST
// ============================================================

const manifest = {
  id: "com.my.stremio.video",
  version: "2.0.0",
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
  res.setHeader(
    "Access-Control-Allow-Origin",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Headers",
    "*"
  );

  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

// ============================================================
// UUID
// ============================================================

function cryptoRandomUUID() {
  if (
    globalThis.crypto &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    .replace(/[xy]/g, c => {
      const r =
        Math.random() * 16 | 0;

      const v =
        c === "x"
          ? r
          : (r & 0x3) | 0x8;

      return v.toString(16);
    });
}

// ============================================================
// MX COMMON PARAMETERS
// ============================================================

function mxParams(extra = {}) {
  const params =
    new URLSearchParams();

  params.set(
    "device-density",
    "2"
  );

  params.set(
    "platform",
    "com.mxplay.desktop"
  );

  params.set(
    "content-languages",
    "hi,en"
  );

  params.set(
    "kids-mode-enabled",
    "false"
  );

  params.set(
    "userid",
    USER_ID
  );

  for (
    const [key, value]
    of Object.entries(extra)
  ) {
    if (
      value !== undefined &&
      value !== null
    ) {
      params.set(
        key,
        String(value)
      );
    }
  }

  return params;
}

// ============================================================
// HTTP JSON
// ============================================================

async function getJson(
  url,
  options = {}
) {
  const response =
    await fetch(
      url,
      {
        ...options,

        headers: {
          "User-Agent": USER_AGENT,

          "Accept":
            "application/json, text/plain, */*",

          "Referer":
            "https://www.mxplayer.in/",

          "Origin":
            "https://www.mxplayer.in",

          ...(options.headers || {})
        }
      }
    );

  const text =
    await response.text();

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

// ============================================================
// MX GET
// ============================================================

async function mxGet(
  path,
  extra = {}
) {
  const url =
    `${MX_API}${path}?` +
    mxParams(extra).toString();

  console.log(
    "MX GET:",
    path
  );

  return getJson(url);
}

// ============================================================
// MX POST
// ============================================================

async function mxPost(
  path,
  extra = {},
  body = {}
) {
  const url =
    `${MX_API}${path}?` +
    mxParams(extra).toString();

  console.log(
    "MX POST:",
    path
  );

  return getJson(
    url,
    {
      method: "POST",

      headers: {
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(body)
    }
  );
}

// ============================================================
// MX SEO
// ============================================================

async function mxSeo(
  path
) {
  const cleanPath =
    path.startsWith("http")
      ? new URL(path).pathname
      : path;

  const url =
    `${MX_SEO}/get-url-details?` +
    mxParams({
      url: cleanPath
    }).toString();

  console.log(
    "MX SEO:",
    cleanPath
  );

  return getJson(url);
}

// ============================================================
// CINEMETA
// ============================================================

async function getMeta(
  type,
  id
) {
  const url =
    `${CINEMETA}/${type}/${encodeURIComponent(id)}.json`;

  console.log(
    "Cinemeta:",
    url
  );

  try {
    const data =
      await getJson(url);

    return (
      data?.meta ||
      data
    );
  } catch (error) {
    console.log(
      "Cinemeta error:",
      error.message
    );

    return null;
  }
}

// ============================================================
// TITLE HELPERS
// ============================================================

function normalizeTitle(
  value
) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^\p{L}\p{N}]+/gu,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}

function titleWords(
  value
) {
  return new Set(
    normalizeTitle(value)
      .split(" ")
      .filter(
        word => word.length >= 2
      )
  );
}

function titleScore(
  wanted,
  candidate
) {
  const a =
    normalizeTitle(wanted);

  const b =
    normalizeTitle(candidate);

  if (!a || !b) {
    return 0;
  }

  if (a === b) {
    return 100;
  }

  if (
    b.includes(a) ||
    a.includes(b)
  ) {
    return 90;
  }

  const aw =
    titleWords(wanted);

  const bw =
    titleWords(candidate);

  if (!aw.size || !bw.size) {
    return 0;
  }

  let common = 0;

  for (
    const word of aw
  ) {
    if (bw.has(word)) {
      common++;
    }
  }

  return Math.round(
    (common / aw.size) * 70
  );
}

// ============================================================
// SEARCH RESULT EXTRACTION
// ============================================================

function extractItemsFromSections(
  data
) {
  const sections =
    Array.isArray(data)
      ? data
      : (
          data?.sections ||
          data?.data?.sections ||
          []
        );

  const results = [];
  const seen =
    new Set();

  for (
    const section of sections
  ) {
    const items =
      section?.items || [];

    if (!Array.isArray(items)) {
      continue;
    }

    for (
      const item of items
    ) {
      if (!item?.id) {
        continue;
      }

      const key =
        `${item.type || ""}:${item.id}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push(item);
    }
  }

  return results;
}

// ============================================================
// MX SEARCH
//
// Current MX client uses:
//   /search/suggest
//   /search/resultv2 (POST)
//
// We use resultv2 first because it returns actual result items.
// ============================================================

async function searchMX(
  query
) {
  console.log(
    `Searching MX: "${query}"`
  );

  // ----------------------------------------------------------
  // resultv2
  // ----------------------------------------------------------

  try {
    const data =
      await mxPost(
        "/search/resultv2",
        {
          query
        },
        {}
      );

    const results =
      extractItemsFromSections(
        data
      );

    if (results.length) {
      console.log(
        `MX resultv2 returned ${results.length} items`
      );

      return results;
    }
  } catch (error) {
    console.log(
      "MX resultv2 failed:",
      error.message
    );
  }

  // ----------------------------------------------------------
  // suggest
  // ----------------------------------------------------------

  try {
    const data =
      await mxGet(
        "/search/suggest",
        {
          query
        }
      );

    const results =
      extractItemsFromSections(
        data
      );

    if (results.length) {
      console.log(
        `MX suggest returned ${results.length} items`
      );

      return results;
    }

    // Some versions may return suggestions directly.
    if (Array.isArray(data)) {
      return data.filter(
        item =>
          item &&
          item.id &&
          item.title
      );
    }

    if (
      Array.isArray(data?.data)
    ) {
      return data.data.filter(
        item =>
          item &&
          item.id &&
          item.title
      );
    }
  } catch (error) {
    console.log(
      "MX suggest failed:",
      error.message
    );
  }

  return [];
}

// ============================================================
// FIND EXACT MOVIE
// ============================================================

function chooseMovie(
  results,
  wantedTitle
) {
  const movies =
    results.filter(
      item =>
        String(item.type || "")
          .toLowerCase() ===
        "movie"
    );

  console.log(
    "Movie candidates:",
    movies.map(
      item => ({
        title: item.title,
        id: item.id,
        type: item.type,
        score:
          titleScore(
            wantedTitle,
            item.title
          )
      })
    )
  );

  // Exact title is always preferred.
  const exact =
    movies.find(
      item =>
        normalizeTitle(
          item.title
        ) ===
        normalizeTitle(
          wantedTitle
        )
    );

  if (exact) {
    return exact;
  }

  const ranked =
    movies
      .map(item => ({
        item,
        score:
          titleScore(
            wantedTitle,
            item.title
          )
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  // Do NOT choose unrelated content.
  if (
    ranked.length &&
    ranked[0].score >= 80
  ) {
    return ranked[0].item;
  }

  return null;
}

// ============================================================
// FIND EXACT SHOW
// ============================================================

function chooseShow(
  results,
  wantedTitle
) {
  const shows =
    results.filter(
      item => {
        const type =
          String(
            item.type || ""
          ).toLowerCase();

        return (
          type === "tvshow" ||
          type === "tv_show" ||
          type === "series"
        );
      }
    );

  console.log(
    "TV show candidates:",
    shows.map(
      item => ({
        title: item.title,
        id: item.id,
        type: item.type,
        score:
          titleScore(
            wantedTitle,
            item.title
          ),
        webUrl:
          item.webUrl
      })
    )
  );

  // Exact match first.
  const exact =
    shows.find(
      item =>
        normalizeTitle(
          item.title
        ) ===
        normalizeTitle(
          wantedTitle
        )
    );

  if (exact) {
    return exact;
  }

  const ranked =
    shows
      .map(item => ({
        item,
        score:
          titleScore(
            wantedTitle,
            item.title
          )
      }))
      .sort(
        (a, b) =>
          b.score - a.score
      );

  // Require a strong match.
  if (
    ranked.length &&
    ranked[0].score >= 80
  ) {
    return ranked[0].item;
  }

  return null;
}

// ============================================================
// MX DETAIL
// ============================================================

async function getMXDetail(
  id,
  type
) {
  return mxGet(
    "/detail/video",
    {
      type,
      id
    }
  );
}

// ============================================================
// HLS EXTRACTION
// ============================================================

function extractHLS(
  stream
) {
  if (!stream) {
    return null;
  }

  if (
    stream.drmProtect === true
  ) {
    console.log(
      "MX stream is DRM protected."
    );

    return null;
  }

  const hlsData =
    stream.hls || {};

  const thirdParty =
    stream.thirdParty || {};

  const altBalaji =
    stream.altBalaji || {};

  const mxplay =
    stream.mxplay || {};

  let hls =
    hlsData.high ||
    hlsData.base ||
    hlsData.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    mxplay?.hls?.high ||
    null;

  if (!hls) {
    return null;
  }

  hls =
    String(hls);

  if (
    hls.startsWith("http://") ||
    hls.startsWith("https://")
  ) {
    return hls;
  }

  return (
    MX_CDN +
    "/" +
    hls.replace(
      /^\/+/,
      ""
    )
  );
}

// ============================================================
// MOVIE RESOLVER
// ============================================================

async function resolveMovie(
  imdbId
) {
  console.log("");
  console.log(
    "=============================="
  );
  console.log(
    "MOVIE RESOLUTION"
  );
  console.log(
    "IMDb:",
    imdbId
  );
  console.log(
    "=============================="
  );

  const meta =
    await getMeta(
      "movie",
      imdbId
    );

  if (!meta?.name) {
    throw new Error(
      "Cinemeta movie metadata not found"
    );
  }

  const movieTitle =
    meta.name;

  console.log(
    "Movie:",
    movieTitle
  );

  const results =
    await searchMX(
      movieTitle
    );

  if (!results.length) {
    throw new Error(
      `MX search returned no results for "${movieTitle}"`
    );
  }

  const movie =
    chooseMovie(
      results,
      movieTitle
    );

  if (!movie) {
    throw new Error(
      `No safe MX movie match for "${movieTitle}"`
    );
  }

  console.log(
    "Selected MX movie:",
    movie.title,
    movie.id
  );

  const detail =
    await getMXDetail(
      movie.id,
      "movie"
    );

  if (
    detail?.error
  ) {
    throw new Error(
      detail.detail ||
      "MX movie detail failed"
    );
  }

  const hls =
    extractHLS(
      detail?.stream
    );

  if (!hls) {
    throw new Error(
      `MX movie has no usable HLS stream: ${movie.title}`
    );
  }

  return {
    url: hls,

    title:
      movie.title,

    mxId:
      movie.id
  };
}

// ============================================================
// SERIES RESOLVER
//
// Stremio:
//   tt1234567:2:1
// ============================================================

async function resolveSeries(
  stremioId
) {
  console.log("");
  console.log(
    "=============================="
  );
  console.log(
    "SERIES RESOLUTION"
  );
  console.log(
    "Stremio ID:",
    stremioId
  );
  console.log(
    "=============================="
  );

  const parts =
    stremioId.split(":");

  if (
    parts.length !== 3
  ) {
    throw new Error(
      `Invalid series ID: ${stremioId}`
    );
  }

  const imdbId =
    parts[0];

  const seasonNumber =
    Number(parts[1]);

  const episodeNumber =
    Number(parts[2]);

  if (
    !/^tt\d+$/i.test(
      imdbId
    )
  ) {
    throw new Error(
      `Invalid IMDb ID: ${imdbId}`
    );
  }

  if (
    !Number.isInteger(
      seasonNumber
    ) ||
    seasonNumber < 1
  ) {
    throw new Error(
      `Invalid season: ${parts[1]}`
    );
  }

  if (
    !Number.isInteger(
      episodeNumber
    ) ||
    episodeNumber < 1
  ) {
    throw new Error(
      `Invalid episode: ${parts[2]}`
    );
  }

  console.log(
    `IMDb ${imdbId} -> S${seasonNumber}E${episodeNumber}`
  );

  // ----------------------------------------------------------
  // Get show metadata
  // ----------------------------------------------------------

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
    "Series:",
    showTitle
  );

  // ----------------------------------------------------------
  // Find MX show
  // ----------------------------------------------------------

  const show =
    await findMXShow(
      showTitle
    );

  if (!show) {
    throw new Error(
      `No safe MX show match for "${showTitle}"`
    );
  }

  console.log(
    "Selected MX show:",
    show.title,
    show.id,
    show.type
  );

  // ----------------------------------------------------------
  // Find requested season
  // ----------------------------------------------------------

  const season =
    await findMXSeason(
      show,
      seasonNumber
    );

  if (!season) {
    throw new Error(
      `MX Season ${seasonNumber} not found for "${show.title}"`
    );
  }

  console.log(
    "Selected MX season:",
    season
  );

  // ----------------------------------------------------------
  // Find requested episode
  // ----------------------------------------------------------

  const episode =
    await findMXEpisode(
      season.id,
      episodeNumber
    );

  if (!episode) {
    throw new Error(
      `MX Episode S${seasonNumber}E${episodeNumber} not found`
    );
  }

  console.log(
    "Selected MX episode:",
    episode
  );

  // ----------------------------------------------------------
  // Get actual playable episode detail
  // ----------------------------------------------------------

  const detail =
    await getMXDetail(
      episode.id,
      "episode"
    );

  if (
    detail?.error
  ) {
    throw new Error(
      detail.detail ||
      "MX episode detail failed"
    );
  }

  const hls =
    extractHLS(
      detail?.stream
    );

  if (!hls) {
    throw new Error(
      `MX episode has no usable HLS stream: ${
        episode.title ||
        episode.id
      }`
    );
  }

  return {
    url: hls,

    title:
      `${showTitle} S${seasonNumber}E${episodeNumber}` +
      (
        episode.title
          ? ` — ${episode.title}`
          : ""
      ),

    mxId:
      episode.id
  };
}

// ============================================================
// FIND MX SHOW
// ============================================================

async function findMXShow(
  showTitle
) {
  // First search exact title.
  const results =
    await searchMX(
      showTitle
    );

  let show =
    chooseShow(
      results,
      showTitle
    );

  if (show) {
    return show;
  }

  // Second attempt: title in quotes is unnecessary
  // for the API, but this gives a second query.
  const secondResults =
    await searchMX(
      `${showTitle}`
    );

  show =
    chooseShow(
      secondResults,
      showTitle
    );

  return show;
}

// ============================================================
// FIND MX SEASON
// ============================================================

async function findMXSeason(
  show,
  wantedSeason
) {
  const showTitle =
    show.title || "";

  // ----------------------------------------------------------
  // METHOD 1
  //
  // Search directly for:
  // "Yeh Meri Family Season 2"
  // ----------------------------------------------------------

  const seasonQuery =
    `${showTitle} Season ${wantedSeason}`;

  console.log(
    "Season search:",
    seasonQuery
  );

  const results =
    await searchMX(
      seasonQuery
    );

  const directSeason =
    findSeasonResult(
      results,
      wantedSeason
    );

  if (directSeason) {
    return directSeason;
  }

  // ----------------------------------------------------------
  // METHOD 2
  //
  // Ask SEO about the show's web URL.
  // ----------------------------------------------------------

  if (show.webUrl) {
    try {
      const seo =
        await mxSeo(
          show.webUrl
        );

      const data =
        seo?.data;

      if (data) {
        const dependencies =
          data.dependencies ||
          {};

        const season =
          dependencies.season;

        if (
          season?.id &&
          Number(
            season.season_no
          ) === wantedSeason
        ) {
          return {
            id:
              season.id,

            title:
              season.name ||
              `Season ${wantedSeason}`,

            seasonNo:
              wantedSeason,

            webUrl:
              season.url
          };
        }

        // If SEO gives a redirect to a season,
        // resolve that too.
        if (
          data.redirect &&
          String(
            data.redirect
          ).includes("/seasons/")
        ) {
          const seo2 =
            await mxSeo(
              data.redirect
            );

          const season2 =
            seo2?.data
              ?.dependencies
              ?.season;

          if (
            season2?.id &&
            Number(
              season2.season_no
            ) === wantedSeason
          ) {
            return {
              id:
                season2.id,

              title:
                season2.name ||
                `Season ${wantedSeason}`,

              seasonNo:
                wantedSeason,

              webUrl:
                season2.url
            };
          }
        }
      }
    } catch (error) {
      console.log(
        "SEO season lookup failed:",
        error.message
      );
    }
  }

  // ----------------------------------------------------------
  // METHOD 3
  //
  // Search again with just:
  // "show 2"
  // ----------------------------------------------------------

  const fallbackResults =
    await searchMX(
      `${showTitle} ${wantedSeason}`
    );

  const fallback =
    findSeasonResult(
      fallbackResults,
      wantedSeason
    );

  if (fallback) {
    return fallback;
  }

  return null;
}

// ============================================================
// FIND SEASON IN SEARCH RESULTS
// ============================================================

function findSeasonResult(
  results,
  wantedSeason
) {
  for (
    const item of results
  ) {
    const type =
      String(
        item.type || ""
      ).toLowerCase();

    if (
      type !== "season"
    ) {
      continue;
    }

    const title =
      String(
        item.title || ""
      );

    const match =
      title.match(
        /\bseason\s*(\d+)\b/i
      );

    if (
      match &&
      Number(match[1]) ===
        wantedSeason
    ) {
      return {
        id:
          item.id,

        title:
          item.title,

        seasonNo:
          wantedSeason,

        webUrl:
          item.webUrl
      };
    }

    // Some MX responses may provide season number separately.
    const number =
      Number(
        item.seasonNo ??
        item.season_number ??
        item.sequence
      );

    if (
      number === wantedSeason
    ) {
      return {
        id:
          item.id,

        title:
          item.title ||
          `Season ${wantedSeason}`,

        seasonNo:
          wantedSeason,

        webUrl:
          item.webUrl
      };
    }
  }

  return null;
}

// ============================================================
// FIND MX EPISODE
// ============================================================

async function findMXEpisode(
  seasonId,
  wantedEpisode
) {
  console.log(
    "Getting MX episodes:",
    seasonId
  );

  let next =
    null;

  // Maximum 20 pages as a safety limit.
  for (
    let page = 0;
    page < 20;
    page++
  ) {
    const params = {
      type:
        "season",

      id:
        seasonId,

      sortOrder:
        "0"
    };

    // MX's next token is a query-string style value.
    if (next) {
      try {
        const nextParams =
          new URLSearchParams(
            next
          );

        for (
          const [
            key,
            value
          ] of nextParams
        ) {
          params[key] =
            value;
        }
      } catch (error) {
        console.log(
          "Could not parse next token:",
          error.message
        );
      }
    }

    const data =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    if (
      data?.error
    ) {
      throw new Error(
        data.detail ||
        "MX episode list request failed"
      );
    }

    const payload =
      data?.data ??
      data;

    let items = [];

    if (
      Array.isArray(payload)
    ) {
      items =
        payload;
    } else if (
      Array.isArray(
        payload?.items
      )
    ) {
      items =
        payload.items;
    }

    console.log(
      `Episode page ${page + 1}: ${items.length} items`
    );

    for (
      const item of items
    ) {
      const number =
        Number(
          item.episodeNo ??
          item.episode_number ??
          item.sequence
        );

      if (
        number ===
        wantedEpisode
      ) {
        return {
          id:
            item.id,

          title:
            item.title,

          episodeNo:
            number,

          webUrl:
            item.webUrl
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
// DEBUG: MOVIE
// ============================================================

app.get(
  "/debug/movie/:id",
  async (
    req,
    res
  ) => {
    const id =
      decodeURIComponent(
        req.params.id
      );

    try {
      const result =
        await resolveMovie(
          id
        );

      return res.json({
        success:
          true,

        result
      });
    } catch (error) {
      return res.json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// DEBUG: SERIES
// ============================================================

app.get(
  "/debug/series/:id",
  async (
    req,
    res
  ) => {
    const id =
      decodeURIComponent(
        req.params.id
      );

    try {
      const result =
        await resolveSeries(
          id
        );

      return res.json({
        success:
          true,

        result
      });
    } catch (error) {
      return res.json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// STREAM ENDPOINT
// ============================================================

app.get(
  "/stream/:type/:id.json",
  async (
    req,
    res
  ) => {
    const type =
      req.params.type;

    const id =
      decodeURIComponent(
        req.params.id
      );

    console.log("");
    console.log(
      "########################################"
    );
    console.log(
      "STREMIO STREAM REQUEST"
    );
    console.log(
      "TYPE:",
      type
    );
    console.log(
      "ID:",
      id
    );
    console.log(
      "########################################"
    );

    try {
      let result;

      if (
        type === "movie"
      ) {
        result =
          await resolveMovie(
            id
          );
      } else if (
        type === "series"
      ) {
        result =
          await resolveSeries(
            id
          );
      } else {
        return res.json({
          streams: []
        });
      }

      console.log(
        "RESOLVED:",
        result.url
      );

      return res.json({
        streams: [
          {
            name:
              "MX Player",

            title:
              result.title,

            url:
              result.url,

            behaviorHints: {
              notWebReady:
                true
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
// HEALTH
// ============================================================

app.get(
  "/health",
  (
    req,
    res
  ) => {
    res.json({
      ok:
        true,

      addon:
        "MX Player",

      version:
        manifest.version
    });
  }
);

// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (
    req,
    res
  ) => {
    res.json(
      manifest
    );
  }
);

// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.send(`
      <!doctype html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>MX Player Stremio Addon</title>
        </head>

        <body>
          <h2>MX Player Stremio Addon</h2>

          <p>
            Running successfully.
          </p>

          <ul>
            <li>
              <a href="/manifest.json">
                Manifest
              </a>
            </li>

            <li>
              <a href="/health">
                Health
              </a>
            </li>
          </ul>
        </body>
      </html>
    `);
  }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      "========================================"
    );

    console.log(
      "MX Player Stremio addon started"
    );

    console.log(
      "Port:",
      PORT
    );

    console.log(
      "Version:",
      manifest.version
    );

    console.log(
      "Anonymous user:",
      USER_ID
    );

    console.log(
      "========================================"
    );
  }
);
