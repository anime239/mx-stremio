const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const VERSION = "17.0.0";

const BASE = "https://api.mxplayer.in/v1/web";
const SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io";
const CDN = "https://d3sgzbosmwirao.cloudfront.net";

const ADDON =
  "https://my-stremio-addon-q8ep.onrender.com";

const USER_ID = crypto.randomUUID();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/148.0.0.0 Mobile Safari/537.36",

  Accept:
    "application/json, text/plain, */*",

  Referer:
    "https://www.mxplayer.in/",

  Origin:
    "https://www.mxplayer.in"
};


/* ============================================================
   DEFAULT MX PARAMETERS
   ============================================================ */

function defaults() {
  return {
    "device-density": "2",
    platform: "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: USER_ID
  };
}


/* ============================================================
   HTTP
   ============================================================ */

async function getJson(
  url,
  options = {},
  timeout = 20000
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () => controller.abort(),
      timeout
    );

  try {
    const response =
      await fetch(
        url,
        {
          ...options,
          signal:
            controller.signal
        }
      );

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ` +
        text.slice(0, 250)
      );
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Invalid JSON from ${url}`
      );
    }

  } finally {
    clearTimeout(timer);
  }
}


async function mxGet(
  path,
  params = {}
) {
  const url =
    new URL(
      BASE + path
    );

  for (
    const [key, value]
      of Object.entries({
        ...defaults(),
        ...params
      })
  ) {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  return getJson(
    url.toString(),
    {
      headers: HEADERS
    }
  );
}


async function mxPost(
  path,
  params = {},
  body = {}
) {
  const url =
    new URL(
      BASE + path
    );

  for (
    const [key, value]
      of Object.entries({
        ...defaults(),
        ...params
      })
  ) {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  return getJson(
    url.toString(),
    {
      method:
        "POST",

      headers: {
        ...HEADERS,
        "Content-Type":
          "application/json"
      },

      body:
        JSON.stringify(body)
    }
  );
}


/* ============================================================
   CINEMETA
   ============================================================ */

async function cinemeta(
  type,
  id
) {
  return getJson(
    `${CINEMETA}/meta/${type}/${encodeURIComponent(id)}.json`,
    {
      headers: {
        "User-Agent":
          HEADERS["User-Agent"],

        Accept:
          "application/json"
      }
    }
  );
}


/* ============================================================
   OBJECT HELPERS
   ============================================================ */

function objects(
  value,
  output = [],
  seen = new Set()
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    seen.has(value)
  ) {
    return output;
  }

  seen.add(value);

  output.push(value);

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      objects(
        item,
        output,
        seen
      );
    }
  } else {
    for (
      const child
      of Object.values(value)
    ) {
      if (
        child &&
        typeof child ===
          "object"
      ) {
        objects(
          child,
          output,
          seen
        );
      }
    }
  }

  return output;
}


function typeOf(
  item
) {
  return String(
    item?.type ??
    item?.contentType ??
    item?.content_type ??
    ""
  ).toLowerCase();
}


function webUrlOf(
  item
) {
  for (
    const key of [
      "webUrl",
      "webURL",
      "web_url",
      "canonicalUrl",
      "canonicalURL",
      "url"
    ]
  ) {
    if (item?.[key]) {
      return String(
        item[key]
      );
    }
  }

  return null;
}


function normalizeTitle(
  value
) {
  return String(
    value || ""
  )
    .toLowerCase()
    .normalize("NFKD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .replace(
      /\s+/g,
      " "
    )
    .trim();
}


function titleScore(
  a,
  b
) {
  const x =
    normalizeTitle(a);

  const y =
    normalizeTitle(b);

  if (!x || !y) {
    return 0;
  }

  if (x === y) {
    return 100;
  }

  if (
    x.includes(y) ||
    y.includes(x)
  ) {
    return 85;
  }

  const A =
    new Set(
      x.split(" ")
    );

  const B =
    new Set(
      y.split(" ")
    );

  let common = 0;

  for (
    const word of A
  ) {
    if (B.has(word)) {
      common++;
    }
  }

  return Math.round(
    (
      common /
      Math.max(
        A.size,
        B.size
      )
    ) * 70
  );
}


/* ============================================================
   SEASON / EPISODE NUMBER
   ============================================================ */

