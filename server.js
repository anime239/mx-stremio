const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADDON_BASE =
  "https://my-stremio-addon-q8ep.onrender.com";

const MX_API =
  "https://api.mxplayer.in/v1/web";

const MX_SEO =
  "https://seo.mxplayer.in/v1/api/seo";

const CINEMETA =
  "https://v3-cinemeta.strem.io";

const CDN =
  "https://d3sgzbosmwirao.cloudfront.net";

const VERSION = "14.0.0";


// ============================================================
// ANONYMOUS MX ID
// ============================================================

const MX_USER_ID =
  cryptoRandomUUID();

function cryptoRandomUUID() {
  const crypto =
    require("crypto");

  return crypto.randomUUID();
}


// ============================================================
// HEADERS
// ============================================================

const MX_HEADERS = {

  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10; K) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/148.0.0.0 Mobile Safari/537.36",

  "Accept":
    "application/json, text/plain, */*",

  "Referer":
    "https://www.mxplayer.in/",

  "Origin":
    "https://www.mxplayer.in"

};


// ============================================================
// HTTP
// ============================================================

async function requestJson(
  url,
  options = {},
  timeout = 15000
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
        `HTTP ${response.status}: ${text.slice(0, 300)}`
      );

    }


    try {

      return JSON.parse(text);

    } catch {

      throw new Error(
        "Invalid JSON response"
      );

    }

  } finally {

    clearTimeout(timer);

  }

}


// ============================================================
// MX GET
// ============================================================

