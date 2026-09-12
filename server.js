const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADDON_BASE =
  "https://my-stremio-addon-q8ep.onrender.com";

const MX_API =
  "https://api.mxplayer.in/v1/web";


// ============================================================
// CORS
// ============================================================

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,OPTIONS"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Origin"
  );
  res.setHeader(
    "Access-Control-Max-Age",
    "86400"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


// ============================================================
// KNOWN EPISODES
// ============================================================

const KNOWN_EPISODES = {

  // ----------------------------------------------------------
  // Yeh Meri Family S2E1
  // ----------------------------------------------------------

  "tt8595766:2:1": {

    title: "Apna Kamra",

    hash:
      "637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218",

    knownVideos: [

      "h264_high.m3u8",

      "h264_720_high_3000k.m3u8",

      "h264_360_high_750k.m3u8",

      "h264_180_high_235k.m3u8"

    ]

  },


  // ----------------------------------------------------------
  // Yeh Meri Family S2E2
  // ----------------------------------------------------------

  "tt8595766:2:2": {

    title: "Cable TV",

    hash:
      "f275ab1d5b01a1c891d6948b650f3f6ca0f48b780ca7ab2a76ffea423a233c03",

    knownVideos: [

      // Confirmed from MX Player Network
      "h264_1080_high_5800k.m3u8",

      "h264_high.m3u8",

      "h264_480_high_1750k.m3u8",

      "h264_360_high_750k.m3u8",

      "h264_180_high_235k.m3u8"

    ]

  }

};


// ============================================================
// KNOWN SEASONS
// ============================================================

const KNOWN_SEASONS = {

  "tt8595766:2":
    "1a8452f31b2fcff5e495b44afdb3fbdb"

};


// ============================================================
// HTTP HELPERS
// ============================================================

async function fetchText(url, options = {}) {

  const response = await fetch(url, {

    ...options,

    headers: {

      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/148 Mobile Safari/537.36",

      Accept:
        "*/*",

      ...(options.headers || {})

    }

  });


  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status}: ${url}`
    );

  }


  return await response.text();

}


async function fetchJson(url, options = {}) {

  const text =
    await fetchText(url, options);


  try {

    return JSON.parse(text);

  } catch {

    throw new Error(
      `Invalid JSON from ${url}`
    );

  }

}


// ============================================================
// MX USER ID
// ============================================================

function createUserId() {

  return (
    "addon-" +
    Math.random()
      .toString(36)
      .substring(2) +
    "-" +
    Date.now()
  );

}


// ============================================================
// MX PARAMETERS
// ============================================================

function mxParams(extra = {}) {

  return new URLSearchParams({

    "device-density":
      "2",

    platform:
      "com.mxplay.desktop",

    "content-languages":
      "hi,en",

    "kids-mode-enabled":
      "false",

    userid:
      createUserId(),

    ...extra

  });

}


// ============================================================
// MX DETAIL
// ============================================================

async function mxDetail(id) {

  const url =
    `${MX_API}/detail/video?` +
    mxParams({
      id
    }).toString();


  return await fetchJson(url);

}


// ============================================================
// MX SEASON EPISODES
// ============================================================

async function mxSeasonEpisodes(
  seasonId
) {

  const url =
    `${MX_API}/detail/tab/tvshowepisodes?` +
    mxParams({

      type:
        "season",

      id:
        seasonId,

      sortOrder:
        "0"

    }).toString();


  return await fetchJson(url);

}


// ============================================================
// COLLECT STRINGS
// ============================================================

function collectStrings(
  value,
  result = []
) {

  if (value == null) {
    return result;
  }


  if (typeof value === "string") {

    result.push(value);

    return result;

  }


  if (Array.isArray(value)) {

    for (const item of value) {

      collectStrings(
        item,
        result
      );

    }

    return result;

  }


  if (typeof value === "object") {

    for (
      const key of Object.keys(value)
    ) {

      collectStrings(
        value[key],
        result
      );

    }

  }


  return result;

}


// ============================================================
// NORMALIZE URL
// ============================================================

function normalizeUrl(url) {

  if (!url) {
    return null;
  }


  return url

    .replace(/\\u0026/g, "&")

    .replace(/\\\//g, "/")

    .replace(/&amp;/g, "&")

    .replace(/^"|"$/g, "")

    .trim();

}


// ============================================================
// EXTRACT M3U8 URLS
// ============================================================

function extractM3u8Urls(text) {

  if (!text) {
    return [];
  }


  const urls = [];


  const regex =
    /https?:\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi;


  let match;


  while (
    (match = regex.exec(text)) !== null
  ) {

    urls.push(
      normalizeUrl(match[0])
    );

  }


  return [
    ...new Set(
      urls.filter(Boolean)
    )
  ];

}


// ============================================================
// EXTRACT M3U8 FROM OBJECT
// ============================================================

function extractHlsUrls(data) {

  const result = [];


  for (
    const value of collectStrings(data)
  ) {

    if (
      value &&
      value.includes(".m3u8")
    ) {

      result.push(
        ...extractM3u8Urls(value)
      );

    }

  }


  return [
    ...new Set(result)
  ];

}


// ============================================================
// EXTRACT VIDEO HASH
// ============================================================

function extractHash(urls) {

  for (
    const url of urls
  ) {

    const match =
      url.match(
        /\/video\/([a-f0-9]{64})\//
      );


    if (match) {

      return match[1];

    }

  }


  return null;

}


// ============================================================
// BUILD MX VIDEO BASE
// ============================================================

function videoBase(hash) {

  return (
    `https://d3sgzbosmwirao.cloudfront.net/video/${hash}/3/hls/`
  );

}


