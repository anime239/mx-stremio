const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADDON_BASE = "https://my-stremio-addon-q8ep.onrender.com";

const MX_API = "https://api.mxplayer.in/v1/web";

const CDN_BASE = "https://d3sgzbosmwirao.cloudfront.net";

const VERSION = "12.0.0";


// ============================================================
// MX PLAYER API
// ============================================================

const MX_USER_ID =
  process.env.MX_USER_ID ||
  "00000000-0000-4000-8000-000000000001";

const MX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/125.0.0.0 Safari/537.36",

  "Accept": "application/json, text/plain, */*",

  "Referer": "https://www.mxplayer.in/",

  "Origin": "https://www.mxplayer.in"
};


async function mxRequest(path, params = {}, options = {}) {
  const url = new URL(MX_API + path);

  const baseParams = {
    "device-density": "2",
    "platform": "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: MX_USER_ID
  };

  for (const [key, value] of Object.entries({
    ...baseParams,
    ...params
  })) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  const controller = new AbortController();

  const timer = setTimeout(() => {
    controller.abort();
  }, options.timeout || 12000);

  try {
    const response = await fetch(url, {
      method: options.method || "GET",
      headers: MX_HEADERS,
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(
        `MX API HTTP ${response.status}`
      );
    }

    return await response.json();

  } finally {
    clearTimeout(timer);
  }
}


// ============================================================
// KNOWN WORKING EPISODES
//
// Keep E1/E2 exactly as they were because we already verified
// those streams manually.
// ============================================================

const KNOWN_EPISODES = {

  "tt8595766:2:1": {
    title: "Apna Kamra",

    hash:
      "637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218",

    knownVideos: [
      "h264_720_high_3000k.m3u8",
      "h264_high.m3u8",
      "h264_360_high_750k.m3u8",
      "h264_180_high_235k.m3u8"
    ]
  },


  // Keep the user's existing working mapping.
  "tt8595766:2:2": {
    title: "Cable TV",

    hash:
      "f275ab1d5b01a1c891d6948b650f3f6ca0f48b780ca7ab2a76ffea423a233c03",

    knownVideos: [
      "h264_1080_high_5800k.m3u8",
      "h264_high.m3u8",
      "h264_480_high_1750k.m3u8",
      "h264_360_high_750k.m3u8",
      "h264_180_high_235k.m3u8"
    ]
  }

};


// ============================================================
// REQUESTED EPISODE TITLE OVERRIDES
//
// This preserves the numbering currently used by the user's
// Stremio setup:
//
// E3 -> Party
// E4 -> Parent Teacher Meeting
// E5 -> Blank Call
// ============================================================

const EPISODE_TITLE_OVERRIDES = {

  "tt8595766:2:3": "Party",

  "tt8595766:2:4": "Parent Teacher Meeting",

  "tt8595766:2:5": "Blank Call"

};


// ============================================================
// QUALITY DEFINITIONS
// ============================================================

const QUALITY_DEFINITIONS = [

  {
    label: "2160p",
    patterns: [
      "h264_2160_high_12000k.m3u8",
      "h264_2160_high_10000k.m3u8",
      "h264_2160_high_8000k.m3u8"
    ]
  },

  {
    label: "1440p",
    patterns: [
      "h264_1440_high_8000k.m3u8",
      "h264_1440_high_6000k.m3u8"
    ]
  },

  {
    label: "1080p",
    patterns: [
      "h264_1080_high_5800k.m3u8",
      "h264_1080_high_5000k.m3u8",
      "h264_1080_high_4500k.m3u8"
    ]
  },

  {
    label: "720p",
    patterns: [
      "h264_720_high_3000k.m3u8",
      "h264_720_high_2500k.m3u8"
    ]
  },

  {
    label: "480p",
    patterns: [
      "h264_480_high_1750k.m3u8",
      "h264_480_high_1500k.m3u8"
    ]
  },

  {
    label: "360p",
    patterns: [
      "h264_360_high_750k.m3u8",
      "h264_360_high_600k.m3u8"
    ]
  },

  {
    label: "180p",
    patterns: [
      "h264_180_high_235k.m3u8",
      "h264_180_high_200k.m3u8"
    ]
  },

  {
    label: "High",
    patterns: [
      "h264_high.m3u8"
    ]
  }
];


const AUDIO_FILES = [
  "audio_128000_0_96.m3u8",
  "audio_96000_0_96.m3u8",
  "audio_64000_0_96.m3u8"
];


// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


function uniqueBy(array, keyFn) {

  const seen = new Set();

  return array.filter(item => {

    const key = keyFn(item);

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}


function getHashFromHls(hls) {

  if (!hls) {
    return null;
  }

  const match =
    hls.match(
      /\/video\/([^/]+)\/\d+\/hls\//
    );

  return match ? match[1] : null;
}


function getHlsBase(hls) {

  if (!hls) {
    return null;
  }

  const index = hls.lastIndexOf("/");

  if (index === -1) {
    return null;
  }

  return hls.substring(0, index + 1);
}


function qualityBandwidth(label) {

  const values = {
    "2160p": 12000000,
    "1440p": 8000000,
    "1080p": 5800000,
    "720p": 3000000,
    "480p": 1750000,
    "360p": 750000,
    "180p": 235000,
    "High": 4000000
  };

  return values[label] || 2000000;
}


function qualityRank(label) {

  const values = {
    "2160p": 2160,
    "1440p": 1440,
    "1080p": 1080,
    "720p": 720,
    "480p": 480,
    "360p": 360,
    "180p": 180,
    "High": 700
  };

  return values[label] || 0;
}


// ============================================================
// CHECK WHETHER A STREAM EXISTS
// ============================================================

async function streamExists(url) {

  try {

    const controller = new AbortController();

    const timer = setTimeout(() => {
      controller.abort();
    }, 5000);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/125.0.0.0 Safari/537.36"
      },
      signal: controller.signal
    });

    clearTimeout(timer);

    return response.ok;

  } catch (error) {

    return false;
  }
}