function seasonNumber(
  item
) {
  for (
    const value of [
      item?.sequence,
      item?.season_number,
      item?.seasonNo,
      item?.seasonNumber,
      item?.number
    ]
  ) {
    if (
      value !== undefined &&
      value !== null &&
      Number.isFinite(
        Number(value)
      ) &&
      Number(value) > 0
    ) {
      return Number(value);
    }
  }

  const text =
    String(
      item?.title ||
      item?.name ||
      ""
    );

  const match =
    text.match(
      /\b(?:season|s)\s*[-._#:]?\s*(\d{1,3})\b/i
    );

  return match
    ? Number(match[1])
    : null;
}


function episodeNumber(
  item
) {
  for (
    const value of [
      item?.episodeNo,
      item?.episode_number,
      item?.episodeNumber,
      item?.episode_no,
      item?.sequence
    ]
  ) {
    if (
      value !== undefined &&
      value !== null &&
      Number.isFinite(
        Number(value)
      )
    ) {
      return Number(value);
    }
  }

  const text =
    String(
      item?.title ||
      item?.name ||
      ""
    );

  const match =
    text.match(
      /\b(?:episode|ep|e)\s*[-._#:]?\s*(\d{1,3})\b/i
    );

  return match
    ? Number(match[1])
    : null;
}


/* ============================================================
   MX SEARCH
   ============================================================ */

async function mxSearchRaw(
  query
) {
  const data =
    await mxPost(
      "/search/resultv2",
      {
        query
      },
      {}
    );

  return objects(
    data
  ).filter(
    item => {
      const type =
        typeOf(item);

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


async function mxSearch(
  query
) {
  const rows =
    await mxSearchRaw(
      query
    );

  const map =
    new Map();

  for (
    const item of rows
  ) {
    const key =
      `${typeOf(item)}:${item.id}`;

    if (
      !map.has(key)
    ) {
      map.set(
        key,
        item
      );
    }
  }

  return [
    ...map.values()
  ];
}


function pickShow(
  rows,
  title
) {
  return rows
    .filter(
      item =>
        typeOf(item) ===
        "tvshow"
    )
    .map(
      item => ({
        item,
        score:
          titleScore(
            item.title,
            title
          )
      })
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )[0]?.item || null;
}


function pickMovie(
  rows,
  title,
  year
) {
  const ranked =
    rows
      .filter(
        item =>
          typeOf(item) ===
          "movie"
      )
      .map(
        item => {
          let score =
            titleScore(
              item.title,
              title
            );

          const itemYear =
            item.year ||
            item.releaseYear ||
            (
              item.releaseDate
                ? String(
                    item.releaseDate
                  ).slice(0, 4)
                : null
            );

          if (
            year &&
            itemYear &&
            String(year)
              .slice(0, 4) ===
              String(itemYear)
                .slice(0, 4)
          ) {
            score += 25;
          }

          return {
            item,
            score
          };
        }
      )
      .sort(
        (a, b) =>
          b.score -
          a.score
      );

  return (
    ranked[0]?.score >= 50
  )
    ? ranked[0].item
    : null;
}


function pickSeason(
  rows,
  number,
  showTitle
) {
  return rows
    .filter(
      item =>
        typeOf(item) ===
          "season" &&
        seasonNumber(item) ===
          Number(number)
    )
    .map(
      item => ({
        item,
        score:
          titleScore(
            item.title,
            showTitle
          )
      })
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )[0]?.item || null;
}


/* ============================================================
   SHOW HTML SEASON FALLBACK
   ============================================================ */

function balancedJson(
  text,
  start
) {
  const open =
    text[start];

  if (
    open !== "{" &&
    open !== "["
  ) {
    return null;
  }

  const close =
    open === "{"
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
    const ch =
      text[i];

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

    if (ch === open) {
      depth++;
    } else if (
      ch === close
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


function extractMxsState(
  html
) {
  for (
    const pattern of [
      /window\.__mxs__\s*=\s*/,
      /__mxs__\s*=\s*/
    ]
  ) {
    const match =
      pattern.exec(
        html
      );

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

      const raw =
        balancedJson(
          html,
          i
        );

      if (!raw) {
        break;
      }

      try {
        return JSON.parse(
          raw
        );
      } catch {
        break;
      }
    }
  }

  return null;
}


async function showSeasonsFromPage(
  webUrl
) {
  if (!webUrl) {
    return [];
  }

  const fullUrl =
    String(webUrl).startsWith(
      "http"
    )
      ? webUrl
      : `https://www.mxplayer.in${webUrl}`;

  try {
    const response =
      await fetch(
        fullUrl,
        {
          headers: {
            "User-Agent":
              HEADERS[
                "User-Agent"
              ],

            Referer:
              "https://www.mxplayer.in/"
          },

          signal:
            AbortSignal.timeout(
              15000
            )
        }
      );

    const html =
      await response.text();

    const state =
      extractMxsState(
        html
      );

    const found =
      new Map();

    for (
      const entity of
        objects(state)
    ) {
      if (
        typeOf(entity) !==
        "tvshow"
      ) {
        continue;
      }

      for (
        const tab of
          Array.isArray(
            entity.tabs
          )
            ? entity.tabs
            : []
      ) {
        if (
          tab?.type !==
          "tvshowepisodes"
        ) {
          continue;
        }

        for (
          const container of
            Array.isArray(
              tab.containers
            )
              ? tab.containers
              : []
        ) {
          if (
            typeOf(container) !==
              "season" ||
            !container.id
          ) {
            continue;
          }

          const number =
            seasonNumber(
              container
            );

          if (
            number &&
            !found.has(
              number
            )
          ) {
            found.set(
              number,
              {
                id:
                  String(
                    container.id
                  ),

                title:
                  container.title ||
                  `Season ${number}`,

                number,

                webUrl:
                  webUrlOf(
                    container
                  )
              }
            );
          }
        }
      }
    }

    return [
      ...found.values()
    ].sort(
      (a, b) =>
        a.number -
        b.number
    );

  } catch (error) {
    console.log(
      `[SEASONS PAGE] ${error.message}`
    );

    return [];
  }
}


/* ============================================================
   FIND REQUESTED SEASON
   ============================================================ */

async function findSeason(
  show,
  title,
  number,
  initialRows
) {
  /*
   * First:
   * The search response itself already contains season
   * objects. This is the preferred route.
   */

  let season =
    pickSeason(
      initialRows,
      number,
      title
    );

  if (season) {
    return {
      id:
        String(
          season.id
        ),

      title:
        season.title,

      number:
        Number(number),

      webUrl:
        webUrlOf(
          season
        )
    };
  }


  /*
   * Second:
   * Search specifically for the requested season.
   */

  try {
    const rows =
      await mxSearch(
        `${title} season ${number}`
      );

    season =
      pickSeason(
        rows,
        number,
        title
      );

    if (season) {
      return {
        id:
          String(
            season.id
          ),

        title:
          season.title,

        number:
          Number(number),

        webUrl:
          webUrlOf(
            season
          )
      };
    }

  } catch (error) {
    console.log(
      `[SEASON SEARCH] ${error.message}`
    );
  }


  /*
   * Third:
   * Parse the show's __mxs__ page state.
   */

  const pageSeasons =
    await showSeasonsFromPage(
      webUrlOf(show)
    );

  const pageSeason =
    pageSeasons.find(
      item =>
        item.number ===
        Number(number)
    );

  if (pageSeason) {
    return pageSeason;
  }

  throw new Error(
    `MX Season ${number} not found`
  );
}


/* ============================================================
   SEASON EPISODES
   ============================================================ */

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
      type:
        "season",

      id:
        seasonId,

      sortOrder:
        "0"
    };

    if (next) {
      try {
        const nextParams =
          new URLSearchParams(
            next
          );

        for (
          const [key, value]
            of nextParams.entries()
        ) {
          params[key] =
            value;
        }
      } catch {
        params.page =
          next;
      }
    }

    const data =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    const payload =
      data?.data !==
        undefined
        ? data.data
        : data;

    const items =
      Array.isArray(
        payload
      )
        ? payload
        : Array.isArray(
            payload?.items
          )
          ? payload.items
          : [];

    if (
      !items.length
    ) {
      break;
    }

    all.push(
      ...items
    );

    const token =
      !Array.isArray(
        payload
      )
        ? payload?.next
        : null;

    if (!token) {
      break;
    }

    next =
      token;
  }

  return all;
}


/* ============================================================
   STREAM OBJECT
   ============================================================ */

function getStreamObject(
  item
) {
  if (
    !item ||
    typeof item !==
      "object"
  ) {
    return null;
  }

  /*
   * THIS IS THE IMPORTANT V17 CHANGE.
   *
   * Episode-list items can contain:
   *
   * item.stream
   */

  if (
    item.stream &&
    typeof item.stream ===
      "object"
  ) {
    return item.stream;
  }

  if (
    item.data?.stream &&
    typeof item.data.stream ===
      "object"
  ) {
    return item.data.stream;
  }

  if (
    item.result?.stream &&
    typeof item.result.stream ===
      "object"
  ) {
    return item.result.stream;
  }

  return null;
}


function parseStream(
  stream
) {
  if (!stream) {
    return null;
  }

  const hls =
    stream.hls ||
    {};

  const dash =
    stream.dash ||
    {};

  const thirdParty =
    stream.thirdParty ||
    {};

  const altBalaji =
    stream.altBalaji ||
    {};

  const mxplay =
    stream.mxplay ||
    {};

  let hlsUrl =
    hls.high ||
    hls.base ||
    hls.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    mxplay.hls?.high ||
    null;

  if (
    hlsUrl &&
    !String(
      hlsUrl
    ).startsWith(
      "http"
    )
  ) {
    hlsUrl =
      `${CDN}/${String(
        hlsUrl
      ).replace(
        /^\/+/,
        ""
      )}`;
  }

  let dashUrl =
    dash.high ||
    dash.base ||
    dash.main ||
    thirdParty.dashUrl ||
    altBalaji.dashUrl ||
    mxplay.dash?.high ||
    null;

  if (
    dashUrl &&
    !String(
      dashUrl
    ).startsWith(
      "http"
    )
  ) {
    dashUrl =
      `${CDN}/${String(
        dashUrl
      ).replace(
        /^\/+/,
        ""
      )}`;
  }

  return {
    hls:
      hlsUrl,

    dash:
      dashUrl,

    videoHash:
      stream.videoHash ||
      null,

    drmProtect:
      !!stream.drmProtect,

    provider:
      stream.provider ||
      "mxplay"
  };
}


/* ============================================================
   DETAIL VIDEO
   ============================================================ */

async function detailVideo(
  id,
  type
) {
  return mxGet(
    "/detail/video",
    {
      id,
      type
    }
  );
}


/* ============================================================
   MOVIE
   ============================================================ */

async function resolveMovie(
  imdbId
) {
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

  const rows =
    await mxSearch(
      title
    );

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
   * V17:
   *
   * Check the search result itself first.
   */

  const directStream =
    parseStream(
      getStreamObject(
        movie
      )
    );

  if (
    directStream?.hls ||
    directStream?.dash
  ) {
    return {
      title,
      year,

      mxMovie:
        movie,

      source:
        "search-stream",

      stream:
        directStream,

      detail:
        movie
    };
  }


  /*
   * Fallback:
   *
   * /detail/video?type=movie&id=...
   */

  const detail =
    await detailVideo(
      movie.id,
      "movie"
    );

  const parsed =
    parseStream(
      getStreamObject(
        detail
      )
    );

  if (
    !parsed?.hls &&
    !parsed?.dash
  ) {
    throw new Error(
      `MX movie has no stream object ` +
      `(id=${movie.id}, ` +
      `statusCode=${detail?.statusCode ?? "none"})`
    );
  }

  return {
    title,
    year,

    mxMovie:
      movie,

    source:
      "detail-video",

    stream:
      parsed,

    detail
  };
}


/* ============================================================
   SERIES
   ============================================================ */

async function resolveSeries(
  imdbId,
  seasonNumberRequested,
  episodeNumberRequested
) {
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

  const title =
    meta.name;


  /* Search MX show */

  const rows =
    await mxSearch(
      title
    );

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


  /* Find requested season */

  const season =
    await findSeason(
      show,
      title,
      seasonNumberRequested,
      rows
    );


  /* Fetch episodes */

  const episodes =
    await seasonEpisodes(
      season.id
    );


  /* Match requested episode */

  const episode =
    episodes.find(
      item =>
        episodeNumber(
          item
        ) ===
        Number(
          episodeNumberRequested
        )
    );

  if (!episode) {
    throw new Error(
      `MX Episode ${episodeNumberRequested} ` +
      `not found in Season ${seasonNumberRequested}`
    );
  }


  /*
   * ==========================================================
   * KEY V17 FIX
   * ==========================================================
   *
   * Current MX season endpoint returns the stream
   * directly inside the episode item.
   *
   * We use it FIRST.
   */

  const directStream =
    parseStream(
      getStreamObject(
        episode
      )
    );

  if (
    directStream?.hls ||
    directStream?.dash
  ) {
    return {
      title,

      show,

      season,

      episode,

      source:
        "episode-list-stream",

      stream:
        directStream,

      detail:
        episode
    };
  }


  /*
   * Fallback:
   *
   * If episode has a canonical web URL,
   * use SEO → detail/video.
   */

  if (
    webUrlOf(
      episode
    )
  ) {
    try {
      const path =
        new URL(
          webUrlOf(
            episode
          ),
          "https://www.mxplayer.in"
        ).pathname;

      const seoUrl =
        new URL(
          `${SEO}/get-url-details`
        );

      for (
        const [key, value]
          of Object.entries({
            ...defaults(),
            url: path
          })
      ) {
        seoUrl.searchParams.set(
          key,
          String(value)
        );
      }

      const seo =
        await getJson(
          seoUrl.toString(),
          {
            headers:
              HEADERS
          }
        );

      const data =
        seo?.data;

      if (
        data?.id &&
        data?.type
      ) {
        const detail =
          await detailVideo(
            data.id,
            data.type
          );

        const parsed =
          parseStream(
            getStreamObject(
              detail
            )
          );

        if (
          parsed?.hls ||
          parsed?.dash
        ) {
          return {
            title,

            show,

            season,

            episode,

            source:
              "seo-detail",

            stream:
              parsed,

            detail,

            seo: {
              id:
                data.id,

              type:
                data.type
            }
          };
        }
      }

    } catch (error) {
      console.log(
        `[EP SEO] ${error.message}`
      );
    }
  }


  /*
   * Final fallback:
   *
   * Direct episode ID.
   */

  const detail =
    await detailVideo(
      episode.id,
      "episode"
    );

  const parsed =
    parseStream(
      getStreamObject(
        detail
      )
    );

  if (
    !parsed?.hls &&
    !parsed?.dash
  ) {
    throw new Error(
      `MX episode has no stream object ` +
      `(id=${episode.id}, ` +
      `statusCode=${detail?.statusCode ?? "none"})`
    );
  }

  return {
    title,

    show,

    season,

    episode,

    source:
      "episode-detail",

    stream:
      parsed,

    detail
  };
}


/* ============================================================
   HLS TEST
   ============================================================ */

async function urlWorks(
  url
) {
  try {
    const response =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              HEADERS[
                "User-Agent"
              ],

            Referer:
              "https://www.mxplayer.in/"
          },

          signal:
            AbortSignal.timeout(
              9000
            )
        }
      );

    return response.ok;

  } catch {
    return false;
  }
}


