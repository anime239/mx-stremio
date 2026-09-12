const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADDON_BASE =
  "https://my-stremio-addon-q8ep.onrender.com";

const MX_API =
  "https://api.mxplayer.in/v1/web";

const MX_WEB =
  "https://www.mxplayer.in";

const CINEMETA =
  "https://v3-cinemeta.strem.io";

const VERSION = "13.0.0";


// ============================================================
// ANONYMOUS MX USER ID
// ============================================================

const MX_USER_ID =
  crypto.randomUUID();


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
// GENERIC JSON FETCH
// ============================================================

async function fetchJson(
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

    if (!response.ok) {

      throw new Error(
        `HTTP ${response.status}`
      );

    }

    return await response.json();

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

    "device-density": "2",

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


  return fetchJson(
    url.toString(),
    {
      method: "GET",
      headers: MX_HEADERS
    }
  );

}


// ============================================================
// MX POST
// ============================================================

async function mxPost(
  path,
  body = {},
  params = {}
) {

  const url =
    new URL(
      MX_API + path
    );


  const defaults = {

    "device-density": "2",

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


  return fetchJson(
    url.toString(),
    {

      method: "POST",

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
// CINEMETA
// ============================================================

async function cinemeta(
  type,
  imdbId
) {

  const url =
    `${CINEMETA}/meta/` +
    `${type}/` +
    `${encodeURIComponent(imdbId)}.json`;

  return fetchJson(
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
// STRING NORMALIZATION
// ============================================================

function normalizeTitle(value) {

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


// ============================================================
// TITLE SIMILARITY
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

    return 80;
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
    const word of ax
  ) {

    if (ay.has(word)) {
      common++;
    }

  }


  const total =
    Math.max(
      ax.size,
      ay.size
    );


  return total
    ? Math.round(
        common /
        total *
        70
      )
    : 0;

}


// ============================================================
// RECURSIVE ITEM EXTRACTION
// ============================================================

function collectObjects(
  value,
  output = []
) {

  if (!value) {
    return output;
  }


  if (Array.isArray(value)) {

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


  output.push(value);


  for (
    const child
    of Object.values(value)
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
      {},
      {
        query
      }
    );


  const objects =
    collectObjects(data);


  const results =
    objects.filter(
      item =>

        item &&
        item.id &&
        item.title &&
        (
          item.type ===
            "movie" ||

          item.type ===
            "tvshow" ||

          item.type ===
            "season" ||

          item.type ===
            "episode"
        )
    );


  const unique =
    new Map();


  for (
    const item
    of results
  ) {

    if (
      !unique.has(item.id)
    ) {

      unique.set(
        item.id,
        item
      );

    }

  }


  return [
    ...unique.values()
  ];

}


// ============================================================
// PICK BEST MX MOVIE
// ============================================================

function pickMovie(
  results,
  title,
  year
) {

  const movies =
    results.filter(
      item =>
        item.type === "movie"
    );


  if (!movies.length) {
    return null;
  }


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
              ).slice(0, 4)
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


  return scored[0].score >= 50
    ? scored[0].item
    : null;

}


// ============================================================
// PICK BEST MX SHOW
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


  if (!shows.length) {
    return null;
  }


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


  return scored[0].score >= 50
    ? scored[0].item
    : null;

}


// ============================================================
// SEO RESOLVER
// ============================================================

async function mxSeo(
  path
) {

  if (!path) {
    return null;
  }


  const url =
    new URL(
      `${MX_API}/seo/get-url-details`
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


  try {

    const data =
      await fetchJson(
        url.toString(),
        {
          headers:
            MX_HEADERS
        }
      );

    return data;

  } catch {

    return null;

  }

}


// ============================================================
// GET SHOW SEASONS FROM MX HTML
// ============================================================

async function getShowSeasons(
  webUrl
) {

  if (!webUrl) {
    return {};
  }


  const fullUrl =
    webUrl.startsWith("http")
      ? webUrl
      : `${MX_WEB}${webUrl}`;


  try {

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
              MX_WEB + "/"
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
        /__mxs__\s*=\s*(\{[\s\S]*)/
      );


    if (!match) {
      return {};
    }


    const decoder =
      JSON.JSONDecoder;


    // The MX page contains a JS object.
    // Try to find the JSON portion safely.
    let state;


    try {

      state =
        JSON.parse(
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

      // Find the first balanced JSON object.
      let depth = 0;
      let end = -1;

      for (
        let i = 0;
        i < match[1].length;
        i++
      ) {

        const char =
          match[1][i];


        if (char === "{") {
          depth++;
        }

        if (char === "}") {

          depth--;

          if (depth === 0) {

            end = i + 1;

            break;

          }

        }

      }


      if (end === -1) {
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
        entity.tabs || [];


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


          seasons[number] = {

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

  } catch {

    return {};

  }

}


// ============================================================
// GET SEASON EPISODES
// ============================================================

async function getSeasonEpisodes(
  seasonId
) {

  const episodes = [];

  let next = null;


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


    if (next) {

      const parsed =
        new URLSearchParams(
          next
        );


      for (
        const [
          key,
          value
        ]
        of parsed.entries()
      ) {

        params[key] =
          value;

      }

    }


    let data;


    try {

      data =
        await mxGet(
          "/detail/tab/tvshowepisodes",
          params
        );

    } catch {

      break;

    }


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


    if (!items.length) {
      break;
    }


    for (
      const item
      of items
    ) {

      if (
        item &&
        item.id
      ) {

        episodes.push(
          item
        );

      }

    }


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


    next = token;

  }


  return episodes;

}


// ============================================================
// FIND EPISODE FOR REQUESTED SEASON/EPISODE
// ============================================================

async function resolveSeriesEpisode(
  imdbId,
  seasonNumber,
  episodeNumber
) {

  // ----------------------------------------------------------
  // 1. Get real series name from Cinemeta
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
    return null;
  }


  const showTitle =
    meta.name;


  if (!showTitle) {
    return null;
  }


  // ----------------------------------------------------------
  // 2. Search MX
  // ----------------------------------------------------------

  const searchResults =
    await mxSearch(
      showTitle
    );


  const show =
    pickShow(
      searchResults,
      showTitle
    );


  if (!show) {
    return null;
  }


  // ----------------------------------------------------------
  // 3. Discover ALL MX seasons
  // ----------------------------------------------------------

  let seasons =
    await getShowSeasons(
      show.webUrl
    );


  // ----------------------------------------------------------
  // 4. SEO fallback
  // ----------------------------------------------------------

  if (
    !seasons[seasonNumber] &&
    show.webUrl
  ) {

    const seo =
      await mxSeo(
        show.webUrl
      );


    const deps =
      seo &&
      seo.data &&
      seo.data.dependencies;


    if (
      deps &&
      deps.season &&
      deps.season.id
    ) {

      const detected =
        Number(
          deps.season.season_no
        );


      if (
        Number.isFinite(
          detected
        )
      ) {

        seasons[
          detected
        ] = {

          id:
            deps.season.id,

          title:
            deps.season.name ||
            `Season ${detected}`

        };

      }

    }

  }


  const season =
    seasons[
      seasonNumber
    ];


  if (!season) {
    return null;
  }


  // ----------------------------------------------------------
  // 5. Get every episode in requested season
  // ----------------------------------------------------------

  const episodes =
    await getSeasonEpisodes(
      season.id
    );


  // ----------------------------------------------------------
  // 6. Select exact episode number
  // ----------------------------------------------------------

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
    return null;
  }


  return {

    show,

    season,

    episode,

    title:
      episode.title,

    webUrl:
      episode.webUrl

  };

}


// ============================================================
// MOVIE RESOLUTION
// ============================================================

async function resolveMovie(
  imdbId
) {

  // ----------------------------------------------------------
  // 1. Cinemeta
  // ----------------------------------------------------------

  const cm =
    await cinemeta(
      "movie",
      imdbId
    );


  const meta =
    cm &&
    cm.meta;


  if (!meta) {
    return null;
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


  // ----------------------------------------------------------
  // 2. Search MX
  // ----------------------------------------------------------

  const results =
    await mxSearch(
      title
    );


  const movie =
    pickMovie(
      results,
      title,
      year
    );


  if (!movie) {
    return null;
  }


  // ----------------------------------------------------------
  // 3. Get actual movie detail
  // ----------------------------------------------------------

  let detail;


  try {

    detail =
      await mxGet(
        "/detail/video",
        {
          type:
            "movie",

          id:
            movie.id
        }
      );

  } catch {

    return null;

  }


  if (
    !detail ||
    !detail.stream
  ) {

    return null;
  }


  return {

    imdbId,

    title,

    year,

    mx:
      movie,

    detail

  };

}


// ============================================================
// EXTRACT HLS FROM MX STREAM
// ============================================================

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


  return (

    hls.high ||

    hls.base ||

    hls.main ||

    thirdParty.hlsUrl ||

    altBalaji.hlsUrl ||

    (
      mxplay.hls &&
      mxplay.hls.high
    ) ||

    null

  );

}


// ============================================================
// URL RESOLUTION
// ============================================================

function absoluteUrl(
  value,
  base
) {

  if (!value) {
    return null;
  }


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
// PARSE HLS ATTRIBUTES
// ============================================================

function parseAttributes(
  line
) {

  const attrs = {};


  const content =
    line.substring(
      line.indexOf(":") + 1
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
      value.startsWith("\"") &&
      value.endsWith("\"")
    ) {

      value =
        value.slice(
          1,
          -1
        );

    }


    attrs[
      match[1]
    ] = value;

  }


  return attrs;

}


// ============================================================
// FETCH HLS TEXT
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
// PARSE MASTER PLAYLIST
// ============================================================

function parseMaster(
  text,
  masterUrl
) {

  const lines =
    text
      .split(/\r?\n/)
      .map(
        line => line.trim()
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


    // --------------------------------------------------------
    // Audio
    // --------------------------------------------------------

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

          name:
            attrs.NAME ||
            "Audio",

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


    // --------------------------------------------------------
    // Video
    // --------------------------------------------------------

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

        resolution:
          attrs.RESOLUTION ||
          null,

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
  variant
) {

  const height =
    Number(
      variant.height || 0
    );


  if (height >= 2160) {
    return "2160p";
  }

  if (height >= 1440) {
    return "1440p";
  }

  if (height >= 1080) {
    return "1080p";
  }

  if (height >= 720) {
    return "720p";
  }

  if (height >= 480) {
    return "480p";
  }

  if (height >= 360) {
    return "360p";
  }

  if (height >= 180) {
    return "180p";
  }


  return "High";

}


// ============================================================
// BUILD STREAMS FROM MASTER HLS
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
  // Master playlist
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


    const streams = [];


    for (
      const variant
      of parsed.variants
    ) {

      const label =
        qualityLabel(
          variant
        );


      let audioUrl =
        null;


      if (
        variant.audioGroup
      ) {

        const audio =
          parsed.audios.find(
            item =>
              item.group ===
              variant.audioGroup
          );


        if (audio) {

          audioUrl =
            audio.url;

        }

      }


      if (!audioUrl) {

        const audio =
          parsed.audios.find(
            item =>
              item.default
          ) ||
          parsed.audios[0];


        if (audio) {

          audioUrl =
            audio.url;

        }

      }


      const masterUrl =
        `${ADDON_BASE}/hls/master` +

        `?video=${encodeURIComponent(
          variant.url
        )}` +

        `&audio=${encodeURIComponent(
          audioUrl || ""
        )}` +

        `&label=${encodeURIComponent(
          label
        )}` +

        `&bandwidth=${encodeURIComponent(
          variant.bandwidth || ""
        )}` +

        `&codecs=${encodeURIComponent(
          variant.codecs || ""
        )}`;


      streams.push({

        name:
          `MX Player ${label}`,

        title:
          `MX Player • ${label}` +
          (
            audioUrl
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

      });

    }


    // Remove duplicate quality labels.
    const unique =
      new Map();


    for (
      const stream
      of streams
    ) {

      const key =
        stream.name;


      if (
        !unique.has(key)
      ) {

        unique.set(
          key,
          stream
        );

      }

    }


    return [
      ...unique.values()
    ];

  }


  // ----------------------------------------------------------
  // Direct media playlist fallback
  //
  // Some MX content exposes one media playlist rather than
  // a master playlist. Preserve it as a playable stream.
  // ----------------------------------------------------------

  const base =
    hlsUrl.substring(
      0,
      hlsUrl.lastIndexOf("/") + 1
    );


  const filename =
    hlsUrl.substring(
      hlsUrl.lastIndexOf("/") + 1
    );


  let label =
    "High";


  const match =
    filename.match(
      /h264_(\d+)_high/i
    );


  if (match) {

    label =
      `${match[1]}p`;

  }


  let audioUrl =
    null;


  const audioCandidates = [

    "audio_128000_0_96.m3u8",

    "audio_96000_0_96.m3u8",

    "audio_64000_0_96.m3u8"

  ];


  for (
    const candidate
    of audioCandidates
  ) {

    const candidateUrl =
      base +
      candidate;


    try {

      const response =
        await fetch(
          candidateUrl,
          {
            method: "GET",
            headers: {
              "User-Agent":
                MX_HEADERS[
                  "User-Agent"
                ]
            }
          }
        );


      if (
        response.ok
      ) {

        audioUrl =
          candidateUrl;

        break;

      }

    } catch {}

  }


  const masterUrl =
    `${ADDON_BASE}/hls/master` +

    `?video=${encodeURIComponent(
      hlsUrl
    )}` +

    `&audio=${encodeURIComponent(
      audioUrl || ""
    )}` +

    `&label=${encodeURIComponent(
      label
    )}`;


  return [

    {

      name:
        `MX Player ${label}`,

      title:
        `MX Player • ${label}` +
        (
          audioUrl
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

    }

  ];

}


// ============================================================
// HLS MASTER GENERATED FOR STREMIO
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


    const audioAttr =
      audio
        ? ',AUDIO="audio"'
        : "";


    lines.push(

      `#EXT-X-STREAM-INF:` +
      `BANDWIDTH=${bandwidth}` +
      `,CODECS="${codecs}"` +
      `${audioAttr}`,

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
    "MX Player India free streams with automatic movie and series resolution.",

  resources: [

    {
      name:
        "catalog",

      types:
        ["movie"]

    },

    {
      name:
        "meta",

      types:
        ["movie"],

      idPrefixes:
        ["mx:"]
    },

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
    },

    {
      name:
        "stream",

      types:
        ["movie"],

      idPrefixes:
        ["mx:"]
    }

  ],

  types: [
    "movie",
    "series"
  ],

  catalogs: [

    {
      type:
        "movie",

      id:
        "mxmovies",

      name:
        "MX Player Free Movies",

      extra: [

        {
          name:
            "search",

          isRequired:
            false

        },

        {
          name:
            "skip",

          isRequired:
            false

        }

      ]

    }

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

        "Cinemeta IMDb resolution",

        "MX Player search",

        "automatic season resolution",

        "automatic episode resolution",

        "automatic movie resolution",

        "HLS master parsing",

        "quality selection",

        "audio"

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
        type === "series"
      ) {

        const parts =
          videoId.split(":");


        if (
          parts.length !== 3 ||
          !parts[0].startsWith("tt")
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


        console.log(
          `[SERIES] Resolving ${imdbId} S${season}E${episode}`
        );


        const resolved =
          await resolveSeriesEpisode(
            imdbId,
            season,
            episode
          );


        if (!resolved) {

          console.log(
            "[SERIES] Not found"
          );


          return res.json({
            streams: []
          });

        }


        console.log(
          `[SERIES] MX episode: ${resolved.episode.id}`
        );


        const detail =
          await mxGet(
            "/detail/video",
            {

              type:
                "episode",

              id:
                resolved.episode.id

            }
          );


        const hls =
          extractHls(
            detail.stream
          );


        if (!hls) {

          return res.json({
            streams: []
          });

        }


        const streams =
          await streamsFromHls(
            hls
          );


        return res.json({
          streams
        });

      }


      // ======================================================
      // MOVIE — IMDb
      // ======================================================

      if (
        type === "movie" &&
        videoId.startsWith("tt")
      ) {

        console.log(
          `[MOVIE] Resolving IMDb ${videoId}`
        );


        const resolved =
          await resolveMovie(
            videoId
          );


        if (!resolved) {

          console.log(
            "[MOVIE] Not found on MX"
          );


          return res.json({
            streams: []
          });

        }


        const hls =
          extractHls(
            resolved.detail.stream
          );


        if (!hls) {

          return res.json({
            streams: []
          });

        }


        console.log(
          `[MOVIE] MX movie: ${resolved.mx.id}`
        );


        const streams =
          await streamsFromHls(
            hls
          );


        return res.json({
          streams
        });

      }


      // ======================================================
      // INTERNAL MX MOVIE
      // ======================================================

      if (
        type === "movie" &&
        videoId.startsWith("mx:")
      ) {

        const mxId =
          videoId.substring(3);


        const detail =
          await mxGet(
            "/detail/video",
            {

              type:
                "movie",

              id:
                mxId

            }
          );


        const hls =
          extractHls(
            detail.stream
          );


        if (!hls) {

          return res.json({
            streams: []
          });

        }


        const streams =
          await streamsFromHls(
            hls
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
// MOVIE CATALOG
// ============================================================

app.get(
  "/catalog/:type/:id.json",
  async (req, res) => {

    try {

      if (
        req.params.type !==
          "movie" ||

        req.params.id !==
          "mxmovies"
      ) {

        return res.json({
          metas: []
        });

      }


      const search =
        String(
          req.query.search ||
          ""
        ).trim();


      let results;


      // ------------------------------------------------------
      // Search
      // ------------------------------------------------------

      if (search) {

        results =
          await mxSearch(
            search
          );

      } else {

        // ----------------------------------------------------
        // Browse MX homepage
        // ----------------------------------------------------

        const data =
          await mxGet(
            "/home/tab/87c3ddc974dcf12294e9412bec44b097",
            {
              pageSize:
                "50"
            }
          );


        results =
          collectObjects(
            data
          );

      }


      const movies =
        results.filter(
          item =>
            item &&
            item.id &&
            item.type ===
              "movie" &&
            item.title
        );


      const unique =
        new Map();


      for (
        const movie
        of movies
      ) {

        if (
          !unique.has(
            movie.id
          )
        ) {

          unique.set(
            movie.id,
            movie
          );

        }

      }


      const metas =
        [
          ...unique.values()
        ]
        .map(
          movie => ({

            id:
              `mx:${movie.id}`,

            type:
              "movie",

            name:
              movie.title,

            poster:
              getPoster(
                movie
              ),

            posterShape:
              "poster",

            description:
              movie.description ||
              undefined,

            releaseInfo:
              movie.releaseDate
                ? String(
                    movie.releaseDate
                  ).slice(
                    0,
                    4
                  )
                : undefined

          })
        );


      const skip =
        Number(
          req.query.skip ||
          0
        );


      res.json({

        metas:
          metas.slice(
            skip,
            skip + 100
          )

      });


    } catch (error) {

      console.error(
        "[CATALOG ERROR]",
        error
      );


      res.json({
        metas: []
      });

    }

  }
);


// ============================================================
// POSTER
// ============================================================

function getPoster(
  item
) {

  const images =
    item.imageInfo ||
    [];


  for (
    const image
    of images
  ) {

    if (
      image &&
      image.url
    ) {

      return image.url.startsWith(
        "http"
      )
        ? image.url
        : `https://isa-1.mxplay.com/${image.url}`;

    }

  }


  return undefined;

}


// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `MX Player addon ${VERSION} listening on ${HOST}:${PORT}`
    );

  }
);