// ============================================================
// FIND AUDIO
// ============================================================

async function findAudio(baseUrl) {

  if (!baseUrl) {
    return null;
  }

  const discovered = [];

  for (const file of AUDIO_FILES) {

    discovered.push(
      `${baseUrl}${file}`
    );
  }

  const results =
    await Promise.all(
      discovered.map(async url => ({
        url,
        ok: await streamExists(url)
      }))
    );

  const working =
    results.find(result => result.ok);

  return working ? working.url : null;
}


// ============================================================
// PROBE VIDEO QUALITIES
// ============================================================

async function probeQualities(baseUrl, knownVideos = []) {

  if (!baseUrl) {
    return [];
  }

  const candidates = [];

  // First use explicitly known filenames.
  for (const file of knownVideos) {

    const quality =
      QUALITY_DEFINITIONS.find(def =>
        def.patterns.includes(file)
      );

    if (quality) {

      candidates.push({
        label: quality.label,
        file,
        url: `${baseUrl}${file}`
      });
    }
  }


  // Then automatically try every known MX naming pattern.
  for (const definition of QUALITY_DEFINITIONS) {

    for (const file of definition.patterns) {

      candidates.push({
        label: definition.label,
        file,
        url: `${baseUrl}${file}`
      });
    }
  }


  const uniqueCandidates =
    uniqueBy(
      candidates,
      item => item.url
    );


  const results =
    await Promise.all(
      uniqueCandidates.map(async item => ({
        ...item,
        ok: await streamExists(item.url)
      }))
    );


  const working =
    results.filter(item => item.ok);


  // One quality may have multiple bitrate filenames.
  // Keep only one working URL per quality.
  const bestPerQuality = {};

  for (const item of working) {

    if (!bestPerQuality[item.label]) {
      bestPerQuality[item.label] = item;
    }
  }


  return Object.values(bestPerQuality)
    .sort(
      (a, b) =>
        qualityRank(b.label) -
        qualityRank(a.label)
    );
}


// ============================================================
// BUILD HLS MASTER WITH AUDIO
// ============================================================

function makeMasterPlaylist(videoUrl, audioUrl) {

  const audioLine =
    audioUrl
      ? `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="MX Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${audioUrl}"`
      : null;


  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:3"
  ];


  if (audioLine) {
    lines.push(audioLine);
  }


  lines.push(
    `#EXT-X-STREAM-INF:BANDWIDTH=${qualityBandwidth(
      "High"
    )},CODECS="avc1.640028,mp4a.40.2"${audioUrl ? ',AUDIO="audio"' : ""}`,
    videoUrl
  );


  return lines.join("\n") + "\n";
}


// ============================================================
// RESOLVE DIRECT MX HLS
// ============================================================

