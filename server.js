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

  "tt8595766:2:1": {
    title: "Apna Kamra",

    hash:
      "637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218",

    page:
      "https://www.mxplayer.in/show/watch-yeh-meri-family/season-2/apna-kamra-online-a2c9ed2742914673e2f83d8ec6b863b8"
  },


  "tt8595766:2:2": {
    title: "Cable TV",

    hash:
      "f275ab1d5b01a1c891d6948b650f3f6ca0f48b780ca7ab2a76ffea423a233c03",

    page:
      "https://www.mxplayer.in/show/watch-yeh-meri-family/season-2/cable-tv-online-43d578b732c89e2491888b739c46d881"
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
      `Invalid JSON: ${url}`
    );

  }

}


// ============================================================
// MX USER ID
// ============================================================

function userId() {

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
      userId(),

    ...extra

  });

}


// ============================================================
// MX DETAIL
// ============================================================

async function mxDetail(id, type = "episode") {

  const url =
    `${MX_API}/detail/video?` +
    mxParams({

      id,

      type

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
// RECURSIVELY COLLECT STRINGS
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

    for (const key of Object.keys(value)) {

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
// EXTRACT ALL M3U8 URLS
// ============================================================

function extractM3u8Urls(text) {

  if (!text) {
    return [];
  }


  const urls = [];


  // Normal URLs
  const normalRegex =
    /https?:\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi;


  let match;


  while (
    (match = normalRegex.exec(text)) !== null
  ) {

    urls.push(
      normalizeUrl(match[0])
    );

  }


  // Escaped URLs
  const escapedRegex =
    /https?:\\\/\\\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi;


  while (
    (match = escapedRegex.exec(text)) !== null
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
// EXTRACT HLS URLS FROM JSON OBJECT
// ============================================================

function extractHlsFromObject(data) {

  const strings =
    collectStrings(data);


  const result = [];


  for (const value of strings) {

    if (
      value &&
      value.includes(".m3u8")
    ) {

      const matches =
        extractM3u8Urls(value);


      result.push(
        ...matches
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

function extractVideoHash(
  urls
) {

  for (const url of urls) {

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
// VIDEO QUALITY
// ============================================================

function getQuality(url) {

  const name =
    url.toLowerCase();


  // 1080
  if (
    /1080/.test(name)
  ) {

    return {
      value: 1080,
      label: "1080p"
    };

  }


  // 720
  if (
    /720/.test(name)
  ) {

    return {
      value: 720,
      label: "720p"
    };

  }


  // 480
  if (
    /480/.test(name)
  ) {

    return {
      value: 480,
      label: "480p"
    };

  }


  // 360
  if (
    /360/.test(name)
  ) {

    return {
      value: 360,
      label: "360p"
    };

  }


  // 240
  if (
    /240/.test(name)
  ) {

    return {
      value: 240,
      label: "240p"
    };

  }


  // 180
  if (
    /180/.test(name)
  ) {

    return {
      value: 180,
      label: "180p"
    };

  }


  // Generic MX high stream
  if (
    /h264_high\.m3u8/.test(name)
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
// IS AUDIO
// ============================================================

function isAudio(url) {

  return /audio[_-]/i.test(url);

}


// ============================================================
// IS SUBTITLE
// ============================================================

function isSubtitle(url) {

  return (
    /subtitle[_-]/i.test(url) ||
    /subtitles[_-]/i.test(url)
  );

}


// ============================================================
// IS VIDEO
// ============================================================

function isVideo(url) {

  return (
    /\.m3u8/i.test(url) &&
    !isAudio(url) &&
    !isSubtitle(url)
  );

}


// ============================================================
// FIND PAGE URL IN OBJECT
// ============================================================

function findPageUrl(data) {

  const strings =
    collectStrings(data);


  for (const value of strings) {

    if (
      value &&
      /^https?:\/\/(?:www\.)?mxplayer\.in\//i.test(value) &&
      (
        value.includes("/show/") ||
        value.includes("/movie/") ||
        value.includes("/watch-")
      )
    ) {

      return value;

    }

  }


  return null;

}


// ============================================================
// EXTRACT EPISODE-LIKE OBJECTS
// ============================================================

function extractEpisodeObjects(
  data
) {

  const result = [];


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


    if (
      typeof value !== "object"
    ) {

      return;

    }


    const hasPage =
      value.webUrl ||
      value.weburl ||
      value.shareUrl ||
      value.shareURL;


    const hasId =
      value.id ||
      value.videoId ||
      value.videoID;


    if (
      hasPage &&
      hasId
    ) {

      result.push(value);

    }


    for (
      const key of Object.keys(value)
    ) {

      walk(value[key]);

    }

  }


  walk(data);


  // Remove duplicates
  const unique = [];

  const seen =
    new Set();


  for (const item of result) {

    const key =
      [
        item.id,
        item.videoId,
        item.videoID,
        item.webUrl,
        item.weburl
      ]
        .filter(Boolean)
        .join("|");


    if (!seen.has(key)) {

      seen.add(key);

      unique.push(item);

    }

  }


  return unique;

}


// ============================================================
// FIND EPISODE PAGE
// ============================================================

async function resolveEpisodePage(
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

  const seasonNumber =
    Number(match[2]);

  const episodeNumber =
    Number(match[3]);


  const seasonId =
    KNOWN_SEASONS[
      `${imdb}:${seasonNumber}`
    ];


  if (!seasonId) {
    return null;
  }


  const data =
    await mxSeasonEpisodes(
      seasonId
    );


  const episodes =
    extractEpisodeObjects(data);


  if (
    episodes.length <
    episodeNumber
  ) {

    return null;

  }


  const episode =
    episodes[
      episodeNumber - 1
    ];


  const page =
    episode.webUrl ||
    episode.weburl ||
    episode.shareUrl ||
    episode.shareURL ||
    findPageUrl(episode);


  if (!page) {

    return null;

  }


  return {

    page,

    episodeId:
      episode.id ||
      episode.videoId ||
      episode.videoID,

    title:
      episode.title ||
      episode.name ||
      `Episode ${episodeNumber}`

  };

}


// ============================================================
// FETCH PAGE AND EXTRACT STREAM URLS
// ============================================================

async function extractPageStreams(
  page
) {

  try {

    const html =
      await fetchText(page);


    const urls =
      extractM3u8Urls(html);


    return urls;

  } catch (error) {

    console.log(
      "PAGE EXTRACTION ERROR:",
      error.message
    );


    return [];

  }

}


// ============================================================
// GET DETAIL STREAMS
// ============================================================

async function extractDetailStreams(
  episodeId
) {

  if (!episodeId) {
    return [];
  }


  try {

    const data =
      await mxDetail(
        episodeId,
        "episode"
      );


    return extractHlsFromObject(
      data
    );

  } catch (error) {

    console.log(
      "DETAIL STREAM ERROR:",
      error.message
    );


    return [];

  }

}


// ============================================================
// RESOLVE EPISODE
// ============================================================

async function resolveEpisode(
  videoId
) {

  // ----------------------------------------------------------
  // Known episode
  // ----------------------------------------------------------

  if (
    KNOWN_EPISODES[videoId]
  ) {

    return {

      ...KNOWN_EPISODES[videoId],

      method:
        "known-episode"

    };

  }


  // ----------------------------------------------------------
  // Automatic episode resolution
  // ----------------------------------------------------------

  const info =
    await resolveEpisodePage(
      videoId
    );


  if (!info) {

    return null;

  }


  // First try the actual MX episode page.
  const pageStreams =
    await extractPageStreams(
      info.page
    );


  let hash =
    extractVideoHash(
      pageStreams
    );


  // Then try detail API.
  let detailStreams = [];


  if (!hash) {

    detailStreams =
      await extractDetailStreams(
        info.episodeId
      );


    hash =
      extractVideoHash(
        detailStreams
      );

  }


  if (!hash) {

    return null;

  }


  return {

    title:
      info.title,

    page:
      info.page,

    episodeId:
      info.episodeId,

    hash,

    pageStreams,

    detailStreams,

    method:
      "automatic"

  };

}


// ============================================================
// DISCOVER STREAM URLS
// ============================================================

async function discoverStreams(
  resolved
) {

  let urls = [];


  // ----------------------------------------------------------
  // Page URLs
  // ----------------------------------------------------------

  if (
    resolved.page
  ) {

    urls.push(
      ...await extractPageStreams(
        resolved.page
      )
    );

  }


  // ----------------------------------------------------------
  // Existing streams
  // ----------------------------------------------------------

  urls.push(
    ...(resolved.pageStreams || [])
  );


  urls.push(
    ...(resolved.detailStreams || [])
  );


  // ----------------------------------------------------------
  // Detail API
  // ----------------------------------------------------------

  if (
    resolved.episodeId
  ) {

    urls.push(
      ...await extractDetailStreams(
        resolved.episodeId
      )
    );

  }


  // ----------------------------------------------------------
  // Remove duplicates
  // ----------------------------------------------------------

  urls = [
    ...new Set(
      urls
        .map(normalizeUrl)
        .filter(Boolean)
    )
  ];


  return urls;

}


// ============================================================
// DISCOVER VIDEO QUALITIES
// ============================================================

async function discoverVideoQualities(
  resolved
) {

  const urls =
    await discoverStreams(
      resolved
    );


  const videoUrls =
    urls.filter(
      isVideo
    );


  const audioUrls =
    urls.filter(
      isAudio
    );


  const subtitleUrls =
    urls.filter(
      isSubtitle
    );


  // ----------------------------------------------------------
  // Add exact known video URL if page extraction missed it
  // ----------------------------------------------------------

  if (
    resolved.hash
  ) {

    const base =
      `https://d3sgzbosmwirao.cloudfront.net/video/${resolved.hash}/3/hls/`;


    const knownCandidates = [

      `${base}h264_1080_high_5800k.m3u8`,

      `${base}h264_720_high_3000k.m3u8`,

      `${base}h264_480_high_1750k.m3u8`,

      `${base}h264_360_high_750k.m3u8`,

      `${base}h264_180_high_235k.m3u8`,

      `${base}h264_high.m3u8`

    ];


    // We don't assume these exist.
    // Only add URLs already observed by MX/page data.
    for (
      const candidate of knownCandidates
    ) {

      if (
        videoUrls.includes(candidate)
      ) {

        continue;

      }

    }

  }


  return {

    videos:
      [...new Set(videoUrls)],

    audio:
      [...new Set(audioUrls)],

    subtitles:
      [...new Set(subtitleUrls)]

  };

}


// ============================================================
// AUDIO DISCOVERY
// ============================================================

async function getAudio(
  resolved,
  discovered
) {

  if (
    discovered.audio.length
  ) {

    return discovered.audio[0];

  }


  // Standard MX audio URL fallback.
  if (
    resolved.hash
  ) {

    const base =
      `https://d3sgzbosmwirao.cloudfront.net/video/${resolved.hash}/3/hls/`;


    const candidates = [

      `${base}audio_128000_0_96.m3u8`,

      `${base}audio_96000_0_96.m3u8`

    ];


    for (
      const url of candidates
    ) {

      try {

        const response =
          await fetch(
            url,
            {
              method: "GET"
            }
          );


        if (
          response.ok
        ) {

          return url;

        }

      } catch {

        // continue

      }

    }

  }


  return null;

}


// ============================================================
// CREATE MASTER PLAYLIST
// ============================================================

app.get(
  "/hls/master",
  async (req, res) => {

    try {

      const video =
        req.query.video;

      const audio =
        req.query.audio;


      if (!video) {

        return res
          .status(400)
          .type("text")
          .send(
            "Missing video URL"
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


      const quality =
        getQuality(video);


      // Use bitrate from the actual filename
      // when available.
      const bitrateMatch =
        video.match(
          /_(\d+)k\.m3u8/i
        );


      let bandwidth =
        bitrateMatch
          ? Number(
              bitrateMatch[1]
            ) * 1000
          : 1000000;


      if (
        !bandwidth ||
        bandwidth < 10000
      ) {

        bandwidth = 1000000;

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

    } catch (error) {

      console.error(
        "MASTER ERROR:",
        error
      );


      res
        .status(500)
        .type("text")
        .send(
          "Could not create HLS master"
        );

    }

  }
);


// ============================================================
// BUILD STREMIO STREAMS
// ============================================================

async function buildStreams(
  resolved,
  videoId
) {

  const discovered =
    await discoverVideoQualities(
      resolved
    );


  const audio =
    await getAudio(
      resolved,
      discovered
    );


  console.log(
    "================================================"
  );

  console.log(
    "VIDEO:",
    videoId
  );

  console.log(
    "HASH:",
    resolved.hash
  );

  console.log(
    "VIDEO PLAYLISTS:",
    discovered.videos
  );

  console.log(
    "AUDIO PLAYLIST:",
    audio
  );

  console.log(
    "SUBTITLES:",
    discovered.subtitles
  );

  console.log(
    "================================================"
  );


  const streams = [];


  for (
    const videoUrl of discovered.videos
  ) {

    const quality =
      getQuality(
        videoUrl
      );


    const master =
      `${ADDON_BASE}/hls/master?` +
      `video=${encodeURIComponent(videoUrl)}` +
      `&audio=${encodeURIComponent(audio || "")}`;


    streams.push({

      name:
        `MX Player ${quality.label}`,

      title:
        audio
          ? `MX Player • ${quality.label} • Audio`
          : `MX Player • ${quality.label}`,

      url:
        master,

      behaviorHints: {

        notWebReady:
          true,

        bingeGroup:
          `mxplayer-${quality.value}`

      },

      _quality:
        quality.value

    });

  }


  // ----------------------------------------------------------
  // Remove duplicate quality URLs
  // ----------------------------------------------------------

  const unique = [];

  const seen =
    new Set();


  for (
    const stream of streams
  ) {

    if (
      seen.has(
        stream.url
      )
    ) {

      continue;

    }


    seen.add(
      stream.url
    );


    unique.push(
      stream
    );

  }


  // Highest → lowest
  unique.sort(
    (a, b) =>
      b._quality -
      a._quality
  );


  // Remove internal field
  for (
    const stream of unique
  ) {

    delete stream._quality;

  }


  return {

    streams:
      unique,

    audio,

    subtitles:
      discovered.subtitles,

    hash:
      resolved.hash

  };

}


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
        "10.0.0",

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

      const resolved =
        await resolveEpisode(
          videoId
        );


      if (!resolved) {

        console.log(
          "NO RESOLUTION:",
          videoId
        );


        return res.json({
          streams: []
        });

      }


      const result =
        await buildStreams(
          resolved,
          videoId
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
            "Could not resolve episode"

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
        "10.0.0",

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
        "10.0.0",

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
// START SERVER
// ============================================================

app.listen(
  PORT,
  HOST,
  () => {

    console.log(
      `MX Player Resolver V10 running on ${HOST}:${PORT}`
    );

  }
);
