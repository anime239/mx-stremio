const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADDON_BASE = "https://my-stremio-addon-q8ep.onrender.com";
const MX_API = "https://api.mxplayer.in/v1/web";
const MX_SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io";
const CDN = "https://d3sgzbosmwirao.cloudfront.net";

const VERSION = "15.0.0";
const MX_USER_ID = crypto.randomUUID();

const MX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.mxplayer.in/",
  Origin: "https://www.mxplayer.in"
};


/* ============================================================
   HTTP
   ============================================================ */

async function requestText(url, options = {}, timeout = 20000) {
  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    timeout
  );

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${text.slice(0, 300)}`
      );
    }

    return text;
  } finally {
    clearTimeout(timer);
  }
}


async function requestJson(url, options = {}, timeout = 20000) {
  const text = await requestText(
    url,
    options,
    timeout
  );

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Invalid JSON response from ${url}`
    );
  }
}


/* ============================================================
   MX REQUESTS
   ============================================================ */

function mxDefaults() {
  return {
    "device-density": "2",
    platform: "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: MX_USER_ID
  };
}


async function mxGet(path, params = {}) {
  const url = new URL(MX_API + path);

  for (const [key, value] of Object.entries({
    ...mxDefaults(),
    ...params
  })) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return requestJson(
    url.toString(),
    {
      method: "GET",
      headers: MX_HEADERS
    }
  );
}


async function mxPost(
  path,
  params = {},
  body = {}
) {
  const url = new URL(MX_API + path);

  for (const [key, value] of Object.entries({
    ...mxDefaults(),
    ...params
  })) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return requestJson(
    url.toString(),
    {
      method: "POST",
      headers: {
        ...MX_HEADERS,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    }
  );
}


/* ============================================================
   MX SEO
   ============================================================ */

function mxUrlPath(value) {
  if (!value) return null;

  try {
    const url = new URL(
      String(value),
      "https://www.mxplayer.in"
    );

    return url.pathname + url.search;
  } catch {
    return String(value);
  }
}


async function mxSeo(value) {
  const path = mxUrlPath(value);

  if (!path) return null;

  const url = new URL(
    `${MX_SEO}/get-url-details`
  );

  for (const [key, value2] of Object.entries({
    ...mxDefaults(),
    url: path
  })) {
    url.searchParams.set(
      key,
      String(value2)
    );
  }

  return requestJson(
    url.toString(),
    {
      method: "GET",
      headers: MX_HEADERS
    }
  );
}


/* ============================================================
   CINEMETA
   ============================================================ */

async function cinemeta(type, id) {
  return requestJson(
    `${CINEMETA}/meta/${type}/${encodeURIComponent(id)}.json`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0",
        Accept: "application/json"
      }
    }
  );
}


/* ============================================================
   GENERIC OBJECT HELPERS
   ============================================================ */

function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function titleScore(a, b) {
  const x = normalizeTitle(a);
  const y = normalizeTitle(b);

  if (!x || !y) return 0;

  if (x === y) return 100;

  if (
    x.includes(y) ||
    y.includes(x)
  ) {
    return 85;
  }

  const ax = new Set(x.split(" "));
  const ay = new Set(y.split(" "));

  let common = 0;

  for (const word of ax) {
    if (ay.has(word)) {
      common++;
    }
  }

  return Math.round(
    (common / Math.max(ax.size, ay.size)) * 70
  );
}


function collectObjects(
  value,
  output = [],
  seen = new Set()
) {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return output;
  }

  if (seen.has(value)) {
    return output;
  }

  seen.add(value);
  output.push(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      collectObjects(
        item,
        output,
        seen
      );
    }
  } else {
    for (const child of Object.values(value)) {
      if (
        child &&
        typeof child === "object"
      ) {
        collectObjects(
          child,
          output,
          seen
        );
      }
    }
  }

  return output;
}


function objectType(obj) {
  return String(
    obj?.type ??
    obj?.contentType ??
    obj?.content_type ??
    ""
  ).toLowerCase();
}


function objectWebUrl(obj) {
  const keys = [
    "webUrl",
    "webURL",
    "web_url",
    "url",
    "canonicalUrl",
    "canonicalURL"
  ];

  for (const key of keys) {
    if (
      obj &&
      obj[key] !== undefined &&
      obj[key] !== null
    ) {
      const value =
        String(obj[key]).trim();

      if (value) {
        return value;
      }
    }
  }

  return null;
}


/* ============================================================
   MX SEARCH
   ============================================================ */

async function mxSearchRaw(query) {
  const data = await mxPost(
    "/search/resultv2",
    { query },
    {}
  );

  return collectObjects(data).filter(
    item => {
      const type =
        objectType(item);

      return (
        item.id &&
        item.title &&
        [
          "movie",
          "tvshow",
          "season",
          "episode"
        ].includes(type)
      );
    }
  );
}