async function buildQualityStreams({
  hls,
  knownVideos = [],
  title = "MX Player"
}) {

  if (!hls) {
    return [];
  }


  const baseUrl = getHlsBase(hls);

  if (!baseUrl) {
    return [];
  }


  const [qualities, audio] =
    await Promise.all([
      probeQualities(
        baseUrl,
        knownVideos
      ),
      findAudio(baseUrl)
    ]);


  const streams = [];


  for (const quality of qualities) {

    const masterUrl =
      `${ADDON_BASE}/hls/master` +
      `?video=${encodeURIComponent(quality.url)}` +
      `&audio=${encodeURIComponent(audio || "")}` +
      `&label=${encodeURIComponent(quality.label)}`;


    streams.push({

      name: `MX Player ${quality.label}`,

      title:
        `MX Player • ${quality.label}` +
        `${audio ? " • Audio" : ""}`,

      url: masterUrl,

      behaviorHints: {

        notWebReady: true,

        bingeGroup:
          `mxplayer-${quality.label}`

      }

    });
  }


  return streams;
}


// ============================================================
// GET EPISODES FROM MX PLAYER
// ============================================================

async function getSeasonEpisodes(seasonId) {

  const response =
    await mxRequest(
      "/detail/tab/tvshowepisodes",
      {
        type: "season",
        id: seasonId,
        sortOrder: "0"
      }
    );


  let payload =
    response &&
    response.data !== undefined
      ? response.data
      : response;


  if (
    payload &&
    !Array.isArray(payload) &&
    Array.isArray(payload.items)
  ) {
    payload = payload.items;
  }


  if (!Array.isArray(payload)) {
    return [];
  }


  return payload;
}


// ============================================================
// FIND USER-REQUESTED EPISODE
// ============================================================

async function resolveRequestedEpisode(videoId) {

  const override =
    EPISODE_TITLE_OVERRIDES[videoId];

  if (!override) {
    return null;
  }


  // We know this is Yeh Meri Family S2.
  const seasonId =
    "1a8452f31b2fcff5e495b44afdb3fbdb";


  const episodes =
    await getSeasonEpisodes(seasonId);


  const wanted =
    override.toLowerCase().trim();


  // First try exact title.
  let episode =
    episodes.find(ep =>
      String(ep.title || "")
        .toLowerCase()
        .trim() === wanted
    );


  // Then substring match.
  if (!episode) {

    episode =
      episodes.find(ep =>
        String(ep.title || "")
          .toLowerCase()
          .includes(wanted)
      );
  }


  if (!episode) {
    return null;
  }


  return {

    id: episode.id,

    title: episode.title,

    episodeNo:
      episode.episodeNo ||
      episode.episode_number,

    webUrl: episode.webUrl,

    duration: episode.duration,

    stream: episode.stream || null

  };
}


// ============================================================
// RESOLVE EPISODE DETAIL
// ============================================================

async function getEpisodeDetail(id) {

  return await mxRequest(
    "/detail/video",
    {
      type: "episode",
      id
    }
  );
}


// ============================================================
// GENERIC MOVIE DETAIL
// ============================================================

async function getMovieDetail(id) {

  return await mxRequest(
    "/detail/video",
    {
      type: "movie",
      id
    }
  );
}


// ============================================================
// EXTRACT HLS FROM MX STREAM OBJECT
// ============================================================

function extractHls(stream) {

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
    (mxplay.hls && mxplay.hls.high) ||
    null
  );
}


// ============================================================
// MOVIE CATALOG
// ============================================================

let movieCatalogCache = null;
let movieCatalogCacheTime = 0;

const MOVIE_CACHE_TIME =
  10 * 60 * 1000;


function imageFromItem(item) {

  const images =
    item.imageInfo || [];


  for (const image of images) {

    if (
      image &&
      image.type === "portrait" &&
      image.url
    ) {
      return image.url.startsWith("http")
        ? image.url
        : `https://isa-1.mxplay.com/${image.url}`;
    }
  }


  for (const image of images) {

    if (image && image.url) {

      return image.url.startsWith("http")
        ? image.url
        : `https://isa-1.mxplay.com/${image.url}`;
    }
  }


  return undefined;
}


function movieToMeta(item) {

  return {

    id: `mx:${item.id}`,

    type: "movie",

    name:
      item.title ||
      item.display_title ||
      "MX Player Movie",

    poster:
      imageFromItem(item),

    posterShape: "poster",

    description:
      item.description || undefined,

    releaseInfo:
      item.releaseDate
        ? String(item.releaseDate).slice(0, 4)
        : undefined,

    genres:
      Array.isArray(item.genres)
        ? item.genres.map(g =>
            typeof g === "string"
              ? g
              : g.name
          ).filter(Boolean)
        : undefined

  };
}


function collectMovies(value, output) {

  if (!value) {
    return;
  }


  if (Array.isArray(value)) {

    for (const item of value) {
      collectMovies(item, output);
    }

    return;
  }


  if (
    typeof value !== "object"
  ) {
    return;
  }


  if (
    value.type === "movie" &&
    value.id
  ) {

    output.push(value);
  }


  for (
    const child of Object.values(value)
  ) {

    if (
      child &&
      typeof child === "object"
    ) {

      collectMovies(
        child,
        output
      );
    }
  }
}


