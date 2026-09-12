const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const VERSION = "18.0.0";

const BASE = "https://api.mxplayer.in/v1/web";
const SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io";
const MXWEB = "https://www.mxplayer.in";
const CDN = "https://d3sgzbosmwirao.cloudfront.net";
const ADDON = "https://my-stremio-addon-q8ep.onrender.com";

const USER_ID = crypto.randomUUID();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Mobile Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.mxplayer.in/",
  Origin: "https://www.mxplayer.in"
};

function defaults() {
  return {
    "device-density": "2",
    platform: "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: USER_ID
  };
}

/* =========================================================
   HTTP
========================================================= */

async function getJson(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

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

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`Invalid JSON from ${url}`);
    }
  } finally {
    clearTimeout(timer);
  }
}

async function getText(url, options = {}, timeout = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

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

async function mxGet(path, params = {}) {
  const url = new URL(BASE + path);

  for (const [key, value] of Object.entries({
    ...defaults(),
    ...params
  })) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return getJson(url.toString(), {
    headers: HEADERS
  });
}

async function mxPost(path, params = {}, body = {}) {
  const url = new URL(BASE + path);

  for (const [key, value] of Object.entries({
    ...defaults(),
    ...params
  })) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return getJson(url.toString(), {
    method: "POST",
    headers: {
      ...HEADERS,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
}

/* =========================================================
   CINEMETA
========================================================= */

async function cinemeta(type, id) {
  return getJson(
    `${CINEMETA}/meta/${type}/${encodeURIComponent(id)}.json`,
    {
      headers: {
        "User-Agent": HEADERS["User-Agent"],
        Accept: "application/json"
      }
    }
  );
}

/* =========================================================
   GENERIC OBJECT HELPERS
========================================================= */

function objects(value, out = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) {
    return out;
  }

  seen.add(value);
  out.push(value);

  if (Array.isArray(value)) {
    for (const item of value) {
      objects(item, out, seen);
    }
  } else {
    for (const item of Object.values(value)) {
      if (item && typeof item === "object") {
        objects(item, out, seen);
      }
    }
  }

  return out;
}

function typeOf(x) {
  return String(
    x?.type ??
    x?.contentType ??
    x?.content_type ??
    ""
  ).toLowerCase();
}

function webUrlOf(x) {
  if (!x || typeof x !== "object") return null;

  for (const key of [
    "webUrl",
    "webURL",
    "web_url",
    "canonicalUrl",
    "canonicalURL"
  ]) {
    if (x[key]) {
      return String(x[key]);
    }
  }

  return null;
}

function norm(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreTitle(a, b) {
  const x = norm(a);
  const y = norm(b);

  if (!x || !y) return 0;

  if (x === y) return 100;

  if (x.includes(y) || y.includes(x)) {
    return 85;
  }

  const A = new Set(x.split(" "));
  const B = new Set(y.split(" "));

  let common = 0;

  for (const word of A) {
    if (B.has(word)) {
      common++;
    }
  }

  return Math.round(
    (common / Math.max(A.size, B.size)) * 70
  );
}

function seasonNo(x) {
  for (const value of [
    x?.sequence,
    x?.season_number,
    x?.seasonNo,
    x?.seasonNumber,
    x?.number
  ]) {
    if (
      value !== undefined &&
      value !== null &&
      Number.isFinite(Number(value)) &&
      Number(value) > 0
    ) {
      return Number(value);
    }
  }

  const match = String(
    x?.title ||
    x?.name ||
    ""
  ).match(
    /\b(?:season|s)\s*[-._#:]?\s*(\d{1,3})\b/i
  );

  return match ? Number(match[1]) : null;
}

function episodeNo(x) {
  for (const value of [
    x?.episodeNo,
    x?.episode_number,
    x?.episodeNumber,
    x?.episode_no
  ]) {
    if (
      value !== undefined &&
      value !== null &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  const match = String(
    x?.title ||
    x?.name ||
    ""
  ).match(
    /\b(?:episode|ep|e)\s*[-._#:]?\s*(\d{1,3})\b/i
  );

  return match ? Number(match[1]) : null;
}

/* =========================================================
   MX SEARCH
========================================================= */

async function mxSearchRaw(query) {
  const data = await mxPost(
    "/search/resultv2",
    { query },
    {}
  );

  return objects(data).filter(item => {
    const type = typeOf(item);

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
  });
}

async function mxSearch(query) {
  const rows = await mxSearchRaw(query);

  const map = new Map();

  for (const item of rows) {
    const key = `${typeOf(item)}:${item.id}`;

    if (!map.has(key)) {
      map.set(key, item);
    }
  }

  return [...map.values()];
}

function pickShow(rows, title) {
  return rows
    .filter(x => typeOf(x) === "tvshow")
    .map(x => ({
      x,
      score: scoreTitle(x.title, title)
    }))
    .sort((a, b) => b.score - a.score)[0]?.x || null;
}

function pickMovie(rows, title, year) {
  const ranked = rows
    .filter(x => typeOf(x) === "movie")
    .map(x => {
      let score = scoreTitle(x.title, title);

      const itemYear =
        x.year ||
        x.releaseYear ||
        (
          x.releaseDate
            ? String(x.releaseDate).slice(0, 4)
            : null
        );

      if (
        year &&
        itemYear &&
        String(year).slice(0, 4) ===
          String(itemYear).slice(0, 4)
      ) {
        score += 25;
      }

      return {
        x,
        score
      };
    })
    .sort((a, b) => b.score - a.score);

  return ranked[0]?.score >= 50
    ? ranked[0].x
    : null;
}

function pickSeason(rows, number, showTitle) {
  return rows
    .filter(
      x =>
        typeOf(x) === "season" &&
        seasonNo(x) === Number(number)
    )
    .map(x => ({
      x,
      score: scoreTitle(x.title, showTitle)
    }))
    .sort((a, b) => b.score - a.score)[0]?.x || null;
}

/* =========================================================
   MX SEO RESOLVER
========================================================= */

/*
   THIS IS THE IMPORTANT V18 CHANGE.

   MX search gives us a webUrl, but that ID may not be
   the canonical playable ID.

   Therefore:

       webUrl
          ↓
       SEO resolver
          ↓
       data.id + data.type
          ↓
       /detail/video
*/

function toMxPath(value) {
  if (!value) return null;

  try {
    const url = new URL(
      String(value),
      MXWEB
    );

    return url.pathname;
  } catch {
    return null;
  }
}

async function seoResolve(value) {
  const path = toMxPath(value);

  if (!path) {
    throw new Error(
      `Invalid MX URL/path: ${value}`
    );
  }

  const url = new URL(
    `${SEO}/get-url-details`
  );

  for (const [key, val] of Object.entries({
    ...defaults(),
    url: path
  })) {
    url.searchParams.set(
      key,
      String(val)
    );
  }

  const result = await getJson(
    url.toString(),
    {
      headers: HEADERS
    }
  );

  const data = result?.data;

  if (!data?.id || !data?.type) {
    throw new Error(
      `SEO returned no canonical ID/type for ${path}`
    );
  }

  return {
    id: String(data.id),
    type: String(data.type),
    title: data.title || null,
    data,
    raw: result,
    path
  };
}

/* =========================================================
   DETAIL
========================================================= */

async function detailVideo(id, type) {
  return mxGet(
    "/detail/video",
    {
      id,
      type
    }
  );
}

function streamObject(value) {
  if (!value || typeof value !== "object") {
    return null;
  }

  if (
    value.stream &&
    typeof value.stream === "object"
  ) {
    return value.stream;
  }

  if (
    value.data?.stream &&
    typeof value.data.stream === "object"
  ) {
    return value.data.stream;
  }

  if (
    value.result?.stream &&
    typeof value.result.stream === "object"
  ) {
    return value.result.stream;
  }

  return null;
}

function parseStream(stream) {
  if (!stream) return null;

  const hls = stream.hls || {};
  const dash = stream.dash || {};
  const thirdParty =
    stream.thirdParty || {};
  const altBalaji =
    stream.altBalaji || {};
  const mxplay =
    stream.mxplay || {};

  let hlsUrl =
    hls.high ||
    hls.base ||
    hls.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    mxplay.hls?.high ||
    null;

  let dashUrl =
    dash.high ||
    dash.base ||
    dash.main ||
    thirdParty.dashUrl ||
    altBalaji.dashUrl ||
    mxplay.dash?.high ||
    null;

  if (
    hlsUrl &&
    !String(hlsUrl).startsWith("http")
  ) {
    hlsUrl =
      `${CDN}/${String(hlsUrl).replace(/^\/+/, "")}`;
  }

  if (
    dashUrl &&
    !String(dashUrl).startsWith("http")
  ) {
    dashUrl =
      `${CDN}/${String(dashUrl).replace(/^\/+/, "")}`;
  }

  return {
    hls: hlsUrl,
    dash: dashUrl,
    videoHash: stream.videoHash || null,
    drmProtect: !!stream.drmProtect,
    provider: stream.provider || "mxplay"
  };
}

/* =========================================================
   CANONICAL PLAYABLE RESOLUTION
========================================================= */

async function resolvePlayableFromUrl(
  webUrl,
  expectedType = null
) {
  if (!webUrl) {
    throw new Error(
      "MX item has no webUrl"
    );
  }

  const seo = await seoResolve(webUrl);

  if (
    expectedType &&
    seo.type !== expectedType
  ) {
    console.log(
      `[SEO TYPE] expected=${expectedType} got=${seo.type}`
    );
  }

  const detail = await detailVideo(
    seo.id,
    seo.type
  );

  const stream = parseStream(
    streamObject(detail)
  );

  if (!stream?.hls && !stream?.dash) {
    throw new Error(
      `Canonical detail has no stream ` +
      `(id=${seo.id}, type=${seo.type}, ` +
      `statusCode=${detail?.statusCode ?? "none"})`
    );
  }

  return {
    seo,
    detail,
    stream
  };
}

/* =========================================================
   SHOW SEASON DISCOVERY
========================================================= */

function balancedJson(text, start) {
  const open = text[start];

  if (open !== "{" && open !== "[") {
    return null;
  }

  const close =
    open === "{"
      ? "}"
      : "]";

  let depth = 0;
  let string = false;
  let escaped = false;

  for (
    let i = start;
    i < text.length;
    i++
  ) {
    const char = text[i];

    if (string) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        string = false;
      }

      continue;
    }

    if (char === '"') {
      string = true;
      continue;
    }

    if (char === open) {
      depth++;
    } else if (char === close) {
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

function mxsState(html) {
  for (const regex of [
    /window\.__mxs__\s*=\s*/,
    /__mxs__\s*=\s*/
  ]) {
    const match = regex.exec(html);

    if (!match) continue;

    for (
      let i =
        match.index +
        match[0].length;
      i < html.length;
      i++
    ) {
      if (
        html[i] !== "{" &&
        html[i] !== "["
      ) {
        continue;
      }

      const raw =
        balancedJson(html, i);

      if (!raw) break;

      try {
        return JSON.parse(raw);
      } catch {
        break;
      }
    }
  }

  return null;
}

async function showSeasonsFromPage(webUrl) {
  if (!webUrl) return [];

  const full =
    String(webUrl).startsWith("http")
      ? webUrl
      : `${MXWEB}${webUrl}`;

  try {
    const html = await getText(
      full,
      {
        headers: {
          "User-Agent":
            HEADERS["User-Agent"],
          Referer: `${MXWEB}/`
        }
      },
      20000
    );

    const state = mxsState(html);

    if (!state) {
      return [];
    }

    const found = new Map();

    for (const item of objects(state)) {
      if (typeOf(item) !== "tvshow") {
        continue;
      }

      const tabs =
        Array.isArray(item.tabs)
          ? item.tabs
          : [];

      for (const tab of tabs) {
        if (
          tab?.type !==
          "tvshowepisodes"
        ) {
          continue;
        }

        const containers =
          Array.isArray(tab.containers)
            ? tab.containers
            : [];

        for (const container of containers) {
          if (
            typeOf(container) !== "season" ||
            !container.id
          ) {
            continue;
          }

          const number =
            seasonNo(container);

          if (
            number &&
            !found.has(number)
          ) {
            found.set(
              number,
              {
                id: String(
                  container.id
                ),
                title:
                  container.title ||
                  `Season ${number}`,
                number,
                webUrl:
                  webUrlOf(container)
              }
            );
          }
        }
      }
    }

    return [...found.values()]
      .sort(
        (a, b) =>
          a.number - b.number
      );
  } catch (error) {
    console.log(
      `[SEASONS PAGE] ${error.message}`
    );

    return [];
  }
}

async function findSeason(
  show,
  title,
  number,
  initialRows
) {
  let season = pickSeason(
    initialRows,
    number,
    title
  );

  if (season) {
    return {
      id: String(season.id),
      title:
        season.title ||
        `Season ${number}`,
      number: Number(number),
      webUrl:
        webUrlOf(season)
    };
  }

  try {
    const rows =
      await mxSearch(
        `${title} season ${number}`
      );

    season = pickSeason(
      rows,
      number,
      title
    );

    if (season) {
      return {
        id: String(season.id),
        title:
          season.title ||
          `Season ${number}`,
        number: Number(number),
        webUrl:
          webUrlOf(season)
      };
    }
  } catch (error) {
    console.log(
      `[SEASON SEARCH] ${error.message}`
    );
  }

  const pageSeasons =
    await showSeasonsFromPage(
      webUrlOf(show)
    );

  const found =
    pageSeasons.find(
      x =>
        x.number ===
        Number(number)
    );

  if (found) {
    return found;
  }

  throw new Error(
    `MX Season ${number} not found`
  );
}

/* =========================================================
   EPISODES
========================================================= */

async function seasonEpisodes(
  seasonId
) {
  const all = [];

  let next = "";

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
        for (
          const [
            key,
            value
          ] of new URLSearchParams(
            next
          ).entries()
        ) {
          params[key] = value;
        }
      } catch {}
    }

    const response =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    const payload =
      response?.data !== undefined
        ? response.data
        : response;

    const items =
      Array.isArray(payload)
        ? payload
        : Array.isArray(
            payload?.items
          )
          ? payload.items
          : [];

    if (!items.length) {
      break;
    }

    all.push(...items);

    const token =
      payload &&
      !Array.isArray(payload)
        ? payload.next
        : null;

    if (!token) {
      break;
    }

    next = token;
  }

  return all;
}

/* =========================================================
   MOVIE RESOLVER
========================================================= */

async function resolveMovie(
  imdbId
) {
  const cinemetaData =
    await cinemeta(
      "movie",
      imdbId
    );

  const meta =
    cinemetaData?.meta;

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

  const rows =
    await mxSearch(title);

  const movie =
    pickMovie(
      rows,
      title,
      year
    );

  if (!movie) {
    throw new Error(
      `MX movie not found: ${title}`
    );
  }

  /*
     PRIMARY:
     Search result webUrl → SEO → canonical ID → detail
  */

  if (webUrlOf(movie)) {
    try {
      const resolved =
        await resolvePlayableFromUrl(
          webUrlOf(movie),
          "movie"
        );

      return {
        title,
        year,
        mxMovie: movie,
        source: "search-weburl-seo",
        stream:
          resolved.stream,
        detail:
          resolved.detail,
        seo:
          resolved.seo
      };
    } catch (error) {
      console.log(
        `[MOVIE SEO] ${error.message}`
      );
    }
  }

  /*
     SECONDARY:
     Search result may itself contain stream.
  */

  const direct =
    parseStream(
      streamObject(movie)
    );

  if (
    direct?.hls ||
    direct?.dash
  ) {
    return {
      title,
      year,
      mxMovie: movie,
      source: "search-stream",
      stream: direct,
      detail: movie
    };
  }

  /*
     LAST FALLBACK:
     Search ID directly.
  */

  const detail =
    await detailVideo(
      movie.id,
      "movie"
    );

  const parsed =
    parseStream(
      streamObject(detail)
    );

  if (
    !parsed?.hls &&
    !parsed?.dash
  ) {
    throw new Error(
      `MX movie has no stream ` +
      `(searchId=${movie.id}, ` +
      `statusCode=${detail?.statusCode ?? "none"})`
    );
  }

  return {
    title,
    year,
    mxMovie: movie,
    source: "direct-id-fallback",
    stream: parsed,
    detail
  };
}

/* =========================================================
   SERIES RESOLVER
========================================================= */

async function resolveSeries(
  imdbId,
  seasonNumber,
  epNumber
) {
  const cinemetaData =
    await cinemeta(
      "series",
      imdbId
    );

  const meta =
    cinemetaData?.meta;

  if (!meta) {
    throw new Error(
      "Cinemeta returned no series metadata"
    );
  }

  const title =
    meta.name;

  const rows =
    await mxSearch(title);

  const show =
    pickShow(
      rows,
      title
    );

  if (!show) {
    throw new Error(
      `MX show not found: ${title}`
    );
  }

  const season =
    await findSeason(
      show,
      title,
      seasonNumber,
      rows
    );

  const episodes =
    await seasonEpisodes(
      season.id
    );

  const ep =
    episodes.find(
      x =>
        episodeNo(x) ===
        Number(epNumber)
    );

  if (!ep) {
    throw new Error(
      `MX Episode ${epNumber} not found in Season ${seasonNumber}`
    );
  }

  /*
     PRIMARY:
     Episode webUrl → SEO → canonical ID → detail
  */

  if (webUrlOf(ep)) {
    try {
      const resolved =
        await resolvePlayableFromUrl(
          webUrlOf(ep),
          "episode"
        );

      return {
        title,
        show,
        season,
        episode: ep,
        source:
          "episode-weburl-seo",
        stream:
          resolved.stream,
        detail:
          resolved.detail,
        seo:
          resolved.seo
      };
    } catch (error) {
      console.log(
        `[EPISODE SEO] ${error.message}`
      );
    }
  }

  /*
     SECONDARY:
     Episode list item may already
     contain stream.
  */

  const direct =
    parseStream(
      streamObject(ep)
    );

  if (
    direct?.hls ||
    direct?.dash
  ) {
    return {
      title,
      show,
      season,
      episode: ep,
      source:
        "episode-list-stream",
      stream: direct,
      detail: ep
    };
  }

  /*
     LAST FALLBACK:
     Direct episode ID.
  */

  const detail =
    await detailVideo(
      ep.id,
      "episode"
    );

  const parsed =
    parseStream(
      streamObject(detail)
    );

  if (
    !parsed?.hls &&
    !parsed?.dash
  ) {
    throw new Error(
      `MX episode has no stream ` +
      `(searchId=${ep.id}, ` +
      `statusCode=${detail?.statusCode ?? "none"})`
    );
  }

  return {
    title,
    show,
    season,
    episode: ep,
    source:
      "direct-id-fallback",
    stream: parsed,
    detail
  };
}

/* =========================================================
   HLS
========================================================= */

async function urlWorks(url) {
  try {
    const response =
      await fetch(url, {
        headers: {
          "User-Agent":
            HEADERS["User-Agent"],
          Referer:
            `${MXWEB}/`
        },
        signal:
          AbortSignal.timeout(9000)
      });

    return response.ok;
  } catch {
    return false;
  }
}

async function discoverHls(
  hls
) {
  if (!hls) {
    return [];
  }

  let text = "";

  try {
    const response =
      await fetch(hls, {
        headers: {
          "User-Agent":
            HEADERS["User-Agent"],
          Referer:
            `${MXWEB}/`
        },
        signal:
          AbortSignal.timeout(12000)
      });

    if (response.ok) {
      text =
        await response.text();
    }
  } catch {}

  /*
     Master playlist
  */

  if (
    text.includes(
      "#EXT-X-STREAM-INF:"
    )
  ) {
    const lines =
      text
        .split(/\r?\n/)
        .map(x => x.trim())
        .filter(Boolean);

    const result = [];

    for (
      let i = 0;
      i < lines.length;
      i++
    ) {
      if (
        !lines[i].startsWith(
          "#EXT-X-STREAM-INF:"
        )
      ) {
        continue;
      }

      const attributes =
        lines[i].slice(
          lines[i].indexOf(":") + 1
        );

      const resolution =
        attributes.match(
          /RESOLUTION=(\d+)x(\d+)/
        );

      const uri =
        lines[i + 1];

      if (
        !uri ||
        uri.startsWith("#")
      ) {
        continue;
      }

      const height =
        resolution
          ? Number(
              resolution[2]
            )
          : 0;

      result.push({
        label:
          height
            ? `${height}p`
            : "High",
        url:
          new URL(
            uri,
            hls
          ).toString()
      });
    }

    if (result.length) {
      return result;
    }
  }

  /*
     MX individual quality playlists
  */

  const base =
    hls.substring(
      0,
      hls.lastIndexOf("/") + 1
    );

  const groups = [
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
    of groups
  ) {
    for (
      const file
      of files
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

  if (!found.length) {
    found.push({
      label: "High",
      url: hls
    });
  }

  return found;
}

async function findAudio(
  hls
) {
  if (!hls) {
    return null;
  }

  const base =
    hls.substring(
      0,
      hls.lastIndexOf("/") + 1
    );

  for (
    const file of [
      "audio_128000_0_96.m3u8",
      "audio_96000_0_96.m3u8",
      "audio_64000_0_96.m3u8"
    ]
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

/* =========================================================
   STREMIO STREAMS
========================================================= */

function streamUrl(
  video,
  audio,
  label
) {
  return (
    `${ADDON}/hls/master` +
    `?video=${encodeURIComponent(video)}` +
    `&audio=${encodeURIComponent(audio || "")}` +
    `&label=${encodeURIComponent(label)}`
  );
}

async function makeStreams(
  parsed
) {
  const hls =
    parsed?.hls;

  if (!hls) {
    return [];
  }

  const qualities =
    await discoverHls(hls);

  const audio =
    await findAudio(hls);

  return qualities.map(
    quality => ({
      name:
        `MX Player ${quality.label}`,

      title:
        `MX Player • ${quality.label}` +
        (audio
          ? " • Audio"
          : ""),

      url:
        streamUrl(
          quality.url,
          audio,
          quality.label
        ),

      behaviorHints: {
        notWebReady: true,
        bingeGroup:
          `mxplayer-${quality.label}`
      }
    })
  );
}

/* =========================================================
   MANIFEST
========================================================= */

const manifest = {
  id: "com.minecraft.mxplayer",
  version: VERSION,
  name: "MX Player Free",
  description:
    "Automatic MX Player India stream resolver.",

  resources: [
    {
      name: "stream",
      types: ["movie"],
      idPrefixes: ["tt"]
    },
    {
      name: "stream",
      types: ["series"],
      idPrefixes: ["tt"]
    }
  ],

  types: [
    "movie",
    "series"
  ]
};

/* =========================================================
   CORS
========================================================= */

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
      "GET,OPTIONS"
    );

    if (
      req.method === "OPTIONS"
    ) {
      return res.sendStatus(200);
    }

    next();
  }
);

/* =========================================================
   BASIC ROUTES
========================================================= */

app.get(
  "/",
  (req, res) => {
    res.json({
      addon: "MX Player Free",
      version: VERSION,
      status: "ok"
    });
  }
);

app.get(
  "/health",
  (req, res) => {
    res.json({
      status: "ok",
      version: VERSION,
      resolver:
        "webUrl -> SEO -> canonical ID -> detail"
    });
  }
);

app.get(
  "/manifest.json",
  (req, res) => {
    res.json(manifest);
  }
);

/* =========================================================
   DEBUG: SEARCH
========================================================= */

app.get(
  "/debug/mx-search/:query",
  async (req, res) => {
    try {
      const rows =
        await mxSearchRaw(
          req.params.query
        );

      res.json({
        ok: true,
        query:
          req.params.query,

        results:
          rows
            .slice(0, 60)
            .map(item => ({
              id: item.id,
              type: typeOf(item),
              title: item.title,
              webUrl:
                webUrlOf(item),
              episodeNo:
                episodeNo(item),
              seasonNo:
                seasonNo(item),
              hasStream:
                !!streamObject(item),
              stream:
                parseStream(
                  streamObject(item)
                )
            }))
      });
    } catch (error) {
      res.json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
);

/* =========================================================
   DEBUG: SEASON EPISODES
========================================================= */

app.get(
  "/debug/mx-episodes/:seasonId",
  async (req, res) => {
    try {
      const episodes =
        await seasonEpisodes(
          req.params.seasonId
        );

      res.json({
        ok: true,
        seasonId:
          req.params.seasonId,
        count:
          episodes.length,

        episodes:
          episodes.map(
            episode => ({
              id:
                episode.id,

              type:
                typeOf(episode),

              title:
                episode.title,

              episodeNo:
                episodeNo(episode),

              webUrl:
                webUrlOf(episode),

              hasStream:
                !!streamObject(
                  episode
                ),

              stream:
                parseStream(
                  streamObject(
                    episode
                  )
                ),

              keys:
                Object.keys(
                  episode
                )
            })
          )
      });
    } catch (error) {
      res.json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
);

/* =========================================================
   DEBUG: SEO
========================================================= */

app.get(
  "/debug/mx-seo",
  async (req, res) => {
    try {
      const value =
        req.query.url;

      if (!value) {
        return res.json({
          ok: false,
          error:
            "Use ?url=/movie/... or ?url=https://www.mxplayer.in/..."
        });
      }

      const result =
        await seoResolve(
          value
        );

      res.json({
        ok: true,
        input: value,
        path:
          result.path,
        canonical: {
          id:
            result.id,
          type:
            result.type,
          title:
            result.title
        },
        data:
          result.data
      });
    } catch (error) {
      res.json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
);

/* =========================================================
   DEBUG: DETAIL
========================================================= */

app.get(
  "/debug/mx-detail/:type/:id",
  async (req, res) => {
    try {
      const detail =
        await detailVideo(
          req.params.id,
          req.params.type
        );

      res.json({
        ok: true,
        id:
          req.params.id,
        type:
          req.params.type,

        statusCode:
          detail?.statusCode ??
          detail?.data?.statusCode ??
          null,

        title:
          detail?.title ??
          detail?.data?.title ??
          null,

        topLevelKeys:
          Object.keys(
            detail || {}
          ),

        stream:
          parseStream(
            streamObject(detail)
          ),

        raw:
          detail
      });
    } catch (error) {
      res.json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
);

/* =========================================================
   DEBUG: FULL RESOLUTION
========================================================= */

app.get(
  "/debug/resolve/:type/:videoId",
  async (req, res) => {
    try {
      if (
        req.params.type === "movie"
      ) {
        const result =
          await resolveMovie(
            req.params.videoId
          );

        return res.json({
          ok: true,
          type: "movie",
          id:
            req.params.videoId,

          title:
            result.title,

          year:
            result.year,

          source:
            result.source,

          mxMovie: {
            id:
              result.mxMovie.id,

            type:
              typeOf(
                result.mxMovie
              ),

            title:
              result.mxMovie.title,

            webUrl:
              webUrlOf(
                result.mxMovie
              ),

            hasStream:
              !!streamObject(
                result.mxMovie
              )
          },

          seo:
            result.seo
              ? {
                  id:
                    result.seo.id,
                  type:
                    result.seo.type,
                  title:
                    result.seo.title,
                  path:
                    result.seo.path
                }
              : null,

          stream:
            result.stream
        });
      }

      if (
        req.params.type ===
        "series"
      ) {
        const parts =
          req.params.videoId.split(
            ":"
          );

        if (
          parts.length !== 3
        ) {
          throw new Error(
            "Series ID must be ttXXXX:season:episode"
          );
        }

        const result =
          await resolveSeries(
            parts[0],
            Number(parts[1]),
            Number(parts[2])
          );

        return res.json({
          ok: true,
          type: "series",
          id:
            req.params.videoId,

          title:
            result.title,

          source:
            result.source,

          show: {
            id:
              result.show.id,

            title:
              result.show.title,

            webUrl:
              webUrlOf(
                result.show
              )
          },

          season: {
            id:
              result.season.id,

            title:
              result.season.title,

            number:
              result.season.number,

            webUrl:
              result.season.webUrl
          },

          episode: {
            id:
              result.episode.id,

            title:
              result.episode.title,

            episodeNo:
              episodeNo(
                result.episode
              ),

            webUrl:
              webUrlOf(
                result.episode
              ),

            hasStream:
              !!streamObject(
                result.episode
              ),

            stream:
              parseStream(
                streamObject(
                  result.episode
                )
              )
          },

          seo:
            result.seo
              ? {
                  id:
                    result.seo.id,
                  type:
                    result.seo.type,
                  title:
                    result.seo.title,
                  path:
                    result.seo.path
                }
              : null,

          resolvedStream:
            result.stream
        });
      }

      throw new Error(
        "Unsupported type"
      );
    } catch (error) {
      res.json({
        ok: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
);

/* =========================================================
   STREMIO STREAM ENDPOINT
========================================================= */

app.get(
  "/stream/:type/:videoId.json",
  async (req, res) => {
    try {
      let result;

      if (
        req.params.type ===
        "movie"
      ) {
        result =
          await resolveMovie(
            req.params.videoId
          );
      } else if (
        req.params.type ===
        "series"
      ) {
        const parts =
          req.params.videoId.split(
            ":"
          );

        if (
          parts.length !== 3
        ) {
          return res.json({
            streams: []
          });
        }

        result =
          await resolveSeries(
            parts[0],
            Number(parts[1]),
            Number(parts[2])
          );
      } else {
        return res.json({
          streams: []
        });
      }

      const streams =
        await makeStreams(
          result.stream
        );

      console.log(
        `[STREAM] ${req.params.videoId}: ` +
        `${result.source}, ` +
        `${streams.length} streams`
      );

      return res.json({
        streams
      });
    } catch (error) {
      console.error(
        `[STREAM ERROR] ${error.message}`
      );

      return res.json({
        streams: []
      });
    }
  }
);

/* =========================================================
   AUDIO + VIDEO HLS MASTER
========================================================= */

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

    if (!video) {
      return res
        .status(400)
        .send("Missing video");
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
      `BANDWIDTH=5000000` +
      (
        audio
          ? `,AUDIO="audio"`
          : ""
      )
    );

    lines.push(video);

    res.setHeader(
      "Content-Type",
      "application/vnd.apple.mpegurl"
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

/* =========================================================
   START
========================================================= */

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