/* ============================================================
   QUALITY DISCOVERY
   ============================================================ */

async function discoverHls(
  hls
) {
  if (!hls) {
    return [];
  }


  /*
   * First check whether the returned URL
   * is itself a master playlist.
   */

  let text = "";

  try {
    const response =
      await fetch(
        hls,
        {
          headers: {
            "User-Agent":
              HEADERS[
                "User-Agent"
              ],

            Referer:
              "https://www.mxplayer.in/"
          },

          signal:
            AbortSignal.timeout(
              12000
            )
        }
      );

    if (response.ok) {
      text =
        await response.text();
    }

  } catch {}


  if (
    text.includes(
      "#EXT-X-STREAM-INF:"
    )
  ) {
    const lines =
      text
        .split(/\r?\n/)
        .map(
          x => x.trim()
        )
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

      const attrs =
        lines[i].slice(
          lines[i].indexOf(":") + 1
        );

      const resolution =
        attrs.match(
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

    if (
      result.length
    ) {
      return result;
    }
  }


  /*
   * Direct MX HLS naming.
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
      const file of files
    ) {
      const url =
        base + file;

      if (
        await urlWorks(
          url
        )
      ) {
        found.push({
          label,
          url
        });

        break;
      }
    }
  }


  if (
    !found.length
  ) {
    found.push({
      label:
        "High",

      url:
        hls
    });
  }

  return found;
}


/* ============================================================
   AUDIO
   ============================================================ */

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
      await urlWorks(
        url
      )
    ) {
      return url;
    }
  }

  return null;
}