async function mxGet(
  path,
  params = {}
) {

  const url =
    new URL(
      MX_API + path
    );


  const defaults = {

    "device-density":
      "2",

    platform:
      "com.mxplay.desktop",

    "content-languages":
      "hi,en",

    "kids-mode-enabled":
      "false",

    userid:
      MX_USER_ID

  };


  for (
    const [key, value]
    of Object.entries({
      ...defaults,
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


  return requestJson(
    url.toString(),
    {
      method:
        "GET",

      headers:
        MX_HEADERS
    }
  );

}


// ============================================================
// MX POST
// ============================================================

async function mxPost(
  path,
  params = {},
  body = {}
) {

  const url =
    new URL(
      MX_API + path
    );


  const defaults = {

    "device-density":
      "2",

    platform:
      "com.mxplay.desktop",

    "content-languages":
      "hi,en",

    "kids-mode-enabled":
      "false",

    userid:
      MX_USER_ID

  };


  for (
    const [key, value]
    of Object.entries({
      ...defaults,
      ...params
    })
  ) {

    url.searchParams.set(
      key,
      String(value)
    );

  }


  return requestJson(
    url.toString(),
    {

      method:
        "POST",

      headers: {
        ...MX_HEADERS,

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

  const url =
    new URL(
      `${MX_SEO}/get-url-details`
    );


  url.searchParams.set(
    "url",
    path
  );

  url.searchParams.set(
    "device-density",
    "2"
  );

  url.searchParams.set(
    "userid",
    MX_USER_ID
  );

  url.searchParams.set(
    "platform",
    "com.mxplay.desktop"
  );

  url.searchParams.set(
    "content-languages",
    "hi,en"
  );

  url.searchParams.set(
    "kids-mode-enabled",
    "false"
  );


  return requestJson(
    url.toString(),
    {
      method:
        "GET",

      headers:
        MX_HEADERS
    }
  );

}


// ============================================================
// CINEMETA
// ============================================================

async function cinemeta(
  type,
  id
) {

  const url =
    `${CINEMETA}/meta/` +
    `${type}/` +
    `${encodeURIComponent(id)}.json`;


  return requestJson(
    url,
    {
      headers: {
        "User-Agent":
          "Mozilla/5.0"
      }
    }
  );

}


// ============================================================
// NORMALIZE TITLE
// ============================================================

function normalizeTitle(
  value
) {

  return String(
    value || ""
  )

    .toLowerCase()

    .normalize(
      "NFKD"
    )

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


// ============================================================
// TITLE SCORE
// ============================================================

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


  const ax =
    new Set(
      x.split(" ")
    );

  const ay =
    new Set(
      y.split(" ")
    );


  let common = 0;


  for (
    const word
    of ax
  ) {

    if (
      ay.has(word)
    ) {

      common++;

    }

  }


  return Math.round(
    common /
    Math.max(
      ax.size,
      ay.size
    ) *
    70
  );

}


// ============================================================
// RECURSIVE OBJECT SEARCH
// ============================================================

function collectObjects(
  value,
  output = []
) {

  if (!value) {
    return output;
  }


  if (
    Array.isArray(value)
  ) {

    for (
      const item
      of value
    ) {

      collectObjects(
        item,
        output
      );

    }

    return output;

  }


  if (
    typeof value !==
    "object"
  ) {

    return output;

  }


  output.push(
    value
  );


  for (
    const child
    of Object.values(
      value
    )
  ) {

    if (
      child &&
      typeof child ===
        "object"
    ) {

      collectObjects(
        child,
        output
      );

    }

  }


  return output;

}


// ============================================================
// MX SEARCH
// ============================================================

async function mxSearch(
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


  const objects =
    collectObjects(
      data
    );


  const results =
    objects.filter(
      item => {

        if (
          !item ||
          !item.id ||
          !item.title
        ) {

          return false;

        }


        return (
          item.type ===
            "movie" ||

          item.type ===
            "tvshow"
        );

      }
    );


  const map =
    new Map();


  for (
    const item
    of results
  ) {

    if (
      !map.has(
        item.id
      )
    ) {

      map.set(
        item.id,
        item
      );

    }

  }


  return [
    ...map.values()
  ];

}


// ============================================================
// SEARCH HOME FALLBACK
// ============================================================

async function mxHomeSearch(
  query
) {

  const data =
    await mxGet(
      "/home/tab/87c3ddc974dcf12294e9412bec44b097",
      {
        pageSize:
          "50"
      }
    );


  const objects =
    collectObjects(
      data
    );


  return objects.filter(
    item => {

      if (
        !item ||
        !item.id ||
        !item.title
      ) {

        return false;

      }


      if (
        item.type !==
          "movie" &&
        item.type !==
          "tvshow"
      ) {

        return false;

      }


      return (
        titleScore(
          item.title,
          query
        ) >= 50
      );

    }
  );

}


// ============================================================
// PICK MOVIE
// ============================================================

function pickMovie(
  results,
  title,
  year
) {

  const movies =
    results.filter(
      item =>
        item.type ===
        "movie"
    );


  const scored =
    movies.map(
      item => {

        let score =
          titleScore(
            item.title,
            title
          );


        const itemYear =
          item.releaseDate
            ? String(
                item.releaseDate
              ).slice(
                0,
                4
              )
            : null;


        if (
          year &&
          itemYear &&
          String(year) ===
            itemYear
        ) {

          score += 25;

        }


        return {
          item,
          score
        };

      }
    );


  scored.sort(
    (a, b) =>
      b.score -
      a.score
  );


  return scored.length &&
    scored[0].score >= 50

    ? scored[0].item

    : null;

}


// ============================================================
// PICK SHOW
// ============================================================

function pickShow(
  results,
  title
) {

  const shows =
    results.filter(
      item =>
        item.type ===
        "tvshow"
    );


  const scored =
    shows.map(
      item => ({

        item,

        score:
          titleScore(
            item.title,
            title
          )

      })
    );


  scored.sort(
    (a, b) =>
      b.score -
      a.score
  );


  return scored.length &&
    scored[0].score >= 50

    ? scored[0].item

    : null;

}


// ============================================================
// GET SHOW SEASONS
// ============================================================

async function getShowSeasons(
  webUrl
) {

  if (!webUrl) {
    return {};
  }


  const fullUrl =
    webUrl.startsWith(
      "http"
    )

      ? webUrl

      : `https://www.mxplayer.in${webUrl}`;


  const response =
    await fetch(
      fullUrl,
      {
        headers: {
          "User-Agent":
            MX_HEADERS[
              "User-Agent"
            ],

          "Referer":
            "https://www.mxplayer.in/"
        }
      }
    );


  if (!response.ok) {
    return {};
  }


  const html =
    await response.text();


  const match =
    html.match(
      /__mxs__\s*=\s*(\{.*)/s
    );


  if (!match) {
    return {};
  }


  try {

    const decoder =
      JSON.JSONDecoder;

    void decoder;

  } catch {}


  let state;


  try {

    const decoder =
      JSON.parse;

    state =
      decoder(
        match[1]
          .replace(
            /;\s*<\/script>[\s\S]*$/,
            ""
          )
          .replace(
            /;\s*$/,
            ""
          )
      );

  } catch {

    try {

      const decoder =
        new (
          require(
            "jsonparse"
          )
        );

      void decoder;

    } catch {}


    // Manual balanced JSON extraction.
    let depth = 0;
    let end = -1;


    for (
      let i = 0;
      i < match[1].length;
      i++
    ) {

      const ch =
        match[1][i];


      if (
        ch === "{"
      ) {

        depth++;

      }


      if (
        ch === "}"
      ) {

        depth--;

        if (
          depth === 0
        ) {

          end =
            i + 1;

          break;

        }

      }

    }


    if (
      end === -1
    ) {

      return {};

    }


    try {

      state =
        JSON.parse(
          match[1].slice(
            0,
            end
          )
        );

    } catch {

      return {};

    }

  }


  const seasons = {};


  const entities =
    state &&
    state.entities;


  if (!entities) {
    return {};
  }


  for (
    const entity
    of Object.values(
      entities
    )
  ) {

    if (
      !entity ||
      entity.type !==
        "tvshow"
    ) {

      continue;

    }


    const tabs =
      entity.tabs ||
      [];


    for (
      const tab
      of tabs
    ) {

      if (
        tab.type !==
          "tvshowepisodes"
      ) {

        continue;

      }


      const containers =
        tab.containers ||
        [];


      for (
        const container
        of containers
      ) {

        if (
          container.type !==
            "season"
        ) {

          continue;

        }


        const number =
          Number(
            container.sequence ??
            container.season_number ??
            container.seasonNo
          );


        if (
          !Number.isFinite(
            number
          )
        ) {

          continue;

        }


        if (
          !container.id
        ) {

          continue;

        }


        seasons[
          number
        ] = {

          id:
            container.id,

          title:
            container.title ||
            `Season ${number}`

        };

      }

    }

  }


  return seasons;

}


// ============================================================
// SEASON EPISODES
// ============================================================

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

      type:
        "season",

      id:
        seasonId,

      sortOrder:
        "0"

    };


    if (next) {

      const nextParams =
        new URLSearchParams(
          next
        );


      for (
        const [
          key,
          value
        ]
        of nextParams.entries()
      ) {

        params[key] =
          value;

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
      Array.isArray(
        payload
      )

        ? payload

        : (
            payload &&
            Array.isArray(
              payload.items
            )
          )

            ? payload.items

            : [];


    if (
      !items.length
    ) {

      break;

    }


    episodes.push(
      ...items
    );


    const token =
      payload &&
      !Array.isArray(
        payload
      )

        ? payload.next

        : null;


    if (!token) {
      break;
    }


    next =
      token;

  }


  return episodes;

}


// ============================================================
// SERIES RESOLUTION
// ============================================================

async function resolveSeries(
  imdbId,
  seasonNumber,
  episodeNumber
) {

  const result = {

    stage:
      "cinemeta"

  };


  // ----------------------------------------------------------
  // CINEMETA
  // ----------------------------------------------------------

  const cm =
    await cinemeta(
      "series",
      imdbId
    );


  const meta =
    cm &&
    cm.meta;


  if (!meta) {

    throw new Error(
      "Cinemeta returned no series metadata"
    );

  }


  result.title =
    meta.name;


  result.stage =
    "mx-search";


  // ----------------------------------------------------------
  // MX SEARCH
  // ----------------------------------------------------------

  let searchResults =
    await mxSearch(
      meta.name
    );


  let show =
    pickShow(
      searchResults,
      meta.name
    );


  // Fallback to homepage.
  if (!show) {

    searchResults =
      await mxHomeSearch(
        meta.name
      );


    show =
      pickShow(
        searchResults,
        meta.name
      );

  }


  if (!show) {

    throw new Error(
      `MX show not found: ${meta.name}`
    );

  }


  result.mxShow = {

    id:
      show.id,

    title:
      show.title,

    webUrl:
      show.webUrl

  };


  result.stage =
    "mx-seasons";


  // ----------------------------------------------------------
  // ALL SEASONS
  // ----------------------------------------------------------

  const seasons =
    await getShowSeasons(
      show.webUrl
    );


  const season =
    seasons[
      seasonNumber
    ];


  if (!season) {

    throw new Error(
      `MX Season ${seasonNumber} not found`
    );

  }


  result.season =
    season;


  result.stage =
    "mx-episodes";


  // ----------------------------------------------------------
  // ALL EPISODES IN REQUESTED SEASON
  // ----------------------------------------------------------

  const episodes =
    await getSeasonEpisodes(
      season.id
    );


  const episode =
    episodes.find(
      item =>
        Number(
          item.episodeNo ??
          item.episode_number
        ) ===
        episodeNumber
    );


  if (!episode) {

    throw new Error(
      `MX Episode ${episodeNumber} not found in Season ${seasonNumber}`
    );

  }


  result.episode = {

    id:
      episode.id,

    title:
      episode.title,

    episodeNo:
      episode.episodeNo ??
      episode.episode_number,

    webUrl:
      episode.webUrl

  };


  result.stage =
    "mx-detail";


  // ----------------------------------------------------------
  // EPISODE DETAIL
  // ----------------------------------------------------------

  const detail =
    await mxGet(
      "/detail/video",
      {

        type:
          "episode",

        id:
          episode.id

      }
    );


  if (
    !detail ||
    !detail.stream
  ) {

    throw new Error(
      "MX episode has no stream object"
    );

  }


  result.stage =
    "hls";


  result.detail =
    detail;


  return result;

}


// ============================================================
// MOVIE RESOLUTION
// ============================================================

async function resolveMovie(
  imdbId
) {

  const result = {

    stage:
      "cinemeta"

  };


  const cm =
    await cinemeta(
      "movie",
      imdbId
    );


  const meta =
    cm &&
    cm.meta;


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
          ).slice(
            0,
            4
          )
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

  }


  if (!movie) {

    throw new Error(
      `MX movie not found: ${title}`
    );

  }


  result.mxMovie = {

    id:
      movie.id,

    title:
      movie.title,

    webUrl:
      movie.webUrl

  };


  result.stage =
    "mx-detail";


  const detail =
    await mxGet(
      "/detail/video",
      {

        type:
          "movie",

        id:
          movie.id

      }
    );


  if (
    !detail ||
    !detail.stream
  ) {

    throw new Error(
      "MX movie has no stream object"
    );

  }


  result.stage =
    "hls";


  result.detail =
    detail;


  return result;

}


// ============================================================
// STREAM URL FROM MX DETAIL
// ============================================================

function extractHls(
  stream
) {

  if (!stream) {
    return null;
  }


  const hls =
    stream.hls ||
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
    !url.startsWith(
      "http"
    )
  ) {

    url =
      `${CDN}/${url}`;

  }


  return url ||
    null;

}


// ============================================================
// FETCH TEXT
// ============================================================

async function fetchText(
  url
) {

  const response =
    await fetch(
      url,
      {
        headers: {

          "User-Agent":
            MX_HEADERS[
              "User-Agent"
            ],

          "Referer":
            "https://www.mxplayer.in/"

        }
      }
    );


  if (!response.ok) {

    throw new Error(
      `HLS HTTP ${response.status}`
    );

  }


  return response.text();

}


// ============================================================
// URL RESOLVE
// ============================================================

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


// ============================================================
// HLS ATTRIBUTES
// ============================================================

function parseAttributes(
  line
) {

  const result = {};


  const index =
    line.indexOf(":");


  if (
    index === -1
  ) {

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
      regex.exec(
        content
      ))
  ) {

    let value =
      match[2];


    if (
      value.startsWith(
        '"'
      )
    ) {

      value =
        value.substring(
          1,
          value.length - 1
        );

    }


    result[
      match[1]
    ] =
      value;

  }


  return result;

}


// ============================================================
// HLS MASTER PARSER
// ============================================================

function parseMaster(
  text,
  masterUrl
) {

  const lines =
    text
      .split(
        /\r?\n/
      )
      .map(
        x => x.trim()
      )
      .filter(
        Boolean
      );


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
        attrs.TYPE ===
          "AUDIO" &&
        attrs.URI
      ) {

        audios.push({

          group:
            attrs[
              "GROUP-ID"
            ],

          url:
            absoluteUrl(
              attrs.URI,
              masterUrl
            ),

          default:
            attrs.DEFAULT ===
            "YES"

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


      let width =
        null;

      let height =
        null;


      if (
        attrs.RESOLUTION
      ) {

        const match =
          attrs.RESOLUTION.match(
            /(\d+)x(\d+)/
          );


        if (match) {

          width =
            Number(
              match[1]
            );

          height =
            Number(
              match[2]
            );

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


// ============================================================
// QUALITY LABEL
// ============================================================

function qualityLabel(
  item
) {

  const height =
    Number(
      item.height ||
      0
    );


  if (
    height >= 2160
  ) {

    return "2160p";

  }

  if (
    height >= 1440
  ) {

    return "1440p";

  }

  if (
    height >= 1080
  ) {

    return "1080p";

  }

  if (
    height >= 720
  ) {

    return "720p";

  }

  if (
    height >= 480
  ) {

    return "480p";

  }

  if (
    height >= 360
  ) {

    return "360p";

  }

  if (
    height >= 180
  ) {

    return "180p";

  }


  return "High";

}


// ============================================================
// PROBE URL
// ============================================================

async function urlWorks(
  url
) {

  try {

    const response =
      await fetch(
        url,
        {
          method:
            "GET",

          headers: {

            "User-Agent":
              MX_HEADERS[
                "User-Agent"
              ]

          }
        }
      );


    return response.ok;

  } catch {

    return false;

  }

}


// ============================================================
// DIRECT MX HLS QUALITY DISCOVERY
// ============================================================

async function discoverDirectHls(
  hlsUrl
) {

  const base =
    hlsUrl.substring(
      0,
      hlsUrl.lastIndexOf("/") + 1
    );


  const candidates = [

    {
      label:
        "2160p",

      files: [

        "h264_2160_high_12000k.m3u8",

        "h264_2160_high_10000k.m3u8",

        "h264_2160_high_8000k.m3u8"

      ]

    },

    {
      label:
        "1440p",

      files: [

        "h264_1440_high_8000k.m3u8",

        "h264_1440_high_6000k.m3u8"

      ]

    },

    {
      label:
        "1080p",

      files: [

        "h264_1080_high_5800k.m3u8",

        "h264_1080_high_5000k.m3u8",

        "h264_1080_high_4500k.m3u8"

      ]

    },

    {
      label:
        "720p",

      files: [

        "h264_720_high_3000k.m3u8",

        "h264_720_high_2500k.m3u8"

      ]

    },

    {
      label:
        "480p",

      files: [

        "h264_480_high_1750k.m3u8",

        "h264_480_high_1500k.m3u8"

      ]

    },

    {
      label:
        "360p",

      files: [

        "h264_360_high_750k.m3u8",

        "h264_360_high_600k.m3u8"

      ]

    },

    {
      label:
        "180p",

      files: [

        "h264_180_high_235k.m3u8",

        "h264_180_high_200k.m3u8"

      ]

    },

    {
      label:
        "High",

      files: [
        "h264_high.m3u8"
      ]

    }

  ];


  const found = [];


  for (
    const quality
    of candidates
  ) {

    for (
      const file
      of quality.files
    ) {

      const url =
        base +
        file;


      if (
        await urlWorks(
          url
        )
      ) {

        found.push({

          label:
            quality.label,

          url

        });


        break;

      }

    }

  }


  return found;

}


// ============================================================
// AUDIO DISCOVERY
// ============================================================

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
    const file
    of candidates
  ) {

    const url =
      base +
      file;


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


// ============================================================
// STREAMS FROM HLS
// ============================================================

async function streamsFromHls(
  hlsUrl
) {

  if (!hlsUrl) {
    return [];
  }


  let text;


  try {

    text =
      await fetchText(
        hlsUrl
      );

  } catch {

    return [];

  }


  // ----------------------------------------------------------
  // REAL MASTER PLAYLIST
  // ----------------------------------------------------------

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
      const variant
      of parsed.variants
    ) {

      const label =
        qualityLabel(
          variant
        );


      let audio =
        null;


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


  // ----------------------------------------------------------
  // DIRECT MEDIA PLAYLIST
  // ----------------------------------------------------------

  const direct =
    await discoverDirectHls(
      hlsUrl
    );


  let qualities =
    direct;


  // If the current hls URL itself wasn't detected because
  // its filename is unusual, keep it as High.
  if (
    qualities.length === 0
  ) {

    qualities = [

      {
        label:
          "High",

        url:
          hlsUrl

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


// ============================================================
// CREATE STREMIO STREAM
// ============================================================

function createStream(
  video,
  audio,
  label,
  bandwidth = 3000000,
  codecs = "avc1.640028"
) {

  const masterUrl =
    `${ADDON_BASE}/hls/master` +

    `?video=${encodeURIComponent(
      video
    )}` +

    `&audio=${encodeURIComponent(
      audio || ""
    )}` +

    `&label=${encodeURIComponent(
      label
    )}` +

    `&bandwidth=${encodeURIComponent(
      bandwidth
    )}` +

    `&codecs=${encodeURIComponent(
      codecs
    )}`;


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

      notWebReady:
        true,

      bingeGroup:
        `mxplayer-${label}`

    }

  };

}


// ============================================================
// REMOVE DUPLICATES
// ============================================================

function uniqueStreams(
  streams
) {

  const map =
    new Map();


  for (
    const stream
    of streams
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


// ============================================================
// MANIFEST
// ============================================================

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


// ============================================================
// CORS
// ============================================================

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


// ============================================================
// ROOT
// ============================================================

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


// ============================================================
// HEALTH
// ============================================================

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


// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (req, res) => {

    res.json(
      manifest
    );

  }
);


// ============================================================
// STREAM
// ============================================================

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

      // ======================================================
      // SERIES
      // ======================================================

      if (
        type ===
        "series"
      ) {

        const parts =
          videoId.split(
            ":"
          );


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
          Number(
            parts[1]
          );

        const episode =
          Number(
            parts[2]
          );


        if (
          !imdbId.startsWith(
            "tt"
          ) ||
          !Number.isInteger(
            season
          ) ||
          !Number.isInteger(
            episode
          )
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


        const hls =
          extractHls(
            resolved.detail.stream
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


      // ======================================================
      // MOVIE
      // ======================================================

      if (
        type ===
        "movie" &&
        videoId.startsWith(
          "tt"
        )
      ) {

        const resolved =
          await resolveMovie(
            videoId
          );


        const hls =
          extractHls(
            resolved.detail.stream
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


// ============================================================
// DEBUG RESOLVER
// ============================================================

app.get(
  "/debug/resolve/:type/:videoId",
  async (req, res) => {

    try {

      const type =
        req.params.type;

      const videoId =
        req.params.videoId;


      if (
        type ===
        "movie"
      ) {

        const resolved =
          await resolveMovie(
            videoId
          );


        return res.json({

          ok:
            true,

          type,

          id:
            videoId,

          title:
            resolved.title,

          year:
            resolved.year,

          mx:
            resolved.mxMovie,

          hls:
            extractHls(
              resolved.detail.stream
            )

        });

      }


      if (
        type ===
        "series"
      ) {

        const parts =
          videoId.split(
            ":"
          );


        const resolved =
          await resolveSeries(
            parts[0],
            Number(parts[1]),
            Number(parts[2])
          );


        return res.json({

          ok:
            true,

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
              resolved.detail.stream
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


// ============================================================
// GENERATED HLS MASTER
// ============================================================

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
      lines.join(
        "\n"
      ) +
      "\n"
    );

  }
);


// ============================================================
// START
// ============================================================

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