async function getMovieCatalog(search = "") {

  const now = Date.now();


  if (
    !search &&
    movieCatalogCache &&
    now - movieCatalogCacheTime <
      MOVIE_CACHE_TIME
  ) {

    return movieCatalogCache;
  }


  let source;


  if (search) {

    // MX Player search endpoint.
    const url =
      new URL(
        `${MX_API}/search/resultv2`
      );


    const params = {
      "device-density": "2",
      platform: "com.mxplay.desktop",
      "content-languages": "hi,en",
      "kids-mode-enabled": "false",
      userid: MX_USER_ID,
      query: search
    };


    for (
      const [key, value]
      of Object.entries(params)
    ) {

      url.searchParams.set(
        key,
        value
      );
    }


    const response =
      await fetch(
        url,
        {
          method: "POST",
          headers: {
            ...MX_HEADERS,
            "Content-Type":
              "application/json"
          }
        }
      );


    if (!response.ok) {
      return [];
    }


    source =
      await response.json();

  } else {

    // MX Player home/browse.
    source =
      await mxRequest(
        "/home/tab/87c3ddc974dcf12294e9412bec44b097",
        {
          pageSize: "50"
        }
      );
  }


  const movies = [];


  collectMovies(
    source,
    movies
  );


  const unique =
    uniqueBy(
      movies,
      movie => movie.id
    );


  const metas =
    unique.map(movieToMeta);


  if (!search) {

    movieCatalogCache =
      metas;

    movieCatalogCacheTime =
      Date.now();
  }


  return metas;
}


// ============================================================
// MANIFEST
// ============================================================

const manifest = {

  id: "com.minecraft.mxplayer",

  version: VERSION,

  name: "MX Player Free",

  description:
    "Free MX Player India streams with quality selection and audio.",


  resources: [

    {
      name: "catalog",
      types: ["movie"]
    },

    {
      name: "meta",
      types: ["movie"],
      idPrefixes: ["mx:"]
    },

    {
      name: "stream",
      types: ["series"],
      idPrefixes: ["tt"]
    },

    {
      name: "stream",
      types: ["movie"],
      idPrefixes: ["mx:", "tt"]
    }

  ],


  types: [
    "movie",
    "series"
  ],


  catalogs: [

    {
      type: "movie",

      id: "mxmovies",

      name:
        "MX Player Free Movies",

      extra: [

        {
          name: "search",
          isRequired: false
        },

        {
          name: "skip",
          isRequired: false
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

    res.header(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.header(
      "Access-Control-Allow-Headers",
      "*"
    );

    res.header(
      "Access-Control-Allow-Methods",
      "GET, OPTIONS"
    );

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  }
);


// ============================================================
// ROOT
// ============================================================

app.get("/", (req, res) => {

  res.json({
    addon: "MX Player Free",
    version: VERSION,
    status: "ok"
  });

});


// ============================================================
// HEALTH
// ============================================================

app.get("/health", (req, res) => {

  res.json({

    status: "ok",

    version: VERSION,

    addon:
      "MX Player Free",

    features: [

      "MX Player episode resolver",

      "multiple qualities",

      "audio",

      "MX Player free movie catalog"

    ]

  });

});


// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (req, res) => {

    res.json(manifest);

  }
);


// ============================================================
// CATALOG
// ============================================================

app.get(
  "/catalog/:type/:id.json",
  async (req, res) => {

    try {

      const {
        type,
        id
      } = req.params;


      if (
        type !== "movie" ||
        id !== "mxmovies"
      ) {

        return res.json({
          metas: []
        });
      }


      const search =
        req.query.search ||
        "";


      let metas =
        await getMovieCatalog(
          search
        );


      const skip =
        Number(
          req.query.skip || 0
        );


      metas =
        metas.slice(
          skip,
          skip + 100
        );


      res.json({
        metas
      });


    } catch (error) {

      console.error(
        "Catalog error:",
        error
      );

      res.json({
        metas: []
      });

    }

  }
);


// ============================================================
// META FOR MX MOVIES
// ============================================================

app.get(
  "/meta/movie/:id.json",
  async (req, res) => {

    try {

      let id =
        req.params.id;


      if (id.startsWith("mx:")) {
        id = id.substring(3);
      }


      const detail =
        await getMovieDetail(id);


      if (
        !detail ||
        !detail.id
      ) {

        return res.json({
          meta: null
        });
      }


      const imageInfo =
        detail.imageInfo || [];


      let poster;


      for (
        const image
        of imageInfo
      ) {

        if (
          image &&
          image.type === "portrait" &&
          image.url
        ) {

          poster =
            image.url.startsWith("http")
              ? image.url
              : `https://isa-1.mxplay.com/${image.url}`;

          break;
        }
      }


      if (!poster && imageInfo[0]) {

        poster =
          imageInfo[0].url;

        if (
          poster &&
          !poster.startsWith("http")
        ) {

          poster =
            `https://isa-1.mxplay.com/${poster}`;
        }
      }


      res.json({

        meta: {

          id: `mx:${id}`,

          type: "movie",

          name:
            detail.title ||
            "MX Player Movie",

          poster,

          posterShape:
            "poster",

          description:
            detail.description,

          releaseInfo:
            detail.releaseDate
              ? String(
                  detail.releaseDate
                ).slice(0, 4)
              : undefined,

          genres:
            Array.isArray(
              detail.genres
            )
              ? detail.genres
                  .map(g =>
                    typeof g === "string"
                      ? g
                      : g.name
                  )
                  .filter(Boolean)
              : undefined

        }

      });


    } catch (error) {

      console.error(
        "Meta error:",
        error
      );

      res.json({
        meta: null
      });

    }

  }
);


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
        .send("Missing video");

    }


    const label =
      req.query.label ||
      "High";


    const audioUrl =
      audio || null;


    const lines = [

      "#EXTM3U",

      "#EXT-X-VERSION:3"

    ];


    if (audioUrl) {

      lines.push(
        `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="audio",NAME="MX Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${audioUrl}"`
      );

    }


    const bandwidth =
      qualityBandwidth(
        label
      );


    const audioAttribute =
      audioUrl
        ? ',AUDIO="audio"'
        : "";


    lines.push(

      `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},CODECS="avc1.640028,mp4a.40.2"${audioAttribute}`,

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
      lines.join("\n") +
      "\n"
    );

  }
);