async function mxSearch(query) {
  const results =
    await mxSearchRaw(query);

  const map = new Map();

  for (const item of results) {
    const key =
      `${objectType(item)}:${item.id}`;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}


async function mxHomeSearch(query) {
  const data = await mxGet(
    "/home/tab/87c3ddc974dcf12294e9412bec44b097",
    {
      pageSize: "50"
    }
  );

  return collectObjects(data).filter(
    item => {
      const type =
        objectType(item);

      return (
        item.id &&
        item.title &&
        (
          type === "movie" ||
          type === "tvshow"
        ) &&
        titleScore(
          item.title,
          query
        ) >= 50
      );
    }
  );
}


/* ============================================================
   PICK MOVIE / SHOW
   ============================================================ */

function pickMovie(
  results,
  title,
  year
) {
  const movies =
    results.filter(
      item =>
        objectType(item) === "movie"
    );

  const scored =
    movies.map(item => {
      let score =
        titleScore(
          item.title,
          title
        );

      const itemYear =
        item.releaseDate
          ? String(
              item.releaseDate
            ).slice(0, 4)
          : item.year
            ? String(
                item.year
              ).slice(0, 4)
            : null;

      if (
        year &&
        itemYear &&
        String(year).slice(0, 4) ===
          itemYear
      ) {
        score += 25;
      }

      return {
        item,
        score
      };
    });

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  return (
    scored.length &&
    scored[0].score >= 50
  )
    ? scored[0].item
    : null;
}


function pickShow(
  results,
  title
) {
  const shows =
    results.filter(
      item =>
        objectType(item) === "tvshow"
    );

  const scored =
    shows.map(item => ({
      item,
      score:
        titleScore(
          item.title,
          title
        )
    }));

  scored.sort(
    (a, b) =>
      b.score - a.score
  );

  return (
    scored.length &&
    scored[0].score >= 50
  )
    ? scored[0].item
    : null;
}


/* ============================================================
   MX PAGE / __mxs__
   ============================================================ */

function extractBalancedJson(
  text,
  start
) {
  const first =
    text[start];

  if (
    first !== "{" &&
    first !== "["
  ) {
    return null;
  }

  const opening = first;
  const closing =
    first === "{"
      ? "}"
      : "]";

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (
    let i = start;
    i < text.length;
    i++
  ) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (
        ch === "\\"
      ) {
        escaped = true;
      } else if (
        ch === '"'
      ) {
        inString = false;
      }

      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === opening) {
      depth++;
    } else if (
      ch === closing
    ) {
      depth--;

      if (depth === 0) {
        return text.slice(
          start,
          i + 1
        );
      }
    }
  }

  return null;
}


function extractMxsState(html) {
  const patterns = [
    /window\.__mxs__\s*=\s*/,
    /__mxs__\s*=\s*/
  ];

  for (const pattern of patterns) {
    const match =
      pattern.exec(html);

    if (!match) {
      continue;
    }

    const begin =
      match.index +
      match[0].length;

    for (
      let i = begin;
      i < html.length;
      i++
    ) {
      if (
        html[i] !== "{" &&
        html[i] !== "["
      ) {
        continue;
      }

      const json =
        extractBalancedJson(
          html,
          i
        );

      if (!json) {
        break;
      }

      try {
        return JSON.parse(json);
      } catch {
        break;
      }
    }
  }

  return null;
}


async function fetchMxPage(webUrl) {
  const fullUrl =
    String(webUrl).startsWith("http")
      ? String(webUrl)
      : `https://www.mxplayer.in${webUrl}`;

  const html =
    await requestText(
      fullUrl,
      {
        headers: {
          "User-Agent":
            MX_HEADERS["User-Agent"],
          Referer:
            "https://www.mxplayer.in/"
        }
      }
    );

  return {
    fullUrl,
    html,
    state:
      extractMxsState(html)
  };
}


/* ============================================================
   SEASON HELPERS
   ============================================================ */

function parseSeasonNumber(item) {
  const values = [
    item?.sequence,
    item?.season_number,
    item?.seasonNo,
    item?.seasonNumber,
    item?.number,
    item?.index
  ];

  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      const n = Number(value);

      if (
        Number.isFinite(n) &&
        n > 0 &&
        n < 1000
      ) {
        return n;
      }
    }
  }

  const text = [
    item?.title,
    item?.name,
    item?.displayTitle,
    item?.label
  ]
    .filter(Boolean)
    .join(" ");

  const match =
    String(text).match(
      /\b(?:season|s)\s*[-._#:]?\s*(\d{1,3})\b/i
    );

  return match
    ? Number(match[1])
    : null;
}


function findSeasonObjects(state) {
  const seasons = [];

  for (
    const item of collectObjects(state)
  ) {
    if (
      objectType(item) !== "season"
    ) {
      continue;
    }

    if (!item.id) {
      continue;
    }

    const number =
      parseSeasonNumber(item);

    if (!number) {
      continue;
    }

    seasons.push({
      id: String(item.id),
      title:
        item.title ||
        item.name ||
        `Season ${number}`,
      number,
      webUrl:
        objectWebUrl(item)
    });
  }

  const map = new Map();

  for (const season of seasons) {
    if (
      !map.has(season.number)
    ) {
      map.set(
        season.number,
        season
      );
    }
  }

  return [
    ...map.values()
  ].sort(
    (a, b) =>
      a.number - b.number
  );
}