// ============================================================
// CHECK URL
// ============================================================

async function urlWorks(url) {

  try {

    const response =
      await fetch(
        url,
        {
          method: "GET",

          headers: {

            "User-Agent":
              "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/148 Mobile Safari/537.36",

            Accept:
              "*/*"

          }

        }
      );


    return response.ok;

  } catch {

    return false;

  }

}


// ============================================================
// QUALITY
// ============================================================

function quality(url) {

  const lower =
    url.toLowerCase();


  if (
    lower.includes("1080")
  ) {

    return {
      value: 1080,
      label: "1080p"
    };

  }


  if (
    lower.includes("720")
  ) {

    return {
      value: 720,
      label: "720p"
    };

  }


  if (
    lower.includes("480")
  ) {

    return {
      value: 480,
      label: "480p"
    };

  }


  if (
    lower.includes("360")
  ) {

    return {
      value: 360,
      label: "360p"
    };

  }


  if (
    lower.includes("240")
  ) {

    return {
      value: 240,
      label: "240p"
    };

  }


  if (
    lower.includes("180")
  ) {

    return {
      value: 180,
      label: "180p"
    };

  }


  if (
    lower.includes("h264_high.m3u8")
  ) {

    return {
      value: 1000,
      label: "High"
    };

  }


  return {
    value: 1,
    label: "Auto"
  };

}


// ============================================================
// AUDIO URL
// ============================================================

async function findAudio(
  hash,
  discoveredUrls = []
) {

  // First: exact audio URL discovered from MX
  for (
    const url of discoveredUrls
  ) {

    if (
      /audio[_-].*\.m3u8/i.test(url)
    ) {

      return url;

    }

  }


  // Second: known MX naming
  const base =
    videoBase(hash);


  const candidates = [

    "audio_128000_0_96.m3u8",

    "audio_128000_0_128.m3u8",

    "audio_96000_0_96.m3u8",

    "audio_96000_0_128.m3u8"

  ];


  for (
    const filename of candidates
  ) {

    const url =
      base + filename;


    if (
      await urlWorks(url)
    ) {

      return url;

    }

  }


  return null;

}


// ============================================================
// KNOWN VIDEO DISCOVERY
// ============================================================

async function discoverKnownVideos(
  episode
) {

  const base =
    videoBase(
      episode.hash
    );


  const results = [];


  // ----------------------------------------------------------
  // Probe the exact known filenames
  // ----------------------------------------------------------

  for (
    const filename of episode.knownVideos
  ) {

    const url =
      base + filename;


    const exists =
      await urlWorks(url);


    console.log(
      "PROBE:",
      filename,
      exists
    );


    if (exists) {

      results.push(
        url
      );

    }

  }


  return [
    ...new Set(results)
  ];

}


// ============================================================
// PAGE STREAM EXTRACTION
// ============================================================

async function pageStreams(page) {

  if (!page) {
    return [];
  }


  try {

    const html =
      await fetchText(page);


    return extractM3u8Urls(
      html
    );

  } catch (error) {

    console.log(
      "PAGE ERROR:",
      error.message
    );


    return [];

  }

}