// ============================================================
// STREAM RESOLVER
// ============================================================

app.get(
  "/stream/:type/:videoId.json",
  async (req, res) => {

    const {
      type,
      videoId
    } = req.params;


    console.log(
      `STREAM ${type} ${videoId}`
    );


    try {

      // --------------------------------------------------------
      // MOVIE: mx:<id>
      // --------------------------------------------------------

      if (
        type === "movie" &&
        videoId.startsWith("mx:")
      ) {

        const movieId =
          videoId.substring(3);


        const detail =
          await getMovieDetail(
            movieId
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
          await buildQualityStreams({
            hls,
            title:
              detail.title ||
              "MX Player Movie"
          });


        return res.json({
          streams
        });

      }


      // --------------------------------------------------------
      // SERIES: KNOWN WORKING EPISODES
      // --------------------------------------------------------

      const known =
        KNOWN_EPISODES[
          videoId
        ];


      if (known) {

        const base =
          `${CDN_BASE}/video/${known.hash}/3/hls/`;


        const audio =
          await findAudio(base);


        const qualities =
          await probeQualities(
            base,
            known.knownVideos
          );


        const streams = [];


        for (
          const quality
          of qualities
        ) {

          const masterUrl =
            `${ADDON_BASE}/hls/master` +
            `?video=${encodeURIComponent(quality.url)}` +
            `&audio=${encodeURIComponent(audio || "")}` +
            `&label=${encodeURIComponent(quality.label)}`;


          streams.push({

            name:
              `MX Player ${quality.label}`,

            title:
              `MX Player • ${quality.label}` +
              `${audio ? " • Audio" : ""}`,

            url:
              masterUrl,

            behaviorHints: {

              notWebReady: true,

              bingeGroup:
                `mxplayer-${quality.label}`

            }

          });

        }


        return res.json({
          streams
        });

      }


      // --------------------------------------------------------
      // REQUESTED E3/E4/E5
      // --------------------------------------------------------

      const requested =
        await resolveRequestedEpisode(
          videoId
        );


      if (!requested) {

        return res.json({
          streams: []
        });
      }


      const detail =
        await getEpisodeDetail(
          requested.id
        );


      if (
        !detail ||
        detail.statusCode &&
        detail.statusCode !== 1001
      ) {

        return res.json({
          streams: []
        });
      }


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
        await buildQualityStreams({
          hls,
          title:
            requested.title
        });


      return res.json({
        streams
      });


    } catch (error) {

      console.error(
        "Stream resolver error:",
        error
      );


      return res.json({
        streams: []
      });

    }

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
      `MX Player addon ${VERSION} listening on ${HOST}:${PORT}`
    );

  }
);