function extractSeoDependencies(
  seo
) {
  const roots = [
    seo,
    seo?.data,
    seo?.result
  ].filter(Boolean);

  const all = [];

  for (const root of roots) {
    collectObjects(
      root,
      all
    );
  }

  const seasons = [];

  for (const item of all) {
    if (
      objectType(item) ===
        "season" &&
      item.id
    ) {
      seasons.push({
        id: String(item.id),
        title:
          item.title ||
          item.name ||
          "Season",
        number:
          parseSeasonNumber(item),
        webUrl:
          objectWebUrl(item)
      });
    }
  }

  return {
    seasons
  };
}


async function getShowSeasons(show) {
  const found =
    new Map();

  if (show.webUrl) {
    try {
      const page =
        await fetchMxPage(
          show.webUrl
        );

      for (
        const season of
          findSeasonObjects(
            page.state
          )
      ) {
        if (
          !found.has(
            season.number
          )
        ) {
          found.set(
            season.number,
            season
          );
        }
      }
    } catch (error) {
      console.log(
        `[SEASONS] page failed: ${error.message}`
      );
    }

    try {
      const seo =
        await mxSeo(
          show.webUrl
        );

      const deps =
        extractSeoDependencies(
          seo
        );

      for (
        const season of
          deps.seasons
      ) {
        if (
          season.number &&
          !found.has(
            season.number
          )
        ) {
          found.set(
            season.number,
            season
          );
        }
      }
    } catch (error) {
      console.log(
        `[SEASONS] SEO failed: ${error.message}`
      );
    }
  }

  return [
    ...found.values()
  ].sort(
    (a, b) =>
      a.number - b.number
  );
}


async function findRequestedSeason(
  show,
  seasonNumber
) {
  const seasons =
    await getShowSeasons(
      show
    );

  let season =
    seasons.find(
      item =>
        Number(item.number) ===
        Number(seasonNumber)
    );

  if (season) {
    return season;
  }

  const queries = [
    `${show.title} season ${seasonNumber}`,
    `${show.title} S${seasonNumber}`
  ];

  for (const query of queries) {
    try {
      const results =
        await mxSearchRaw(
          query
        );

      const candidates =
        results
          .filter(
            item =>
              objectType(item) ===
              "season"
          )
          .map(item => ({
            item,
            number:
              parseSeasonNumber(
                item
              ),
            score:
              titleScore(
                item.title,
                show.title
              )
          }))
          .filter(
            x =>
              x.number ===
              Number(seasonNumber)
          )
          .sort(
            (a, b) =>
              b.score - a.score
          );

      if (
        candidates.length
      ) {
        const item =
          candidates[0].item;

        return {
          id: String(item.id),
          title:
            item.title ||
            `Season ${seasonNumber}`,
          number:
            Number(seasonNumber),
          webUrl:
            objectWebUrl(item)
        };
      }
    } catch (error) {
      console.log(
        `[SEASONS] search failed: ${error.message}`
      );
    }
  }

  throw new Error(
    `MX Season ${seasonNumber} not found; ` +
    `discovered seasons: ` +
    (
      seasons
        .map(s => s.number)
        .join(", ") ||
      "none"
    )
  );
}


/* ============================================================
   EPISODES
   ============================================================ */

async function getSeasonEpisodes(
  seasonId
) {
  const episodes = [];
  let next = null;

  for (
    let page = 0;
    page < 30;
    page++
  ) {
    const params = {
      type: "season",
      id: seasonId,
      sortOrder: "0"
    };

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
          ] of nextParams.entries()
        ) {
          params[key] = value;
        }
      } catch {
        params.page = next;
      }
    }

    const data =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    const payload =
      data &&
      data.data !== undefined
        ? data.data
        : data;

    const items =
      Array.isArray(payload)
        ? payload
        : Array.isArray(
            payload?.items
          )
          ? payload.items
          : Array.isArray(
              payload?.results
            )
            ? payload.results
            : [];

    if (!items.length) {
      break;
    }

    episodes.push(
      ...items
    );

    const token =
      !Array.isArray(payload)
        ? (
            payload?.next ??
            payload?.nextPage ??
            payload?.next_page ??
            null
          )
        : null;

    if (!token) {
      break;
    }

    next = token;
  }

  return episodes;
}


function episodeNumber(item) {
  const values = [
    item?.episodeNo,
    item?.episode_number,
    item?.episodeNumber,
    item?.episode_no,
    item?.sequence
  ];

  for (const value of values) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim()
    ) {
      const n =
        Number(value);

      if (
        Number.isFinite(n)
      ) {
        return n;
      }
    }
  }

  const text = [
    item?.title,
    item?.name,
    item?.displayTitle
  ]
    .filter(Boolean)
    .join(" ");

  const match =
    String(text).match(
      /\b(?:episode|ep|e)\s*[-._#:]?\s*(\d{1,3})\b/i
    );

  return match
    ? Number(match[1])
    : null;
}