// ============================================================
// AUTOMATIC EPISODE OBJECTS
// ============================================================

function findEpisodeObjects(
  data
) {

  const result = [];


  function walk(value) {

    if (!value) {
      return;
    }


    if (Array.isArray(value)) {

      for (
        const item of value
      ) {

        walk(item);

      }

      return;

    }


    if (
      typeof value !== "object"
    ) {

      return;

    }


    const id =
      value.id ||
      value.videoId ||
      value.videoID;


    const page =
      value.webUrl ||
      value.weburl ||
      value.shareUrl ||
      value.shareURL;


    if (
      id &&
      page
    ) {

      result.push({

        id,

        page,

        title:
          value.title ||
          value.name

      });

    }


    for (
      const key of Object.keys(value)
    ) {

      walk(value[key]);

    }

  }


  walk(data);


  const unique = [];

  const seen =
    new Set();


  for (
    const item of result
  ) {

    const key =
      `${item.id}|${item.page}`;


    if (
      !seen.has(key)
    ) {

      seen.add(key);

      unique.push(item);

    }

  }


  return unique;

}


// ============================================================
// AUTOMATIC EPISODE RESOLUTION
// ============================================================

async function resolveAutomatic(
  videoId
) {

  const match =
    videoId.match(
      /^(tt\d+):(\d+):(\d+)$/
    );


  if (!match) {
    return null;
  }


  const imdb =
    match[1];

  const season =
    Number(match[2]);

  const episodeNumber =
    Number(match[3]);


  const seasonId =
    KNOWN_SEASONS[
      `${imdb}:${season}`
    ];


  if (!seasonId) {
    return null;
  }


  const data =
    await mxSeasonEpisodes(
      seasonId
    );


  const episodes =
    findEpisodeObjects(
      data
    );


  const episode =
    episodes[
      episodeNumber - 1
    ];


  if (!episode) {
    return null;
  }


  const streams =
    await pageStreams(
      episode.page
    );


  let hash =
    extractHash(
      streams
    );


  // Try MX detail
  if (
    !hash
  ) {

    try {

      const detail =
        await mxDetail(
          episode.id
        );


      const detailStreams =
        extractHlsUrls(
          detail
        );


      hash =
        extractHash(
          detailStreams
        );

    } catch (error) {

      console.log(
        "DETAIL ERROR:",
        error.message
      );

    }

  }


  if (!hash) {

    return null;

  }


  return {

    title:
      episode.title ||
      `Episode ${episodeNumber}`,

    hash,

    episodeId:
      episode.id,

    page:
      episode.page,

    discovered:
      streams

  };

}


// ============================================================
// RESOLVE EPISODE
// ============================================================

async function resolveEpisode(
  videoId
) {

  // ----------------------------------------------------------
  // KNOWN
  // ----------------------------------------------------------

  if (
    KNOWN_EPISODES[videoId]
  ) {

    return {

      ...KNOWN_EPISODES[videoId],

      method:
        "known"

    };

  }


  // ----------------------------------------------------------
  // AUTOMATIC
  // ----------------------------------------------------------

  return await resolveAutomatic(
    videoId
  );

}


// ============================================================
// BUILD STREAMS
// ============================================================

