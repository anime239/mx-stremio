const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Origin"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


// ============================================================
// CONFIG
// ============================================================

const MX_BASE = "https://api.mxplayer.in/v1/web";
const MX_SEO = "https://seo.mxplayer.in/v1/api/seo";

const DEVICE_DENSITY = "2";
const PLATFORM = "com.mxplay.desktop";
const CONTENT_LANGUAGES = "hi,en";


// ============================================================
// KNOWN MX STREAMS
// ============================================================

const KNOWN_EPISODES = {

  // Yeh Meri Family S2E1 - Apna Kamra
  "tt8595766:2:1": {
    title: "Apna Kamra",
    hash:
      "637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218"
  },

  // Yeh Meri Family S2E2 - Cable TV
  "tt8595766:2:2": {
    title: "Cable TV",
    hash:
      "f275ab1d5b01a1c891d6948b650f3f6ca0f48b780ca7ab2a76ffea423a233c03"
  }

};


// ============================================================
// KNOWN MX SEASONS
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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      Accept: "*/*",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${url}`);
  }

  return await response.text();
}


async function fetchJson(url, options = {}) {
  const text = await fetchText(url, options);

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`Invalid JSON from ${url}`);
  }
}


// ============================================================
// RANDOM USER ID
// ============================================================

function makeUserId() {
  return (
    "addon-" +
    Math.random().toString(36).substring(2) +
    Date.now().toString(36)
  );
}


// ============================================================
// MX API PARAMETERS
// ============================================================

function mxParams(extra = {}) {
  return new URLSearchParams({
    "device-density": DEVICE_DENSITY,
    platform: PLATFORM,
    "content-languages": CONTENT_LANGUAGES,
    "kids-mode-enabled": "false",
    userid: makeUserId(),
    ...extra
  });
}


// ============================================================
// MX SEARCH
// ============================================================

async function mxSearch(query) {
  const url =
    `${MX_BASE}/search/resultv2?` +
    mxParams({
      q: query
    }).toString();

  return await fetchJson(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });
}


// ============================================================
// MX DETAIL
// ============================================================

async function mxDetail(id) {
  const url =
    `${MX_BASE}/detail/video?` +
    mxParams({
      id
    }).toString();

  return await fetchJson(url);
}


// ============================================================
// MX NEXT VIDEO
// ============================================================

async function mxNextVideo(id) {
  const url =
    `${MX_BASE}/detail/nextVideo?` +
    mxParams({
      id
    }).toString();

  return await fetchJson(url);
}


// ============================================================
// MX SEASON EPISODES
// ============================================================

async function mxSeasonEpisodes(seasonId) {
  const url =
    `${MX_BASE}/detail/tab/tvshowepisodes?` +
    mxParams({
      type: "season",
      id: seasonId,
      sortOrder: "0"
    }).toString();

  return await fetchJson(url);
}


// ============================================================
// EXTRACT STRINGS RECURSIVELY
// ============================================================

function collectStrings(value, output = []) {
  if (value == null) {
    return output;
  }

  if (typeof value === "string") {
    output.push(value);
    return output;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStrings(item, output);
    }

    return output;
  }

  if (typeof value === "object") {
    for (const key of Object.keys(value)) {
      collectStrings(value[key], output);
    }
  }

  return output;
}


// ============================================================
// EXTRACT HLS URL FROM MX API RESPONSE
// ============================================================

function findHlsUrls(value) {
  const strings = collectStrings(value);

  return [
    ...new Set(
      strings.filter((x) =>
        typeof x === "string" &&
        x.includes(".m3u8")
      )
    )
  ];
}


// ============================================================
// EXTRACT VIDEO HASH
// ============================================================

function findVideoHash(value) {
  const strings = collectStrings(value);

  for (const str of strings) {

    const match = str.match(
      /\/video\/([a-f0-9]{64})\//
    );

    if (match) {
      return match[1];
    }

  }

  return null;
}


// ============================================================
// EXTRACT HLS FROM MX WEB PAGE
// ============================================================

async function extractPageStreams(url) {

  try {

    const html = await fetchText(url);

    const urls = [];

    // Absolute m3u8 URLs
    const absoluteRegex =
      /https?:\/\/[^"'\\\s]+?\.m3u8(?:\?[^"'\\\s]*)?/gi;

    let match;

    while ((match = absoluteRegex.exec(html)) !== null) {
      urls.push(match[0]);
    }

    // Escaped JSON URLs
    const escapedRegex =
      /https?:\\\/\\\/[^"'\\\s]+?\.m3u8(?:\?[^"'\\\s]*)?/gi;

    while ((match = escapedRegex.exec(html)) !== null) {
      urls.push(
        match[0]
          .replace(/\\\//g, "/")
      );
    }

    return [...new Set(urls)];

  } catch (e) {

    console.log("PAGE STREAM ERROR:", e.message);

    return [];

  }
}


// ============================================================
// GET MX PAGE URL FROM API DATA
// ============================================================

function findMxPageUrl(value) {

  const strings = collectStrings(value);

  for (const str of strings) {

    if (
      typeof str === "string" &&
      str.includes("mxplayer.in/") &&
      (
        str.includes("/show/") ||
        str.includes("/movie/") ||
        str.includes("/video/")
      )
    ) {
      return str;
    }

  }

  return null;
}


// ============================================================
// GET STREAM FROM DETAIL
// ============================================================

function getStreamFromDetail(detail) {

  const urls = findHlsUrls(detail);

  if (urls.length > 0) {
    return urls[0];
  }

  return null;
}


// ============================================================
// CREATE HLS URL FROM HASH
// ============================================================

function videoBase(hash) {
  return (
    "https://d3sgzbosmwirao.cloudfront.net/video/" +
    hash +
    "/3/hls/"
  );
}


// ============================================================
// QUALITY PARSER
// ============================================================

function qualityFromUrl(url) {

  const lower = url.toLowerCase();

  if (
    lower.includes("1080") ||
    lower.includes("1920")
  ) {
    return 1080;
  }

  if (
    lower.includes("720") ||
    lower.includes("1280")
  ) {
    return 720;
  }

  if (
    lower.includes("480") ||
    lower.includes("854")
  ) {
    return 480;
  }

  if (
    lower.includes("360") ||
    lower.includes("640")
  ) {
    return 360;
  }

  if (
    lower.includes("240") ||
    lower.includes("426")
  ) {
    return 240;
  }

  if (
    lower.includes("180") ||
    lower.includes("320")
  ) {
    return 180;
  }

  // MX "h264_high.m3u8"
  if (
    lower.endsWith("/h264_high.m3u8") ||
    lower.includes("/h264_high.m3u8?")
  ) {
    return 999;
  }

  return 0;
}


// ============================================================
// QUALITY LABEL
// ============================================================

function qualityLabel(url) {

  const q = qualityFromUrl(url);

  if (q === 999) {
    return "High";
  }

  if (q > 0) {
    return `${q}p`;
  }

  return "Auto";
}


// ============================================================
// CANDIDATE VIDEO PLAYLISTS
// ============================================================
//
// MX naming varies by video.
// We test common MX playlist names and only keep URLs
// that actually respond successfully.
// ============================================================

function candidateVideoUrls(hash) {

  const base = videoBase(hash);

  return [

    // Highest / generic
    `${base}h264_1080_high_5000k.m3u8`,
    `${base}h264_1080_high_4500k.m3u8`,
    `${base}h264_1080_high_4000k.m3u8`,

    `${base}h264_720_high_3000k.m3u8`,
    `${base}h264_720_high_2500k.m3u8`,
    `${base}h264_720_high_2000k.m3u8`,

    `${base}h264_480_high_1750k.m3u8`,
    `${base}h264_480_high_1500k.m3u8`,

    `${base}h264_high.m3u8`,

    `${base}h264_360_high_750k.m3u8`,
    `${base}h264_360_high_600k.m3u8`,

    `${base}h264_240_high_400k.m3u8`,
    `${base}h264_180_high_235k.m3u8`

  ];

}


// ============================================================
// CHECK URL
// ============================================================

async function urlExists(url) {

  try {

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
      }
    });

    return response.ok;

  } catch (e) {

    return false;

  }

}


// ============================================================
// DISCOVER VIDEO PLAYLISTS
// ============================================================

async function discoverVideoPlaylists(hash, pageUrls = []) {

  const found = [];

  // ----------------------------------------------------------
  // 1. URLs found directly in MX page/API
  // ----------------------------------------------------------

  for (const url of pageUrls) {

    if (
      url.includes(".m3u8") &&
      !url.includes("audio_") &&
      !url.includes("subtitle_")
    ) {
      found.push(url);
    }

  }


  // ----------------------------------------------------------
  // 2. Known MX naming patterns
  // ----------------------------------------------------------

  const candidates = candidateVideoUrls(hash);

  // Test in parallel
  const results = await Promise.all(
    candidates.map(async (url) => ({
      url,
      exists: await urlExists(url)
    }))
  );

  for (const result of results) {

    if (result.exists) {
      found.push(result.url);
    }

  }


  return [
    ...new Set(found)
  ].sort((a, b) => {

    return qualityFromUrl(b) - qualityFromUrl(a);

  });

}


// ============================================================
// DISCOVER AUDIO
// ============================================================

async function discoverAudio(hash, pageUrls = []) {

  // First prefer an audio URL actually found on MX.
  for (const url of pageUrls) {

    if (
      url.includes(".m3u8") &&
      url.toLowerCase().includes("audio_")
    ) {
      return url;
    }

  }


  // Standard MX audio naming.
  const base = videoBase(hash);

  const candidates = [

    `${base}audio_128000_0_96.m3u8`,
    `${base}audio_128000_0_128.m3u8`,
    `${base}audio_96000_0_96.m3u8`,
    `${base}audio_96000_0_128.m3u8`

  ];


  for (const url of candidates) {

    if (await urlExists(url)) {
      return url;
    }

  }


  return null;
}


// ============================================================
// DISCOVER SUBTITLES
// ============================================================

function discoverSubtitle(pageUrls) {

  for (const url of pageUrls) {

    if (
      url.includes(".m3u8") &&
      url.toLowerCase().includes("subtitle_")
    ) {
      return url;
    }

  }

  return null;
}


// ============================================================
// RESOLVE HASH
// ============================================================

async function resolveHash(videoId) {

  // ----------------------------------------------------------
  // Known episode
  // ----------------------------------------------------------

  if (KNOWN_EPISODES[videoId]) {

    return {
      hash: KNOWN_EPISODES[videoId].hash,
      title: KNOWN_EPISODES[videoId].title,
      method: "known-episode"
    };

  }


  // ----------------------------------------------------------
  // Extract season + episode
  // ----------------------------------------------------------

  const match = videoId.match(
    /^(tt\d+):(\d+):(\d+)$/
  );

  if (!match) {
    return null;
  }

  const imdbId = match[1];
  const seasonNumber = Number(match[2]);
  const episodeNumber = Number(match[3]);

  const seasonKey =
    `${imdbId}:${seasonNumber}`;

  const seasonId =
    KNOWN_SEASONS[seasonKey];

  if (!seasonId) {
    return null;
  }


  // ----------------------------------------------------------
  // Get season episodes
  // ----------------------------------------------------------

  try {

    const data =
      await mxSeasonEpisodes(seasonId);

    const episodes = [];

    function walk(value) {

      if (!value) {
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


      // Episode-like object
      if (
        value.webUrl ||
        value.weburl ||
        value.nextVideo ||
        value.id
      ) {
        episodes.push(value);
      }


      for (const key of Object.keys(value)) {
        walk(value[key]);
      }

    }

    walk(data);


    // Remove duplicates
    const unique = [];

    const seen = new Set();

    for (const ep of episodes) {

      const key =
        JSON.stringify([
          ep.id,
          ep.webUrl,
          ep.weburl,
          ep.title,
          ep.name
        ]);

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(ep);
      }

    }


    // --------------------------------------------------------
    // Try episode number ordering
    // --------------------------------------------------------

    let episode = null;

    if (
      episodeNumber >= 1 &&
      episodeNumber <= unique.length
    ) {
      episode = unique[episodeNumber - 1];
    }


    // --------------------------------------------------------
    // If not found, walk nextVideo chain
    // --------------------------------------------------------

    if (!episode && unique.length > 0) {
      episode = unique[episodeNumber - 1];
    }

    if (!episode) {
      return null;
    }


    // --------------------------------------------------------
    // Try detail endpoint
    // --------------------------------------------------------

    const episodeId =
      episode.id ||
      episode.videoId ||
      episode.videoID;


    if (episodeId) {

      try {

        const detail =
          await mxDetail(episodeId);

        const hash =
          findVideoHash(detail);

        if (hash) {

          return {
            hash,
            title:
              episode.title ||
              episode.name ||
              `Episode ${episodeNumber}`,
            method: "mx-detail"
          };

        }

      } catch (e) {

        console.log(
          "DETAIL ERROR:",
          e.message
        );

      }

    }


    // --------------------------------------------------------
    // Try page URL
    // --------------------------------------------------------

    const pageUrl =
      episode.webUrl ||
      episode.weburl ||
      findMxPageUrl(episode);

    if (pageUrl) {

      const pageStreams =
        await extractPageStreams(pageUrl);

      const hash =
        findVideoHash(pageStreams);

      if (hash) {

        return {
          hash,
          title:
            episode.title ||
            episode.name ||
            `Episode ${episodeNumber}`,
          method: "mx-page"
        };

      }

    }


  } catch (e) {

    console.log(
      "SEASON RESOLVE ERROR:",
      e.message
    );

  }


  return null;
}


// ============================================================
// BUILD QUALITY STREAMS
// ============================================================

async function buildStreams(videoId, resolved) {

  const hash = resolved.hash;

  // Try MX page/API for additional real playlist URLs.
  let pageUrls = [];

  try {

    const detail =
      await mxDetail(hash);

    pageUrls.push(
      ...findHlsUrls(detail)
    );

  } catch (e) {
    // Ignore.
  }


  // Also try known/page-derived URLs where possible.
  const videoPlaylists =
    await discoverVideoPlaylists(
      hash,
      pageUrls
    );


  const audio =
    await discoverAudio(
      hash,
      pageUrls
    );


  const subtitle =
    discoverSubtitle(pageUrls);


  console.log("RESOLVED:", videoId);
  console.log("HASH:", hash);
  console.log("VIDEO PLAYLISTS:", videoPlaylists);
  console.log("AUDIO:", audio);
  console.log("SUBTITLE:", subtitle);


  const streams = [];


  // ----------------------------------------------------------
  // Create one Stremio stream per quality
  // ----------------------------------------------------------

  for (const videoUrl of videoPlaylists) {

    const quality =
      qualityLabel(videoUrl);

    const q =
      qualityFromUrl(videoUrl);


    // Our own combined HLS master.
    const masterUrl =
      `/hls/master?video=${encodeURIComponent(
        videoUrl
      )}&audio=${encodeURIComponent(
        audio || ""
      )}`;


    const absoluteMaster =
      `https://my-stremio-addon-q8ep.onrender.com${masterUrl}`;


    streams.push({

      name: `MX Player ${quality}`,

      title:
        audio
          ? `MX Player • ${quality} • Audio`
          : `MX Player • ${quality}`,

      url: absoluteMaster,

      behaviorHints: {

        notWebReady: true,

        bingeGroup:
          `mxplayer-${videoId}`

      },

      _quality: q

    });

  }


  // Remove duplicate quality labels
  const unique = [];

  const seen = new Set();

  for (const stream of streams) {

    const key =
      stream.title;

    if (!seen.has(key)) {

      seen.add(key);

      unique.push(stream);

    }

  }


  // Highest quality first
  unique.sort((a, b) => {

    return (
      (b._quality || 0) -
      (a._quality || 0)
    );

  });


  // Remove private helper
  for (const stream of unique) {
    delete stream._quality;
  }


  return {
    streams: unique,
    audio,
    subtitle,
    hash
  };

}