/* ============================================================
   STREAM OBJECT
   ============================================================ */

function extractStreamObject(
  detail
) {
  if (
    !detail ||
    typeof detail !== "object"
  ) {
    return null;
  }

  const candidates = [
    detail.stream,
    detail.data?.stream,
    detail.result?.stream,
    detail.data?.data?.stream
  ];

  for (const stream of candidates) {
    if (
      stream &&
      typeof stream === "object"
    ) {
      return stream;
    }
  }

  for (
    const item of
      collectObjects(detail)
  ) {
    if (
      item &&
      typeof item === "object" &&
      item.hls &&
      typeof item.hls === "object"
    ) {
      return item;
    }
  }

  return null;
}


/* ============================================================
   EPISODE DETAIL
   ============================================================ */

async function getEpisodeDetail(
  episode
) {
  const candidates = [
    {
      type:
        objectType(episode) ||
        "episode",
      id: episode.id
    },
    {
      type: "episode",
      id: episode.id
    }
  ];

  let last = null;

  for (
    const candidate of candidates
  ) {
    try {
      const detail =
        await mxGet(
          "/detail/video",
          candidate
        );

      last = detail;

      if (
        extractStreamObject(
          detail
        )
      ) {
        return detail;
      }
    } catch (error) {
      console.log(
        `[DETAIL] ${candidate.type}/${candidate.id}: ${error.message}`
      );
    }
  }

  return last;
}


/* ============================================================
   SERIES RESOLUTION
   ============================================================ */

async function resolveSeries(
  imdbId,
  seasonNumber,
  requestedEpisode
) {
  const result = {
    stage: "cinemeta"
  };

  const cm =
    await cinemeta(
      "series",
      imdbId
    );

  const meta =
    cm?.meta;

  if (!meta) {
    throw new Error(
      "Cinemeta returned no series metadata"
    );
  }

  result.title =
    meta.name;

  result.stage =
    "mx-search";

  let searchResults =
    await mxSearch(
      meta.name
    );

  let show =
    pickShow(
      searchResults,
      meta.name
    );

  if (!show) {
    try {
      searchResults =
        await mxHomeSearch(
          meta.name
        );

      show =
        pickShow(
          searchResults,
          meta.name
        );
    } catch (error) {
      console.log(
        `[SEARCH] home fallback failed: ${error.message}`
      );
    }
  }

  if (!show) {
    throw new Error(
      `MX show not found: ${meta.name}`
    );
  }

  result.mxShow = {
    id: show.id,
    title: show.title,
    type: objectType(show),
    webUrl:
      objectWebUrl(show)
  };

  result.stage =
    "mx-seasons";

  const season =
    await findRequestedSeason(
      show,
      seasonNumber
    );

  result.season =
    season;

  result.stage =
    "mx-episodes";

  const episodes =
    await getSeasonEpisodes(
      season.id
    );

  const episode =
    episodes.find(
      item =>
        episodeNumber(item) ===
        Number(requestedEpisode)
    );

  if (!episode) {
    throw new Error(
      `MX Episode ${requestedEpisode} not found in ` +
      `Season ${seasonNumber}; discovered: ` +
      (
        episodes
          .map(item => {
            const n =
              episodeNumber(item);

            const title =
              item.title ||
              item.name ||
              "";

            return n === null
              ? title
              : `E${n} ${title}`;
          })
          .join(" | ") ||
        "none"
      )
    );
  }

  result.episode = {
    id: episode.id,
    title:
      episode.title ||
      episode.name,
    episodeNo:
      episodeNumber(episode),
    type:
      objectType(episode) ||
      "episode",
    webUrl:
      objectWebUrl(episode)
  };

  result.stage =
    "mx-detail";

  const detail =
    await getEpisodeDetail(
      episode
    );

  if (
    !extractStreamObject(
      detail
    )
  ) {
    throw new Error(
      `MX episode has no stream object for ${episode.id}`
    );
  }

  result.stage =
    "hls";

  result.detail =
    detail;

  return result;
}


/* ============================================================
   MOVIE RESOLUTION
   ============================================================ */