async function buildStreams(
  resolved,
  videoId
) {

  let videoUrls = [];


  // ----------------------------------------------------------
  // Known episode
  // ----------------------------------------------------------

  if (
    resolved.knownVideos
  ) {

    videoUrls =
      await discoverKnownVideos(
        resolved
      );

  }


  // ----------------------------------------------------------
  // Page/API discovered URLs
  // ----------------------------------------------------------

  const discovered =
    resolved.discovered || [];


  if (
    resolved.page
  ) {

    discovered.push(
      ...(await pageStreams(
        resolved.page
      ))
    );

  }


  for (
    const url of discovered
  ) {

    if (
      /\.m3u8/i.test(url) &&
      !/audio[_-]/i.test(url) &&
      !/subtitle[_-]/i.test(url)
    ) {

      videoUrls.push(
        url
      );

    }

  }


  videoUrls = [
    ...new Set(
      videoUrls
    )
  ];


  // ----------------------------------------------------------
  // Audio
  // ----------------------------------------------------------

  const audio =
    await findAudio(
      resolved.hash,
      discovered
    );


  console.log(
    "VIDEO URLS:",
    videoUrls
  );


  console.log(
    "AUDIO:",
    audio
  );


  // ----------------------------------------------------------
  // Create streams
  // ----------------------------------------------------------

  const streams = [];


  for (
    const videoUrl of videoUrls
  ) {

    const q =
      quality(
        videoUrl
      );


    const master =
      `${ADDON_BASE}/hls/master?` +
      `video=${encodeURIComponent(videoUrl)}` +
      `&audio=${encodeURIComponent(audio || "")}`;


    streams.push({

      name:
        `MX Player ${q.label}`,

      title:
        `MX Player • ${q.label}` +
        (
          audio
            ? " • Audio"
            : ""
        ),

      url:
        master,

      behaviorHints: {

        notWebReady:
          true,

        bingeGroup:
          `mxplayer-${q.label}`

      },

      _quality:
        q.value

    });

  }


  // Highest first
  streams.sort(
    (a, b) =>
      b._quality -
      a._quality
  );


  // Remove duplicate qualities
  const unique = [];

  const seen =
    new Set();


  for (
    const stream of streams
  ) {

    if (
      seen.has(
        stream.name
      )
    ) {

      continue;

    }


    seen.add(
      stream.name
    );


    delete stream._quality;

    unique.push(
      stream
    );

  }


  return {

    streams:
      unique,

    audio,

    videoUrls,

    hash:
      resolved.hash

  };

}


// ============================================================
// HLS MASTER
// ============================================================

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
        .type("text")
        .send(
          "Missing video"
        );

    }


    let playlist =
`#EXTM3U
#EXT-X-VERSION:3
`;


    if (audio) {

      playlist +=
`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="MX Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${audio}"
`;

    }


    const match =
      video.match(
        /_(\d+)k\.m3u8/i
      );


    let bandwidth =
      match
        ? Number(match[1]) * 1000
        : 1000000;


    if (
      !bandwidth
    ) {

      bandwidth =
        1000000;

    }


    playlist +=
`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${audio ? ',AUDIO="audio"' : ""}
${video}
`;


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
      "public,max-age=60"
    );


    res.send(
      playlist
    );

  }
);


// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (req, res) => {

    res.json({

      id:
        "com.my.stremio.video",

      version:
        "11.0.0",

      name:
        "MX Player Resolver",

      description:
        "MX Player HLS resolver with separate quality streams.",

      resources: [

        {
          name:
            "stream",

          types: [
            "movie",
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
      ],

      catalogs: []

    });

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
      decodeURIComponent(
        req.params.videoId
      );


    console.log(
      "================================================"
    );


    console.log(
      "STREAM REQUEST:",
      type,
      videoId
    );


    try {

      const resolved =
        await resolveEpisode(
          videoId
        );


      if (!resolved) {

        console.log(
          "RESOLUTION FAILED"
        );


        return res.json({
          streams: []
        });

      }


      console.log(
        "RESOLVED:",
        resolved
      );


      const result =
        await buildStreams(
          resolved,
          videoId
        );


      console.log(
        "RETURNING STREAMS:",
        result.streams
      );


      res.json({

        streams:
          result.streams

      });


    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
      );


      res.json({

        streams: []

      });

    }

  }
);


// ============================================================
// DEBUG
// ============================================================

app.get(
  "/debug/resolve/:videoId",
  async (req, res) => {

    const videoId =
      decodeURIComponent(
        req.params.videoId
      );


    try {

      const resolved =
        await resolveEpisode(
          videoId
        );


      if (!resolved) {

        return res.json({

          success:
            false,

          videoId,

          error:
            "Resolution failed"

        });

      }


      const result =
        await buildStreams(
          resolved,
          videoId
        );


      res.json({

        success:
          true,

        videoId,

        resolved,

        result

      });


    } catch (error) {

      res.status(500).json({

        success:
          false,

        videoId,

        error:
          error.message

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

      ok:
        true,

      version:
        "11.0.0",

      service:
        "MX Player Resolver"

    });

  }
);


// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (req, res) => {

    res.json({

      name:
        "MX Player Resolver",

      version:
        "11.0.0",

      status:
        "running",

      manifest:
        "/manifest.json",

      health:
        "/health"

    });

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
      `MX Player Resolver V11 running on ${HOST}:${PORT}`
    );

  }
);
