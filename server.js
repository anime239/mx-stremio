const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const VERSION = "19.0.0";

const BASE = "https://api.mxplayer.in/v1/web";
const SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io";
const MXWEB = "https://www.mxplayer.in";
const DEFAULT_CDN =
  "https://d3sgzbosmwirao.cloudfront.net";

const ADDON =
  "https://my-stremio-addon-q8ep.onrender.com";

const USER_ID = crypto.randomUUID();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/125.0.0.0 Safari/537.36",

  Accept:
    "application/json, text/plain, */*",

  Referer:
    "https://www.mxplayer.in/",

  Origin:
    "https://www.mxplayer.in"
};

/* =========================================================
   MX DEFAULT PARAMETERS
========================================================= */

function mxParams(extra = {}) {
  return {
    "device-density": "2",
    platform: "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: USER_ID,
    ...extra
  };
}

/* =========================================================
   HTTP
========================================================= */

async function request(
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
      await fetch(url, {
        ...options,
        signal:
          controller.signal
      });

    const text =
      await response.text();

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${text.slice(
          0,
          500
        )}`
      );
    }

    return {
      response,
      text
    };
  } finally {
    clearTimeout(timer);
  }
}

async function getJson(
  url,
  options = {},
  timeout = 20000
) {
  const result =
    await request(
      url,
      options,
      timeout
    );

  try {
    return JSON.parse(
      result.text
    );
  } catch {
    throw new Error(
      `Invalid JSON response from ${url}`
    );
  }
}

async function getText(
  url,
  options = {},
  timeout = 25000
) {
  const result =
    await request(
      url,
      options,
      timeout
    );

  return result.text;
}

/* =========================================================
   MX API
========================================================= */

async function mxGet(
  path,
  query = {}
) {
  const url =
    new URL(
      BASE + path
    );

  for (
    const [
      key,
      value
    ] of Object.entries(
      mxParams(query)
    )
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
  query = {},
  body = {}
) {
  const url =
    new URL(
      BASE + path
    );

  for (
    const [
      key,
      value
    ] of Object.entries(
      mxParams(query)
    )
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
      method: "POST",

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

/* =========================================================
   CINEMETA
========================================================= */

async function cinemeta(
  type,
  id
) {
  return getJson(
    `${CINEMETA}/meta/${type}/${encodeURIComponent(
      id
    )}.json`,
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

/* =========================================================
   OBJECT HELPERS
========================================================= */

function allObjects(
  value,
  result = [],
  seen = new Set()
) {
  if (
    value === null ||
    typeof value !== "object" ||
    seen.has(value)
  ) {
    return result;
  }

  seen.add(value);
  result.push(value);

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      allObjects(
        item,
        result,
        seen
      );
    }
  } else {
    for (
      const item of Object.values(
        value
      )
    ) {
      if (
        item &&
        typeof item === "object"
      ) {
        allObjects(
          item,
          result,
          seen
        );
      }
    }
  }

  return result;
}

function itemType(
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
  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  for (
    const key of [
      "webUrl",
      "webURL",
      "web_url",
      "shareUrl",
      "shareURL"
    ]
  ) {
    if (
      item[key]
    ) {
      return String(
        item[key]
      );
    }
  }

  return null;
}

function normalize(
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
    normalize(a);

  const y =
    normalize(b);

  if (
    !x ||
    !y
  ) {
    return 0;
  }

  if (
    x === y
  ) {
    return 100;
  }

  if (
    x.includes(y) ||
    y.includes(x)
  ) {
    return 90;
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
    if (
      B.has(word)
    ) {
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
    ) * 75
  );
}

/*
 IMPORTANT:
 MX uses "sequence" for episode/season number.
*/

function getSequence(
  item
) {
  for (
    const value of [
      item?.sequence,
      item?.episodeNo,
      item?.episode_no,
      item?.episode_number,
      item?.episodeNumber,
      item?.seasonNo,
      item?.seasonNumber
    ]
  ) {
    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== "" &&
      Number.isFinite(
        Number(value)
      )
    ) {
      return Number(value);
    }
  }

  return null;
}

function getEpisodeNumber(
  item
) {
  if (
    item?.sequence !== undefined &&
    item?.sequence !== null
  ) {
    return Number(
      item.sequence
    );
  }

  for (
    const value of [
      item?.episodeNo,
      item?.episode_no,
      item?.episode_number,
      item?.episodeNumber
    ]
  ) {
    if (
      Number.isFinite(
        Number(value)
      )
    ) {
      return Number(
        value
      );
    }
  }

  const match =
    String(
      item?.title ||
        item?.name ||
        ""
    ).match(
      /\b(?:episode|ep|e)\s*[-._#: ]?\s*(\d{1,3})\b/i
    );

  return match
    ? Number(
        match[1]
      )
    : null;
}

function getSeasonNumber(
  item
) {
  for (
    const value of [
      item?.sequence,
      item?.seasonNo,
      item?.seasonNumber,
      item?.season_number
    ]
  ) {
    if (
      Number.isFinite(
        Number(value)
      ) &&
      Number(value) > 0
    ) {
      return Number(
        value
      );
    }
  }

  const match =
    String(
      item?.title ||
        item?.name ||
        ""
    ).match(
      /\b(?:season|s)\s*[-._#: ]?\s*(\d{1,3})\b/i
    );

  return match
    ? Number(
        match[1]
      )
    : null;
}

/* =========================================================
   MX SEARCH
========================================================= */

async function mxSearchRaw(
  query
) {
  const response =
    await mxPost(
      "/search/resultv2",
      {
        query
      },
      {}
    );

  return allObjects(
    response
  ).filter(
    item => {
      const type =
        itemType(item);

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

  const unique =
    new Map();

  for (
    const item of rows
  ) {
    const key =
      `${itemType(item)}:${item.id}`;

    if (
      !unique.has(key)
    ) {
      unique.set(
        key,
        item
      );
    }
  }

  return [
    ...unique.values()
  ];
}

function chooseShow(
  rows,
  title
) {
  return rows
    .filter(
      x =>
        itemType(x) ===
        "tvshow"
    )
    .map(
      x => ({
        item: x,
        score:
          titleScore(
            x.title,
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

function chooseMovie(
  rows,
  title,
  year
) {
  return rows
    .filter(
      x =>
        itemType(x) ===
        "movie"
    )
    .map(
      x => {
        let score =
          titleScore(
            x.title,
            title
          );

        const itemYear =
          x.year ||
          x.releaseYear ||
          (
            x.releaseDate
              ? String(
                  x.releaseDate
                ).slice(
                  0,
                  4
                )
              : null
          );

        if (
          year &&
          itemYear &&
          String(
            year
          ).slice(0, 4) ===
            String(
              itemYear
            ).slice(0, 4)
        ) {
          score += 25;
        }

        return {
          item: x,
          score
        };
      }
    )
    .sort(
      (a, b) =>
        b.score -
        a.score
    )[0]?.item || null;
}

function chooseSeason(
  rows,
  number,
  showTitle
) {
  return rows
    .filter(
      x =>
        itemType(x) ===
          "season" &&
        getSeasonNumber(x) ===
          Number(number)
    )
    .map(
      x => ({
        item: x,
        score:
          titleScore(
            x.title,
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

/* =========================================================
   MX WEB PAGE / __mxs__
   
   THIS IS THE PRIMARY STREAM RESOLVER.

   Current MX-compatible extractors use:
   
   page
      ↓
   window.__mxs__
      ↓
   config.videoCdnBaseUrl
      ↓
   entities[videoId].stream
========================================================= */

function extractBalanced(
  text,
  start
) {
  const opening =
    text[start];

  if (
    opening !== "{" &&
    opening !== "["
  ) {
    return null;
  }

  const closing =
    opening === "{"
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
    const char =
      text[i];

    if (
      inString
    ) {
      if (
        escaped
      ) {
        escaped = false;
      } else if (
        char === "\\"
      ) {
        escaped = true;
      } else if (
        char === '"'
      ) {
        inString = false;
      }

      continue;
    }

    if (
      char === '"'
    ) {
      inString = true;
      continue;
    }

    if (
      char === opening
    ) {
      depth++;
    } else if (
      char === closing
    ) {
      depth--;

      if (
        depth === 0
      ) {
        return text.slice(
          start,
          i + 1
        );
      }
    }
  }

  return null;
}

function parseMxs(
  html
) {
  const patterns = [
    /window\.__mxs__\s*=/,
    /__mxs__\s*=/
  ];

  for (
    const pattern of patterns
  ) {
    const match =
      pattern.exec(
        html
      );

    if (!match) {
      continue;
    }

    for (
      let i =
        match.index +
        match[0].length;
      i < html.length;
      i++
    ) {
      const char =
        html[i];

      if (
        char !== "{" &&
        char !== "["
      ) {
        continue;
      }

      const raw =
        extractBalanced(
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
        /*
         Continue searching.
         There may be another
         JSON assignment later.
        */
      }
    }
  }

  return null;
}

function absoluteMxUrl(
  value
) {
  if (!value) {
    return null;
  }

  try {
    return new URL(
      String(value),
      MXWEB
    ).toString();
  } catch {
    return null;
  }
}

function resolveCdnUrl(
  value,
  cdnBase
) {
  if (!value) {
    return null;
  }

  const text =
    String(value);

  if (
    text.startsWith(
      "http://"
    ) ||
    text.startsWith(
      "https://"
    )
  ) {
    return text;
  }

  try {
    return new URL(
      text.replace(
        /^\/+/,
        ""
      ),
      cdnBase
    ).toString();
  } catch {
    return null;
  }
}

function extractStreamFromEntity(
  entity,
  cdnBase
) {
  if (
    !entity ||
    typeof entity !==
      "object"
  ) {
    return null;
  }

  const stream =
    entity.stream;

  if (
    !stream ||
    typeof stream !==
      "object"
  ) {
    return null;
  }

  const hls =
    stream.hls || {};

  const dash =
    stream.dash || {};

  const thirdParty =
    stream.thirdParty ||
    {};

  const altBalaji =
    stream.altBalaji ||
    {};

  const mxplay =
    stream.mxplay ||
    {};

  const hlsUrl =
    resolveCdnUrl(
      hls.high ||
        hls.base ||
        hls.main ||
        thirdParty.hlsUrl ||
        altBalaji.hlsUrl ||
        mxplay?.hls?.high,
      cdnBase
    );

  const dashUrl =
    resolveCdnUrl(
      dash.high ||
        dash.base ||
        dash.main ||
        thirdParty.dashUrl ||
        altBalaji.dashUrl ||
        mxplay?.dash?.high,
      cdnBase
    );

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
      "mxplay",

    raw:
      stream
  };
}

async function resolveFromMxPage(
  webUrl,
  expectedId = null
) {
  const fullUrl =
    absoluteMxUrl(
      webUrl
    );

  if (!fullUrl) {
    throw new Error(
      "Invalid MX webUrl"
    );
  }

  console.log(
    `[MX PAGE] ${fullUrl}`
  );

  const html =
    await getText(
      fullUrl,
      {
        headers: {
          "User-Agent":
            HEADERS[
              "User-Agent"
            ],

          Accept:
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

          Referer:
            `${MXWEB}/`
        }
      },
      30000
    );

  const mxs =
    parseMxs(
      html
    );

  if (!mxs) {
    throw new Error(
      "MX page contains no __mxs__ state"
    );
  }

  const config =
    mxs?.config || {};

  const cdnBase =
    (
      config.videoCdnBaseUrl ||
      DEFAULT_CDN
    )
      .toString()
      .replace(
        /\/+$/,
        ""
      ) + "/";

  const entities =
    mxs?.entities || {};

  let entity =
    expectedId
      ? entities[
          expectedId
        ]
      : null;

  /*
     Sometimes the page state
     contains a single entity
     even if the key isn't the
     exact URL ID.
  */

  if (
    !entity
  ) {
    const candidates =
      Object.entries(
        entities
      );

    entity =
      candidates
        .map(
          ([
            id,
            value
          ]) => ({
            id,
            value
          })
        )
        .find(
          x =>
            x.value &&
            x.value.stream
        )?.value ||
      null;
  }

  if (
    !entity
  ) {
    throw new Error(
      `MX page has no stream entity ` +
      `(expectedId=${expectedId || "none"})`
    );
  }

  const stream =
    extractStreamFromEntity(
      entity,
      cdnBase
    );

  if (
    !stream?.hls &&
    !stream?.dash
  ) {
    throw new Error(
      "MX page entity has no HLS/DASH stream"
    );
  }

  return {
    url:
      fullUrl,

    cdnBase,

    entity,

    stream
  };
}

/* =========================================================
   SEO FALLBACK
========================================================= */

async function seoResolve(
  webUrl
) {
  const url =
    new URL(
      `${SEO}/get-url-details`
    );

  let path;

  try {
    path =
      new URL(
        webUrl,
        MXWEB
      ).pathname;
  } catch {
    throw new Error(
      "Invalid URL for SEO"
    );
  }

  for (
    const [
      key,
      value
    ] of Object.entries(
      mxParams({
        url: path
      })
    )
  ) {
    url.searchParams.set(
      key,
      String(value)
    );
  }

  const data =
    await getJson(
      url.toString(),
      {
        headers:
          HEADERS
      }
    );

  if (
    !data?.data?.id ||
    !data?.data?.type
  ) {
    throw new Error(
      `SEO returned no canonical content for ${path}`
    );
  }

  return {
    id:
      String(
        data.data.id
      ),

    type:
      String(
        data.data.type
      ),

    title:
      data.data.title ||
      data.data.display_title ||
      null,

    raw:
      data
  };
}

/* =========================================================
   DETAIL FALLBACK
========================================================= */

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

function parseDetailStream(
  detail
) {
  if (
    !detail ||
    typeof detail !==
      "object"
  ) {
    return null;
  }

  const stream =
    detail.stream ||
    detail?.data?.stream ||
    detail?.result?.stream ||
    null;

  if (!stream) {
    return null;
  }

  return extractStreamFromEntity(
    {
      stream
    },
    DEFAULT_CDN + "/"
  );
}

/* =========================================================
   SEASON DISCOVERY
========================================================= */

async function showPageSeasons(
  webUrl
) {
  if (!webUrl) {
    return [];
  }

  const fullUrl =
    absoluteMxUrl(
      webUrl
    );

  if (!fullUrl) {
    return [];
  }

  try {
    const html =
      await getText(
        fullUrl,
        {
          headers: {
            "User-Agent":
              HEADERS[
                "User-Agent"
              ],
            Accept:
              "text/html,*/*"
          }
        }
      );

    const mxs =
      parseMxs(
        html
      );

    if (!mxs) {
      return [];
    }

    const found =
      new Map();

    for (
      const object of allObjects(
        mxs
      )
    ) {
      if (
        itemType(object) !==
        "season"
      ) {
        continue;
      }

      if (
        !object.id
      ) {
        continue;
      }

      const number =
        getSeasonNumber(
          object
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
                object.id
              ),

            title:
              object.title ||
              `Season ${number}`,

            number,

            webUrl:
              webUrlOf(
                object
              )
          }
        );
      }
    }

    return [
      ...found.values()
    ].sort(
      (a, b) =>
        a.number -
        b.number
    );
  } catch (
    error
  ) {
    console.log(
      `[SEASON PAGE] ${error.message}`
    );

    return [];
  }
}

async function findSeason(
  show,
  title,
  number,
  searchRows
) {
  let season =
    chooseSeason(
      searchRows,
      number,
      title
    );

  if (
    season
  ) {
    return {
      id:
        String(
          season.id
        ),

      title:
        season.title ||
        `Season ${number}`,

      number:
        Number(number),

      webUrl:
        webUrlOf(
          season
        )
    };
  }

  try {
    const rows =
      await mxSearch(
        `${title} season ${number}`
      );

    season =
      chooseSeason(
        rows,
        number,
        title
      );

    if (
      season
    ) {
      return {
        id:
          String(
            season.id
          ),

        title:
          season.title ||
          `Season ${number}`,

        number:
          Number(number),

        webUrl:
          webUrlOf(
            season
          )
      };
    }
  } catch (
    error
  ) {
    console.log(
      `[SEASON SEARCH] ${error.message}`
    );
  }

  const pageSeasons =
    await showPageSeasons(
      webUrlOf(
        show
      )
    );

  const found =
    pageSeasons.find(
      x =>
        x.number ===
        Number(number)
    );

  if (
    found
  ) {
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
  const result = [];

  let next = null;

  for (
    let page = 0;
    page < 30;
    page++
  ) {
    const query = {
      type:
        "season",

      id:
        seasonId,

      sortOrder:
        "0"
    };

    if (
      next
    ) {
      try {
        const parsed =
          new URLSearchParams(
            next
          );

        for (
          const [
            key,
            value
          ] of parsed.entries()
        ) {
          query[key] =
            value;
        }
      } catch {}
    }

    const response =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        query
      );

    /*
       MX response is generally:

       {
         data: {
           items: [...]
         }
       }

       but tolerate the other
       forms as well.
    */

    let payload =
      response?.data ??
      response;

    let items = [];

    if (
      Array.isArray(
        payload
      )
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
    } else if (
      Array.isArray(
        response?.items
      )
    ) {
      items =
        response.items;
    }

    if (
      !items.length
    ) {
      break;
    }

    result.push(
      ...items
    );

    const nextToken =
      payload &&
      !Array.isArray(
        payload
      )
        ? payload.next
        : response?.next;

    if (
      !nextToken
    ) {
      break;
    }

    next =
      nextToken;
  }

  return result;
}

/* =========================================================
   MOVIE RESOLUTION
========================================================= */

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

  if (
    !meta
  ) {
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
          ).slice(
            0,
            4
          )
        : null
    );

  const rows =
    await mxSearch(
      title
    );

  const movie =
    chooseMovie(
      rows,
      title,
      year
    );

  if (
    !movie
  ) {
    throw new Error(
      `MX movie not found: ${title}`
    );
  }

  /*
     PRIMARY RESOLUTION:

     Actual MX webpage
       ↓
     __mxs__
       ↓
     entities[movie.id]
       ↓
     stream
  */

  const webUrl =
    webUrlOf(
      movie
    );

  if (
    webUrl
  ) {
    try {
      const page =
        await resolveFromMxPage(
          webUrl,
          String(
            movie.id
          )
        );

      return {
        title,

        year,

        movie,

        source:
          "mx-page",

        stream:
          page.stream,

        page
      };
    } catch (
      error
    ) {
      console.log(
        `[MOVIE PAGE] ${error.message}`
      );
    }
  }

  /*
     SECONDARY:
     Search result itself
     may contain stream.
  */

  const direct =
    movie.stream
      ? extractStreamFromEntity(
          movie,
          DEFAULT_CDN + "/"
        )
      : null;

  if (
    direct?.hls ||
    direct?.dash
  ) {
    return {
      title,

      year,

      movie,

      source:
        "search-stream",

      stream:
        direct
    };
  }

  /*
     THIRD:
     SEO.
  */

  if (
    webUrl
  ) {
    try {
      const seo =
        await seoResolve(
          webUrl
        );

      const detail =
        await detailVideo(
          seo.id,
          seo.type
        );

      const stream =
        parseDetailStream(
          detail
        );

      if (
        stream?.hls ||
        stream?.dash
      ) {
        return {
          title,

          year,

          movie,

          source:
            "seo-detail",

          stream,

          seo,

          detail
        };
      }
    } catch (
      error
    ) {
      console.log(
        `[MOVIE SEO] ${error.message}`
      );
    }
  }

  /*
     LAST:
     direct ID.
  */

  try {
    const detail =
      await detailVideo(
        movie.id,
        "movie"
      );

    const stream =
      parseDetailStream(
        detail
      );

    if (
      stream?.hls ||
      stream?.dash
    ) {
      return {
        title,

        year,

        movie,

        source:
          "direct-detail",

        stream,

        detail
      };
    }
  } catch (
    error
  ) {
    console.log(
      `[MOVIE DETAIL] ${error.message}`
    );
  }

  throw new Error(
    `Unable to resolve MX movie "${title}". ` +
    `Search ID=${movie.id}, ` +
    `webUrl=${webUrl || "none"}`
  );
}

/* =========================================================
   SERIES RESOLUTION
========================================================= */

async function resolveSeries(
  imdbId,
  seasonNumber,
  episodeNumber
) {
  const cm =
    await cinemeta(
      "series",
      imdbId
    );

  const meta =
    cm?.meta;

  if (
    !meta
  ) {
    throw new Error(
      "Cinemeta returned no series metadata"
    );
  }

  const title =
    meta.name;

  const rows =
    await mxSearch(
      title
    );

  const show =
    chooseShow(
      rows,
      title
    );

  if (
    !show
  ) {
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

  /*
     IMPORTANT:
     MX uses "sequence".
  */

  const episode =
    episodes.find(
      item =>
        getEpisodeNumber(
          item
        ) ===
        Number(
          episodeNumber
        )
    );

  if (
    !episode
  ) {
    throw new Error(
      `MX Episode ${episodeNumber} not found in Season ${seasonNumber}. ` +
      `Available=${episodes
        .map(
          x =>
            getEpisodeNumber(
              x
            )
        )
        .filter(
          x =>
            x !== null
        )
        .join(",")}`
    );
  }

  const episodeUrl =
    webUrlOf(
      episode
    );

  /*
     PRIMARY:
     Actual episode page.
  */

  if (
    episodeUrl
  ) {
    try {
      const page =
        await resolveFromMxPage(
          episodeUrl,
          String(
            episode.id
          )
        );

      return {
        title,

        show,

        season,

        episode,

        source:
          "mx-page",

        stream:
          page.stream,

        page
      };
    } catch (
      error
    ) {
      console.log(
        `[EPISODE PAGE] ${error.message}`
      );
    }
  }

  /*
     SECONDARY:
     Episode object itself.
  */

  const direct =
    episode.stream
      ? extractStreamFromEntity(
          episode,
          DEFAULT_CDN + "/"
        )
      : null;

  if (
    direct?.hls ||
    direct?.dash
  ) {
    return {
      title,

      show,

      season,

      episode,

      source:
        "episode-stream",

      stream:
        direct
    };
  }

  /*
     THIRD:
     SEO.
  */

  if (
    episodeUrl
  ) {
    try {
      const seo =
        await seoResolve(
          episodeUrl
        );

      const detail =
        await detailVideo(
          seo.id,
          seo.type
        );

      const stream =
        parseDetailStream(
          detail
        );

      if (
        stream?.hls ||
        stream?.dash
      ) {
        return {
          title,

          show,

          season,

          episode,

          source:
            "seo-detail",

          stream,

          seo,

          detail
        };
      }
    } catch (
      error
    ) {
      console.log(
        `[EPISODE SEO] ${error.message}`
      );
    }
  }

  /*
     LAST:
     direct ID.
  */

  try {
    const detail =
      await detailVideo(
        episode.id,
        "episode"
      );

    const stream =
      parseDetailStream(
        detail
      );

    if (
      stream?.hls ||
      stream?.dash
    ) {
      return {
        title,

        show,

        season,

        episode,

        source:
          "direct-detail",

        stream,

        detail
      };
    }
  } catch (
    error
  ) {
    console.log(
      `[EPISODE DETAIL] ${error.message}`
    );
  }

  throw new Error(
    `Unable to resolve MX episode ` +
    `S${seasonNumber}E${episodeNumber}. ` +
    `id=${episode.id}, ` +
    `webUrl=${episodeUrl || "none"}`
  );
}

/* =========================================================
   HLS DISCOVERY
========================================================= */

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
              `${MXWEB}/`
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

async function discoverHls(
  hls
) {
  if (
    !hls
  ) {
    return [];
  }

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
              `${MXWEB}/`
          },

          signal:
            AbortSignal.timeout(
              12000
            )
        }
      );

    if (
      response.ok
    ) {
      const text =
        await response.text();

      /*
         Master playlist.
      */

      if (
        text.includes(
          "#EXT-X-STREAM-INF:"
        )
      ) {
        const lines =
          text
            .split(
              /\r?\n/
            )
            .map(
              x =>
                x.trim()
            )
            .filter(
              Boolean
            );

        const result =
          [];

        for (
          let i = 0;
          i <
            lines.length;
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
              lines[i].indexOf(
                ":"
              ) + 1
            );

          const resolution =
            attrs.match(
              /RESOLUTION=(\d+)x(\d+)/
            );

          const uri =
            lines[i + 1];

          if (
            !uri ||
            uri.startsWith(
              "#"
            )
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
          return result.sort(
            (a, b) =>
              parseInt(
                b.label
              ) -
              parseInt(
                a.label
              )
          );
        }
      }
    }
  } catch {}

  /*
     MX quality files.
  */

  const base =
    hls.substring(
      0,
      hls.lastIndexOf(
        "/"
      ) + 1
    );

  const qualityGroups =
    [
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

  const found =
    [];

  for (
    const [
      label,
      files
    ] of qualityGroups
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

async function findAudio(
  hls
) {
  if (
    !hls
  ) {
    return null;
  }

  const base =
    hls.substring(
      0,
      hls.lastIndexOf(
        "/"
      ) + 1
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

/* =========================================================
   STREMIO STREAMS
========================================================= */

function buildMasterUrl(
  video,
  audio,
  label
) {
  return (
    `${ADDON}/hls/master` +
    `?video=${encodeURIComponent(
      video
    )}` +
    `&audio=${encodeURIComponent(
      audio || ""
    )}` +
    `&label=${encodeURIComponent(
      label
    )}`
  );
}

async function makeStreams(
  stream
) {
  if (
    !stream?.hls
  ) {
    return [];
  }

  const qualities =
    await discoverHls(
      stream.hls
    );

  const audio =
    await findAudio(
      stream.hls
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
        buildMasterUrl(
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

/* =========================================================
   MANIFEST
========================================================= */

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

      types: [
        "movie"
      ],

      idPrefixes: [
        "tt"
      ]
    },

    {
      name:
        "stream",

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

/* =========================================================
   CORS
========================================================= */

app.use(
  (
    req,
    res,
    next
  ) => {
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

/* =========================================================
   BASIC
========================================================= */

app.get(
  "/",
  (
    req,
    res
  ) => {
    res.json({
      addon:
        "MX Player Free",

      version:
        VERSION,

      resolver:
        "MX page __mxs__ -> stream"
    });
  }
);

app.get(
  "/health",
  (
    req,
    res
  ) => {
    res.json({
      status:
        "ok",

      version:
        VERSION,

      resolver:
        "webUrl -> MX page -> __mxs__ -> entities[id].stream"
    });
  }
);

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

/* =========================================================
   DEBUG SEARCH
========================================================= */

app.get(
  "/debug/mx-search/:query",
  async (
    req,
    res
  ) => {
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
            .slice(
              0,
              60
            )
            .map(
              item => ({
                id:
                  item.id,

                type:
                  itemType(
                    item
                  ),

                title:
                  item.title,

                webUrl:
                  webUrlOf(
                    item
                  ),

                sequence:
                  item.sequence ??
                  null,

                episodeNo:
                  getEpisodeNumber(
                    item
                  ),

                seasonNo:
                  getSeasonNumber(
                    item
                  ),

                hasStream:
                  !!item.stream
              })
            )
      });
    } catch (
      error
    ) {
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

/* =========================================================
   DEBUG EPISODES
========================================================= */

app.get(
  "/debug/mx-episodes/:seasonId",
  async (
    req,
    res
  ) => {
    try {
      const episodes =
        await seasonEpisodes(
          req.params.seasonId
        );

      res.json({
        ok:
          true,

        seasonId:
          req.params.seasonId,

        count:
          episodes.length,

        episodes:
          episodes.map(
            item => ({
              id:
                item.id,

              type:
                itemType(
                  item
                ),

              title:
                item.title,

              sequence:
                item.sequence ??
                null,

              episodeNo:
                getEpisodeNumber(
                  item
                ),

              webUrl:
                webUrlOf(
                  item
                ),

              hasStream:
                !!item.stream,

              keys:
                Object.keys(
                  item
                )
            })
          )
      });
    } catch (
      error
    ) {
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

/* =========================================================
   DEBUG MX PAGE
========================================================= */

app.get(
  "/debug/mx-page",
  async (
    req,
    res
  ) => {
    try {
      if (
        !req.query.url
      ) {
        return res.json({
          ok:
            false,

          error:
            "Use ?url=/movie/... or ?url=https://www.mxplayer.in/..."
        });
      }

      const page =
        await resolveFromMxPage(
          req.query.url,
          req.query.id ||
            null
        );

      res.json({
        ok:
          true,

        url:
          page.url,

        cdnBase:
          page.cdnBase,

        entity: {
          id:
            req.query.id ||
            null,

          title:
            page.entity.title ||
            null,

          type:
            page.entity.type ||
            null,

          sequence:
            page.entity.sequence ??
            null,

          hasStream:
            !!page.entity.stream
        },

        stream:
          page.stream
      });
    } catch (
      error
    ) {
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

/* =========================================================
   DEBUG FULL RESOLVE
========================================================= */

app.get(
  "/debug/resolve/:type/:videoId",
  async (
    req,
    res
  ) => {
    try {
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
              result.movie.id,

            type:
              itemType(
                result.movie
              ),

            title:
              result.movie.title,

            webUrl:
              webUrlOf(
                result.movie
              )
          },

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
          parts.length !==
          3
        ) {
          throw new Error(
            "Series ID must be ttXXXX:season:episode"
          );
        }

        const result =
          await resolveSeries(
            parts[0],
            Number(
              parts[1]
            ),
            Number(
              parts[2]
            )
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
              result.season.number,

            webUrl:
              result.season.webUrl
          },

          episode: {
            id:
              result.episode.id,

            title:
              result.episode.title,

            sequence:
              result.episode.sequence ??
              null,

            episodeNo:
              getEpisodeNumber(
                result.episode
              ),

            webUrl:
              webUrlOf(
                result.episode
              )
          },

          stream:
            result.stream
        });
      }

      throw new Error(
        "Unsupported type"
      );
    } catch (
      error
    ) {
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

/* =========================================================
   STREMIO STREAM
========================================================= */

app.get(
  "/stream/:type/:videoId.json",
  async (
    req,
    res
  ) => {
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
          parts.length !==
          3
        ) {
          return res.json({
            streams: []
          });
        }

        result =
          await resolveSeries(
            parts[0],
            Number(
              parts[1]
            ),
            Number(
              parts[2]
            )
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
        `[STREAM] ${req.params.videoId} ` +
        `source=${result.source} ` +
        `streams=${streams.length}`
      );

      return res.json({
        streams
      });
    } catch (
      error
    ) {
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
   HLS MASTER WITH AUDIO
========================================================= */

app.get(
  "/hls/master",
  (
    req,
    res
  ) => {
    const video =
      req.query.video;

    const audio =
      req.query.audio;

    if (
      !video
    ) {
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

    if (
      audio
    ) {
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
      "#EXT-X-STREAM-INF:" +
      "BANDWIDTH=5000000" +
      (
        audio
          ? ',AUDIO="audio"'
          : ""
      )
    );

    lines.push(
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
      ) + "\n"
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