async function resolveMovie(
  imdbId
) {
  const result = {
    stage: "cinemeta"
  };

  const cm =
    await cinemeta(
      "movie",
      imdbId
    );

  const meta =
    cm?.meta;

  if (!meta) {
    throw new Error(
      "Cinemeta returned no movie metadata"
    );
  }

  const title =
    meta.name;

  const year =
    meta.year ||
    (
      meta.releaseInfo
        ? String(
            meta.releaseInfo
          ).slice(0, 4)
        : null
    );

  result.title =
    title;

  result.year =
    year;

  result.stage =
    "mx-search";

  let results =
    await mxSearch(
      title
    );

  let movie =
    pickMovie(
      results,
      title,
      year
    );

  if (!movie) {
    try {
      results =
        await mxHomeSearch(
          title
        );

      movie =
        pickMovie(
          results,
          title,
          year
        );
    } catch (error) {
      console.log(
        `[MOVIE] home fallback failed: ${error.message}`
      );
    }
  }

  if (!movie) {
    throw new Error(
      `MX movie not found: ${title}`
    );
  }

  result.mxMovie = {
    id: movie.id,
    title: movie.title,
    type: objectType(movie),
    webUrl:
      objectWebUrl(movie)
  };

  /*
   * Search result IDs are not always the actual
   * playable detail IDs. Resolve the MX page
   * through SEO first.
   */

  result.stage =
    "mx-seo";

  let resolvedId =
    movie.id;

  let resolvedType =
    objectType(movie) ||
    "movie";

  if (
    objectWebUrl(movie)
  ) {
    try {
      const seo =
        await mxSeo(
          objectWebUrl(movie)
        );

      const all = [];

      for (
        const root of [
          seo,
          seo?.data,
          seo?.result
        ].filter(Boolean)
      ) {
        collectObjects(
          root,
          all
        );
      }

      const candidate =
        all.find(
          item =>
            item.id &&
            (
              objectType(item) ===
                "movie" ||
              objectType(item) ===
                "video" ||
              objectType(item) ===
                "film"
            )
        );

      if (candidate) {
        resolvedId =
          String(
            candidate.id
          );

        const type =
          objectType(
            candidate
          );

        resolvedType =
          (
            type === "video" ||
            type === "film"
          )
            ? "movie"
            : type;
      }

      const data =
        seo?.data ||
        seo?.result ||
        seo;

      if (data?.id) {
        resolvedId =
          String(data.id);
      }

      if (
        data?.type
      ) {
        const type =
          String(
            data.type
          ).toLowerCase();

        if (
          [
            "movie",
            "video",
            "film"
          ].includes(type)
        ) {
          resolvedType =
            (
              type === "video" ||
              type === "film"
            )
              ? "movie"
              : type;
        }
      }
    } catch (error) {
      console.log(
        `[MOVIE] SEO failed: ${error.message}`
      );
    }
  }

  result.mxResolved = {
    id: resolvedId,
    type: resolvedType
  };

  result.stage =
    "mx-detail";

  const candidates = [
    {
      type: resolvedType,
      id: resolvedId
    },
    {
      type: "movie",
      id: movie.id
    }
  ];

  let detail = null;

  for (
    const candidate of candidates
  ) {
    try {
      const current =
        await mxGet(
          "/detail/video",
          candidate
        );

      detail =
        current;

      if (
        extractStreamObject(
          current
        )
      ) {
        result.mxResolved =
          candidate;

        break;
      }
    } catch (error) {
      console.log(
        `[MOVIE] detail ${candidate.type}/${candidate.id}: ${error.message}`
      );
    }
  }

  if (
    !extractStreamObject(
      detail
    )
  ) {
    throw new Error(
      `MX movie has no stream object ` +
      `(search=${movie.id}, ` +
      `resolved=${resolvedType}/${resolvedId})`
    );
  }

  result.stage =
    "hls";

  result.detail =
    detail;

  return result;
}


/* ============================================================
   HLS
   ============================================================ */

function extractHls(
  stream
) {
  if (!stream) {
    return null;
  }

  const hls =
    stream.hls || {};

  const thirdParty =
    stream.thirdParty || {};

  const altBalaji =
    stream.altBalaji || {};

  const mxplay =
    stream.mxplay || {};

  let url =
    hls.high ||
    hls.base ||
    hls.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    (
      mxplay.hls &&
      mxplay.hls.high
    );

  if (
    url &&
    !String(url).startsWith("http")
  ) {
    url =
      `${CDN}/${String(url).replace(/^\/+/, "")}`;
  }

  return url || null;
}


function absoluteUrl(
  value,
  base
) {
  try {
    return new URL(
      value,
      base
    ).toString();
  } catch {
    return value;
  }
}


function parseAttributes(
  line
) {
  const result = {};

  const index =
    line.indexOf(":");

  if (index === -1) {
    return result;
  }

  const content =
    line.substring(
      index + 1
    );

  const regex =
    /([A-Z0-9-]+)=("[^"]*"|[^,]*)/g;

  let match;

  while (
    (match =
      regex.exec(content))
  ) {
    let value =
      match[2];

    if (
      value.startsWith('"')
    ) {
      value =
        value.substring(
          1,
          value.length - 1
        );
    }

    result[
      match[1]
    ] = value;
  }

  return result;
}