// ============================================================
// RESOLVE VIDEO
// ============================================================

async function resolveVideo(videoId) {

  // Known
  const known =
    KNOWN_EPISODES[videoId];

  if (known) {

    return await buildStreams(
      videoId,
      {
        hash: known.hash,
        title: known.title,
        method: "known-episode"
      }
    );

  }


  // Automatic
  const resolved =
    await resolveHash(videoId);

  if (!resolved) {

    return {
      streams: []
    };

  }


  return await buildStreams(
    videoId,
    resolved
  );

}


// ============================================================
// HLS MASTER GENERATOR
// ============================================================

app.get("/hls/master", async (req, res) => {

  const video =
    req.query.video;

  const audio =
    req.query.audio;


  if (!video) {

    return res
      .status(400)
      .type("text")
      .send("Missing video");

  }


  // ----------------------------------------------------------
  // Master playlist
  // ----------------------------------------------------------

  let playlist =
`#EXTM3U
#EXT-X-VERSION:3
`;


  if (audio) {

    playlist +=
`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="MX Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${audio}"
`;

  }


  const quality =
    qualityFromUrl(video);


  const bandwidth =
    quality === 1080
      ? 5000000
      : quality === 720
        ? 3000000
        : quality === 480
          ? 1750000
          : quality === 360
            ? 750000
            : 400000;


  playlist +=
`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${audio ? ',AUDIO="audio"' : ""}
${video}
`;


  res.setHeader(
    "Content-Type",
    "application/vnd.apple.mpegurl"
  );

  res.setHeader(
    "Cache-Control",
    "public, max-age=60"
  );

  res.send(playlist);

});