/* ============================================================
   STREAM OBJECTS FOR STREMIO
   ============================================================ */

function masterUrl(
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
    await discoverHls(
      hls
    );

  const audio =
    await findAudio(
      hls
    );

  return qualities.map(
    quality => ({
      name:
        `MX Player ${quality.label}`,

      title:
        `MX Player • ${quality.label}` +
        (
          audio
            ? " • Audio"
            : ""
        ),

      url:
        masterUrl(
          quality.url,
          audio,
          quality.label
        ),

      behaviorHints: {
        notWebReady:
          true,

        bingeGroup:
          `mxplayer-${quality.label}`
      }
    })
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
      name:
        "stream",

      types:
        ["movie"],

      idPrefixes:
        ["tt"]
    },

    {
      name:
        "stream",

      types:
        ["series"],

      idPrefixes:
        ["tt"]
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
      "GET,OPTIONS"
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
   BASIC
   ============================================================ */

app.get(
  "/",
  (req, res) => {
    res.json({
      addon:
        "MX Player Free",

      version:
        VERSION,

      status:
        "ok"
    });
  }
);


app.get(
  "/health",
  (req, res) => {
    res.json({
      status:
        "ok",

      version:
        VERSION,

      resolver:
        "automatic"
    });
  }
);


app.get(
  "/manifest.json",
  (req, res) => {
    res.json(
      manifest
    );
  }
);


/* ============================================================
   DEBUG SEARCH
   ============================================================ */

app.get(
  "/debug/mx-search/:query",
  async (req, res) => {
    try {
      const rows =
        await mxSearchRaw(
          req.params.query
        );

      res.json({
        ok:
          true,

        query:
          req.params.query,

        results:
          rows
            .slice(0, 60)
            .map(
              item => ({
                id:
                  item.id,

                type:
                  typeOf(
                    item
                  ),

                title:
                  item.title,

                webUrl:
                  webUrlOf(
                    item
                  ),

                episodeNo:
                  episodeNumber(
                    item
                  ),

                seasonNo:
                  seasonNumber(
                    item
                  ),

                hasStream:
                  !!getStreamObject(
                    item
                  ),

                stream:
                  parseStream(
                    getStreamObject(
                      item
                    )
                  )
              })
            )
      });

    } catch (error) {
      res.json({
        ok:
          false,

        error:
          error.message,

        stack:
          error.stack
      });
    }
  }
);


/* ============================================================
   DEBUG RESOLVE
   ============================================================ */

app.get(
  "/debug/resolve/:type/:videoId",
  async (req, res) => {
    try {

      /* MOVIE */

      if (
        req.params.type ===
        "movie"
      ) {
        const result =
          await resolveMovie(
            req.params.videoId
          );

        return res.json({
          ok:
            true,

          type:
            "movie",

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
              !!getStreamObject(
                result.mxMovie
              )
          },

          stream:
            result.stream
        });
      }


      /* SERIES */

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
          ok:
            true,

          type:
            "series",

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
              result.season.number
          },

          episode: {
            id:
              result.episode.id,

            title:
              result.episode.title,

            episodeNo:
              episodeNumber(
                result.episode
              ),

            webUrl:
              webUrlOf(
                result.episode
              ),

            hasStream:
              !!getStreamObject(
                result.episode
              ),

            stream:
              parseStream(
                getStreamObject(
                  result.episode
                )
              )
          },

          resolvedStream:
            result.stream,

          seo:
            result.seo ||
            null
        });
      }


      throw new Error(
        "Unsupported type"
      );

    } catch (error) {
      res.json({
        ok:
          false,

        error:
          error.message,

        stack:
          error.stack
      });
    }
  }
);


/* ============================================================
   STREMIO STREAM ENDPOINT
   ============================================================ */

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
            streams:
              []
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
          streams:
            []
        });
      }


      const streams =
        await makeStreams(
          result.stream
        );

      console.log(
        `[STREAM] ` +
        `${req.params.videoId}: ` +
        `${result.source}, ` +
        `${streams.length} streams`
      );

      return res.json({
        streams
      });

    } catch (error) {
      console.error(
        `[STREAM ERROR] ` +
        error.message
      );

      return res.json({
        streams:
          []
      });
    }
  }
);


/* ============================================================
   HLS MASTER
   ============================================================ */

app.get(
  "/hls/master",
  (req, res) => {
    const video =
      req.query.video;

    const audio =
      req.query.audio;

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
      `BANDWIDTH=5000000` +
      (
        audio
          ? `,AUDIO="audio"`
          : ""
      ),

      video
    );

    res.setHeader(
      "Content-Type",
      "application/vnd.apple.mpegurl"
    );

    res.setHeader(
      "Cache-Control",
      "no-cache"
    );

    res.send(
      lines.join(
        "\n"
      ) +
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