function parseMaster(
  text,
  masterUrl
) {
  const lines =
    text
      .split(/\r?\n/)
      .map(
        x => x.trim()
      )
      .filter(Boolean);

  const variants = [];
  const audios = [];

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i];

    if (
      line.startsWith(
        "#EXT-X-MEDIA:"
      )
    ) {
      const attrs =
        parseAttributes(
          line
        );

      if (
        attrs.TYPE === "AUDIO" &&
        attrs.URI
      ) {
        audios.push({
          group:
            attrs["GROUP-ID"],
          url:
            absoluteUrl(
              attrs.URI,
              masterUrl
            ),
          default:
            attrs.DEFAULT === "YES"
        });
      }
    }

    if (
      line.startsWith(
        "#EXT-X-STREAM-INF:"
      )
    ) {
      const attrs =
        parseAttributes(
          line
        );

      const uri =
        lines[i + 1];

      if (
        !uri ||
        uri.startsWith("#")
      ) {
        continue;
      }

      let width = null;
      let height = null;

      if (
        attrs.RESOLUTION
      ) {
        const match =
          attrs.RESOLUTION.match(
            /(\d+)x(\d+)/
          );

        if (match) {
          width =
            Number(match[1]);

          height =
            Number(match[2]);
        }
      }

      variants.push({
        url:
          absoluteUrl(
            uri,
            masterUrl
          ),
        bandwidth:
          Number(
            attrs.BANDWIDTH ||
            0
          ),
        width,
        height,
        codecs:
          attrs.CODECS ||
          null,
        audioGroup:
          attrs.AUDIO ||
          null
      });
    }
  }

  variants.sort(
    (a, b) =>
      (
        b.height || 0
      ) -
      (
        a.height || 0
      ) ||
      b.bandwidth -
      a.bandwidth
  );

  return {
    variants,
    audios
  };
}


function qualityLabel(
  item
) {
  const height =
    Number(
      item.height ||
      0
    );

  if (height >= 2160)
    return "2160p";

  if (height >= 1440)
    return "1440p";

  if (height >= 1080)
    return "1080p";

  if (height >= 720)
    return "720p";

  if (height >= 480)
    return "480p";

  if (height >= 360)
    return "360p";

  if (height >= 180)
    return "180p";

  return "High";
}


/* ============================================================
   HLS DISCOVERY
   ============================================================ */

async function fetchHlsText(
  url
) {
  return requestText(
    url,
    {
      headers: {
        "User-Agent":
          MX_HEADERS[
            "User-Agent"
          ],
        Referer:
          "https://www.mxplayer.in/"
      }
    },
    15000
  );
}


async function urlWorks(
  url
) {
  try {
    const response =
      await fetch(
        url,
        {
          method: "GET",
          headers: {
            "User-Agent":
              MX_HEADERS[
                "User-Agent"
              ],
            Referer:
              "https://www.mxplayer.in/"
          },
          signal:
            AbortSignal.timeout(
              10000
            )
        }
      );

    return response.ok;
  } catch {
    return false;
  }
}


async function discoverDirectHls(
  hlsUrl
) {
  const base =
    hlsUrl.substring(
      0,
      hlsUrl.lastIndexOf("/") + 1
    );

  const candidates = [
    [
      "2160p",
      [
        "h264_2160_high_12000k.m3u8",
        "h264_2160_high_10000k.m3u8",
        "h264_2160_high_8000k.m3u8"
      ]
    ],
    [
      "1440p",
      [
        "h264_1440_high_8000k.m3u8",
        "h264_1440_high_6000k.m3u8"
      ]
    ],
    [
      "1080p",
      [
        "h264_1080_high_5800k.m3u8",
        "h264_1080_high_5000k.m3u8",
        "h264_1080_high_4500k.m3u8",
        "h264_1080_high_4000k.m3u8"
      ]
    ],
    [
      "720p",
      [
        "h264_720_high_3000k.m3u8",
        "h264_720_high_2500k.m3u8",
        "h264_720_high_2000k.m3u8"
      ]
    ],
    [
      "480p",
      [
        "h264_480_high_1750k.m3u8",
        "h264_480_high_1500k.m3u8"
      ]
    ],
    [
      "360p",
      [
        "h264_360_high_750k.m3u8",
        "h264_360_high_600k.m3u8"
      ]
    ],
    [
      "180p",
      [
        "h264_180_high_235k.m3u8",
        "h264_180_high_200k.m3u8"
      ]
    ],
    [
      "High",
      [
        "h264_high.m3u8"
      ]
    ]
  ];

  const found = [];

  for (
    const [label, files]
    of candidates
  ) {
    for (
      const file of files
    ) {
      const url =
        base + file;

      if (
        await urlWorks(url)
      ) {
        found.push({
          label,
          url
        });

        break;
      }
    }
  }

  return found;
}


async function findAudio(
  hlsUrl
) {
  const base =
    hlsUrl.substring(
      0,
      hlsUrl.lastIndexOf("/") + 1
    );

  const candidates = [
    "audio_128000_0_96.m3u8",
    "audio_96000_0_96.m3u8",
    "audio_64000_0_96.m3u8"
  ];

  for (
    const file of candidates
  ) {
    const url =
      base + file;

    if (
      await urlWorks(url)
    ) {
      return url;
    }
  }

  return null;
}


/* ============================================================
   STREMIO STREAM
   ============================================================ */