// ============================================================
// MANIFEST
// ============================================================

app.get("/manifest.json", (req, res) => {

  res.json({

    id: "com.my.stremio.video",

    version: "9.0.0",

    name: "MX Player Resolver",

    description:
      "Resolves playable MX Player HLS streams with separate quality options.",

    resources: [

      {
        name: "stream",
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

});


// ============================================================
// STREAM ENDPOINT
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
      `STREAM REQUEST: ${type} ${videoId}`
    );


    try {

      const result =
        await resolveVideo(videoId);


      res.json({

        streams:
          result.streams || []

      });


    } catch (e) {

      console.error(
        "STREAM ERROR:",
        e
      );


      res.json({
        streams: []
      });

    }

  }
);


// ============================================================
// DEBUG RESOLVE
// ============================================================

app.get(
  "/debug/resolve/:videoId",
  async (req, res) => {

    const videoId =
      decodeURIComponent(
        req.params.videoId
      );


    try {

      const known =
        KNOWN_EPISODES[videoId];


      if (known) {

        const result =
          await buildStreams(
            videoId,
            {
              hash: known.hash,
              title: known.title,
              method: "known-episode"
            }
          );


        return res.json({

          success: true,

          videoId,

          result

        });

      }


      const resolved =
        await resolveHash(videoId);


      if (!resolved) {

        return res.json({

          success: false,

          videoId,

          error:
            "Could not resolve MX video hash"

        });

      }


      const result =
        await buildStreams(
          videoId,
          resolved
        );


      res.json({

        success: true,

        videoId,

        resolved,

        result

      });


    } catch (e) {

      res.status(500).json({

        success: false,

        videoId,

        error:
          e.message

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

    version: "9.0.0",

    service:
      "MX Player Resolver"

  });

});


// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {

  res.json({

    name:
      "MX Player Resolver",

    version:
      "9.0.0",

    status:
      "running",

    manifest:
      "/manifest.json",

    health:
      "/health"

  });

});


// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `MX Player Resolver running on ${HOST}:${PORT}`
    );

  }
);