function createStream(
  video,
  audio,
  label,
  bandwidth = 3000000,
  codecs = "avc1.640028"
) {
  const masterUrl =
    `${ADDON_BASE}/hls/master` +
    `?video=${encodeURIComponent(video)}` +
    `&audio=${encodeURIComponent(audio || "")}` +
    `&label=${encodeURIComponent(label)}` +
    `&bandwidth=${encodeURIComponent(bandwidth)}` +
    `&codecs=${encodeURIComponent(codecs)}`;

  return {
    name:
      `MX Player ${label}`,

    title:
      `MX Player • ${label}` +
      (
        audio
          ? " • Audio"
          : ""
      ),

    url:
      masterUrl,

    behaviorHints: {
      notWebReady: true,
      bingeGroup:
        `mxplayer-${label}`
    }
  };
}


function uniqueStreams(
  streams
) {
  const map =
    new Map();

  for (
    const stream of streams
  ) {
    if (
      !map.has(
        stream.name
      )
    ) {
      map.set(
        stream.name,
        stream
      );
    }
  }

  return [
    ...map.values()
  ];
}


async function streamsFromHls(
  hlsUrl
) {
  if (!hlsUrl) {
    return [];
  }

  let text;

  try {
    text =
      await fetchHlsText(
        hlsUrl
      );
  } catch {
    return [];
  }

  /* Real master playlist */

  if (
    text.includes(
      "#EXT-X-STREAM-INF:"
    )
  ) {
    const parsed =
      parseMaster(
        text,
        hlsUrl
      );

    const result = [];

    for (
      const variant of
        parsed.variants
    ) {
      const label =
        qualityLabel(
          variant
        );

      let audio = null;

      if (
        variant.audioGroup
      ) {
        const match =
          parsed.audios.find(
            item =>
              item.group ===
              variant.audioGroup
          );

        if (match) {
          audio =
            match.url;
        }
      }

      if (!audio) {
        const defaultAudio =
          parsed.audios.find(
            item =>
              item.default
          ) ||
          parsed.audios[0];

        if (
          defaultAudio
        ) {
          audio =
            defaultAudio.url;
        }
      }

      result.push(
        createStream(
          variant.url,
          audio,
          label,
          variant.bandwidth,
          variant.codecs
        )
      );
    }

    return uniqueStreams(
      result
    );
  }

  /* Direct MX media playlist */

  let qualities =
    await discoverDirectHls(
      hlsUrl
    );

  if (
    !qualities.length
  ) {
    qualities = [
      {
        label: "High",
        url: hlsUrl
      }
    ];
  }

  const audio =
    await findAudio(
      hlsUrl
    );

  return uniqueStreams(
    qualities.map(
      item =>
        createStream(
          item.url,
          audio,
          item.label
        )
    )
  );
}


/* ============================================================
   MANIFEST
   ============================================================ */

const manifest = {
  id:
    "com.minecraft.mxplayer",

  version:
    VERSION,

  name:
    "MX Player Free",

  description:
    "Automatic MX Player India stream resolver.",

  resources: [
    {
      name: "stream",
      types: [
        "movie"
      ],
      idPrefixes: [
        "tt"
      ]
    },
    {
      name: "stream",
      types: [
        "series"
      ],
      idPrefixes: [
        "tt"
      ]
    }
  ],

  types: [
    "movie",
    "series"
  ]
};


/* ============================================================
   CORS
   ============================================================ */

app.use(
  (req, res, next) => {
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
      "GET, OPTIONS"
    );

    if (
      req.method ===
      "OPTIONS"
    ) {
      return res.sendStatus(
        200
      );
    }

    next();
  }
);


/* ============================================================
   ROOT
   ============================================================ */

app.get(
  "/",
  (req, res) => {
    res.json({
      addon:
        "MX Player Free",

      version:
        VERSION,

      resolver:
        "automatic",

      status:
        "ok"
    });
  }
);


/* ============================================================
   HEALTH
   ============================================================ */

app.get(
  "/health",
  (req, res) => {
    res.json({
      status:
        "ok",

      version:
        VERSION,

      resolver:
        "automatic",

      features: [
        "IMDb movie resolution",
        "IMDb series resolution",
        "automatic seasons",
        "automatic episodes",
        "automatic MX search",
        "SEO resolver",
        "HLS quality discovery",
        "audio discovery"
      ]
    });
  }
);


/* ============================================================
   MANIFEST
   ============================================================ */

app.get(
  "/manifest.json",
  (req, res) => {
    res.json(
      manifest
    );
  }
);


/* ============================================================
   DEBUG MX SEARCH
   ============================================================ */

app.get(
  "/debug/mx-search/:query",
  async (req, res) => {
    try {
      const query =
        req.params.query;

      const results =
        await mxSearchRaw(
          query
        );

      res.json({
        ok: true,
        query,

        results:
          results
            .slice(0, 50)
            .map(item => ({
              id:
                item.id,

              type:
                objectType(item),

              title:
                item.title,

              webUrl:
                objectWebUrl(item)
            }))
      });
    } catch (error) {
      res.json({
        ok: false,
        error:
          error.message,
        stack:
          error.stack
      });
    }
  }
);


/* ============================================================
   STREAM ENDPOINT
   ============================================================ */

app.get(
  "/stream/:type/:videoId.json",
  async (req, res) => {
    const type =
      req.params.type;

    const videoId =
      req.params.videoId;

    console.log(
      `[STREAM] ${type} ${videoId}`
    );

    try {

      /* --------------------------------------------------------
         SERIES
         -------------------------------------------------------- */

      if (
        type === "series"
      ) {
        const parts =
          videoId.split(":");

        if (
          parts.length !== 3
        ) {
          return res.json({
            streams: []
          });
        }

        const imdbId =
          parts[0];

        const season =
          Number(parts[1]);

        const episode =
          Number(parts[2]);

        if (
          !imdbId.startsWith("tt") ||
          !Number.isInteger(season) ||
          !Number.isInteger(episode)
        ) {
          return res.json({
            streams: []
          });
        }

        const resolved =
          await resolveSeries(
            imdbId,
            season,
            episode
          );

        const stream =
          extractStreamObject(
            resolved.detail
          );

        const hls =
          extractHls(
            stream
          );

        const streams =
          await streamsFromHls(
            hls
          );

        console.log(
          `[SERIES] ${resolved.title} ` +
          `S${season}E${episode} ` +
          `${streams.length} streams`
        );

        return res.json({
          streams
        });
      }


      /* --------------------------------------------------------
         MOVIE
         -------------------------------------------------------- */

      if (
        type === "movie" &&
        videoId.startsWith("tt")
      ) {
        const resolved =
          await resolveMovie(
            videoId
          );

        const stream =
          extractStreamObject(
            resolved.detail
          );

        const hls =
          extractHls(
            stream
          );

        const streams =
          await streamsFromHls(
            hls
          );

        console.log(
          `[MOVIE] ${resolved.title} ` +
          `${streams.length} streams`
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
        "[STREAM ERROR]",
        error
      );

      return res.json({
        streams: []
      });
    }
  }
);


/* ============================================================
   DEBUG RESOLVER
   ============================================================ */

app.get(
  "/debug/resolve/:type/:videoId",
  async (req, res) => {
    try {
      const type =
        req.params.type;

      const videoId =
        req.params.videoId;


      /* MOVIE DEBUG */

      if (
        type === "movie"
      ) {
        const resolved =
          await resolveMovie(
            videoId
          );

        const stream =
          extractStreamObject(
            resolved.detail
          );

        return res.json({
          ok: true,

          type,

          id:
            videoId,

          title:
            resolved.title,

          year:
            resolved.year,

          mx:
            resolved.mxMovie,

          mxResolved:
            resolved.mxResolved,

          hls:
            extractHls(
              stream
            )
        });
      }


      /* SERIES DEBUG */

      if (
        type === "series"
      ) {
        const parts =
          videoId.split(":");

        if (
          parts.length !== 3
        ) {
          return res.json({
            ok: false,
            error:
              "Series ID must be ttXXXXXXX:season:episode"
          });
        }

        const resolved =
          await resolveSeries(
            parts[0],
            Number(parts[1]),
            Number(parts[2])
          );

        const stream =
          extractStreamObject(
            resolved.detail
          );

        return res.json({
          ok: true,

          type,

          id:
            videoId,

          title:
            resolved.title,

          mxShow:
            resolved.mxShow,

          season:
            resolved.season,

          episode:
            resolved.episode,

          hls:
            extractHls(
              stream
            )
        });
      }


      return res.json({
        ok: false,
        error:
          "Unsupported type"
      });

    } catch (error) {

      return res.json({
        ok: false,

        error:
          error.message,

        stack:
          error.stack
      });
    }
  }
);


/* ============================================================
   GENERATED HLS MASTER
   ============================================================ */

app.get(
  "/hls/master",
  (req, res) => {
    const video =
      req.query.video;

    const audio =
      req.query.audio;

    const label =
      req.query.label ||
      "High";

    const bandwidth =
      Number(
        req.query.bandwidth ||
        3000000
      );

    const codecs =
      req.query.codecs ||
      "avc1.640028";

    if (!video) {
      return res
        .status(400)
        .send(
          "Missing video"
        );
    }

    const lines = [
      "#EXTM3U",
      "#EXT-X-VERSION:3"
    ];

    if (audio) {
      lines.push(
        `#EXT-X-MEDIA:` +
        `TYPE=AUDIO,` +
        `GROUP-ID="audio",` +
        `NAME="MX Audio",` +
        `DEFAULT=YES,` +
        `AUTOSELECT=YES,` +
        `URI="${audio}"`
      );
    }

    lines.push(
      `#EXT-X-STREAM-INF:` +
      `BANDWIDTH=${bandwidth}` +
      `,CODECS="${codecs}"` +
      (
        audio
          ? ',AUDIO="audio"'
          : ""
      ),

      video
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.apple.mpegurl"
    );

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    res.send(
      lines.join("\n") +
      "\n"
    );
  }
);


/* ============================================================
   START
   ============================================================ */

app.listen(
  PORT,
  HOST,
  () => {
    console.log(
      `MX Player addon ${VERSION} ` +
      `listening on ${HOST}:${PORT}`
    );
  }
);
