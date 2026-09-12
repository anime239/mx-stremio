const express = require("express");

const app = express();

const PORT = process.env.PORT || 3000;
const HOST = "0.0.0.0";

const ADDON_URL =
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

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


// ============================================================
// KNOWN EPISODES
// ============================================================
//
// These are ONLY identifiers/page URLs.
// We do NOT hardcode quality/bitrate filenames.
//
// ============================================================

const KNOWN_EPISODES = {

  "tt8595766:2:1": {
    title: "Apna Kamra",
    page:
      "https://www.mxplayer.in/show/watch-yeh-meri-family/season-2/apna-kamra-online-a2c9ed2742914673e2f83d8ec6b863b8"
  },

  "tt8595766:2:2": {
    title: "Cable TV",
    page:
      "https://www.mxplayer.in/show/watch-yeh-meri-family/season-2/cable-tv-online-43d578b732c89e2491888b739c46d881"
  }

};


// ============================================================
// HTTP
// ============================================================

async function requestText(url) {

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/148 Mobile Safari/537.36",
      "Accept":
        "text/html,application/xhtml+xml,application/json,*/*"
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return await response.text();
}


async function requestJson(url, options = {}) {

  const response = await fetch(url, {
    ...options,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/148 Mobile Safari/537.36",
      "Accept":
        "application/json,text/plain,*/*",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${url}`
    );
  }

  return await response.json();
}


// ============================================================
// MX USER ID
// ============================================================

function userId() {

  return (
    "stremio-" +
    Math.random()
      .toString(36)
      .slice(2) +
    Date.now().toString(36)
  );

}


// ============================================================
// MX PARAMETERS
// ============================================================

function mxParams(extra = {}) {

  return new URLSearchParams({

    "device-density": "2",

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
// RECURSIVELY COLLECT STRINGS
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
// NORMALIZE URL
// ============================================================

function normalizeUrl(value) {

  if (!value) {
    return null;
  }

  let url = value;

  // JSON escaped
  url = url
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");

  // HTML encoded quotes are irrelevant here
  url = url.trim();

  // Remove surrounding quotes
  url = url.replace(/^["']|["']$/g, "");

  if (!url.startsWith("http")) {
    return null;
  }

  return url;
}


// ============================================================
// EXTRACT M3U8 URLS FROM ARBITRARY TEXT
// ============================================================

function extractM3U8FromText(text) {

  if (!text) {
    return [];
  }

  const results = [];

  // Absolute URLs
  const absolute =
    /https?:\/\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi;

  let match;

  while ((match = absolute.exec(text)) !== null) {

    const url =
      normalizeUrl(match[0]);

    if (url) {
      results.push(url);
    }

  }


  // URLs embedded with escaped slashes
  const escaped =
    /https?:\\\/\\\/[^"'<>\\\s]+?\.m3u8(?:\?[^"'<>\\\s]*)?/gi;

  while ((match = escaped.exec(text)) !== null) {

    const url =
      normalizeUrl(match[0]);

    if (url) {
      results.push(url);
    }

  }


  return [
    ...new Set(results)
  ];

}


// ============================================================
// EXTRACT M3U8 URLS FROM OBJECT
// ============================================================

function extractM3U8FromObject(value) {

  const strings =
    collectStrings(value);

  const results = [];

  for (const string of strings) {

    results.push(
      ...extractM3U8FromText(string)
    );

  }

  return [
    ...new Set(results)
  ];

}


// ============================================================
// QUALITY
// ============================================================

function quality(url) {

  const name =
    decodeURIComponent(url)
      .toLowerCase();


  // 1080
  if (
    /(?:^|[_-])1080(?:[_-]|p|\.|$)/.test(name)
  ) {
    return 1080;
  }


  // 720
  if (
    /(?:^|[_-])720(?:[_-]|p|\.|$)/.test(name)
  ) {
    return 720;
  }


  // 480
  if (
    /(?:^|[_-])480(?:[_-]|p|\.|$)/.test(name)
  ) {
    return 480;
  }


  // 360
  if (
    /(?:^|[_-])360(?:[_-]|p|\.|$)/.test(name)
  ) {
    return 360;
  }


  // 240
  if (
    /(?:^|[_-])240(?:[_-]|p|\.|$)/.test(name)
  ) {
    return 240;
  }


  // 180
  if (
    /(?:^|[_-])180(?:[_-]|p|\.|$)/.test(name)
  ) {
    return 180;
  }


  // Generic h264_high
  if (
    /\/h264_high\.m3u8(?:\?|$)/.test(name)
  ) {
    return 999;
  }


  return 0;
}


// ============================================================
// QUALITY LABEL
// ============================================================

function qualityLabel(url) {

  const q =
    quality(url);

  if (q === 999) {
    return "High";
  }

  if (q > 0) {
    return `${q}p`;
  }

  return "MX";
}


// ============================================================
// IS VIDEO PLAYLIST
// ============================================================

function isVideoPlaylist(url) {

  const lower =
    url.toLowerCase();

  if (!lower.includes(".m3u8")) {
    return false;
  }

  if (
    lower.includes("/audio") ||
    lower.includes("audio_")
  ) {
    return false;
  }

  if (
    lower.includes("/subtitle") ||
    lower.includes("subtitle_")
  ) {
    return false;
  }

  return true;
}


// ============================================================
// IS AUDIO PLAYLIST
// ============================================================

function isAudioPlaylist(url) {

  const lower =
    url.toLowerCase();

  return (
    lower.includes(".m3u8") &&
    (
      lower.includes("/audio") ||
      lower.includes("audio_")
    )
  );

}


// ============================================================
// IS SUBTITLE PLAYLIST
// ============================================================

function isSubtitlePlaylist(url) {

  const lower =
    url.toLowerCase();

  return (
    lower.includes(".m3u8") &&
    (
      lower.includes("/subtitle") ||
      lower.includes("subtitle_")
    )
  );

}


// ============================================================
// FETCH MX PAGE
// ============================================================

async function getPageData(pageUrl) {

  console.log(
    "Fetching MX page:",
    pageUrl
  );

  const html =
    await requestText(pageUrl);


  const urls =
    extractM3U8FromText(html);


  console.log(
    "M3U8 URLs found in page:",
    urls
  );


  return {
    html,
    urls
  };

}


// ============================================================
// TRY MX SEO / DETAIL
// ============================================================

async function getMXApiData(pageUrl) {

  const results = [];


  // Try extracting an ID from the page URL.
  const match =
    pageUrl.match(
      /online-([a-f0-9]{32})/i
    );


  if (match) {

    const id =
      match[1];


    try {

      const url =
        `${MX_API}/detail/video?` +
        mxParams({
          id
        }).toString();


      const data =
        await requestJson(url);


      results.push(data);

    } catch (error) {

      console.log(
        "MX detail failed:",
        error.message
      );

    }

  }


  return results;

}


// ============================================================
// DISCOVER ACTUAL STREAM URLS
// ============================================================

async function discoverStreams(pageUrl) {

  const allUrls = [];


  // ----------------------------------------------------------
  // 1. Actual page
  // ----------------------------------------------------------

  try {

    const page =
      await getPageData(pageUrl);

    allUrls.push(
      ...page.urls
    );

  } catch (error) {

    console.log(
      "Page extraction failed:",
      error.message
    );

  }


  // ----------------------------------------------------------
  // 2. MX API
  // ----------------------------------------------------------

  try {

    const apiResults =
      await getMXApiData(pageUrl);


    for (const data of apiResults) {

      allUrls.push(
        ...extractM3U8FromObject(data)
      );

    }

  } catch (error) {

    console.log(
      "API extraction failed:",
      error.message
    );

  }


  // ----------------------------------------------------------
  // Unique
  // ----------------------------------------------------------

  const unique =
    [
      ...new Set(
        allUrls
          .map(normalizeUrl)
          .filter(Boolean)
      )
    ];


  // ----------------------------------------------------------
  // Video
  // ----------------------------------------------------------

  const video =
    unique
      .filter(isVideoPlaylist)
      .sort(
        (a, b) =>
          quality(b) -
          quality(a)
      );


  // ----------------------------------------------------------
  // Audio
  // ----------------------------------------------------------

  const audio =
    unique.find(
      isAudioPlaylist
    ) || null;


  // ----------------------------------------------------------
  // Subtitle
  // ----------------------------------------------------------

  const subtitle =
    unique.find(
      isSubtitlePlaylist
    ) || null;


  console.log(
    "DISCOVERED VIDEO:",
    video
  );

  console.log(
    "DISCOVERED AUDIO:",
    audio
  );

  console.log(
    "DISCOVERED SUBTITLE:",
    subtitle
  );


  return {
    video,
    audio,
    subtitle,
    all: unique
  };

}


// ============================================================
// RESOLVE EPISODE
// ============================================================

async function resolveEpisode(videoId) {

  const known =
    KNOWN_EPISODES[videoId];


  if (!known) {

    return null;

  }


  const streams =
    await discoverStreams(
      known.page
    );


  return {

    title:
      known.title,

    page:
      known.page,

    ...streams

  };

}


// ============================================================
// OUR COMBINED HLS MASTER
// ============================================================
//
// One quality is passed to this endpoint.
// The endpoint creates a master playlist pairing
// that video playlist with MX's audio playlist.
//
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
        .type("text/plain")
        .send(
          "Missing video parameter"
        );

    }


    let playlist =
`#EXTM3U
#EXT-X-VERSION:3
`;


    if (audio) {

      playlist +=
`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="mx-audio",NAME="MX Player Audio",DEFAULT=YES,AUTOSELECT=YES,URI="${audio}"
`;

    }


    const q =
      quality(video);


    let bandwidth =
      800000;


    if (q === 1080) {
      bandwidth = 5800000;
    } else if (q === 720) {
      bandwidth = 3000000;
    } else if (q === 480) {
      bandwidth = 1750000;
    } else if (q === 360) {
      bandwidth = 750000;
    } else if (q === 240) {
      bandwidth = 400000;
    } else if (q === 180) {
      bandwidth = 235000;
    }


    playlist +=
`#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth}${audio ? ',AUDIO="mx-audio"' : ""}
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
        "10.0.0",

      name:
        "MX Player Resolver",

      description:
        "MX Player HLS resolver with automatically discovered quality streams.",

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
      "===================================="
    );

    console.log(
      "STREAM REQUEST:",
      type,
      videoId
    );

    console.log(
      "===================================="
    );


    try {

      const resolved =
        await resolveEpisode(
          videoId
        );


      if (!resolved) {

        console.log(
          "No known MX page for:",
          videoId
        );


        return res.json({
          streams: []
        });

      }


      const streams = [];


      // ------------------------------------------------------
      // Every REAL MX video playlist becomes one Stremio item
      // ------------------------------------------------------

      for (
        const videoUrl
        of resolved.video
      ) {

        const label =
          qualityLabel(
            videoUrl
          );


        const master =
          ADDON_URL +
          "/hls/master?video=" +
          encodeURIComponent(
            videoUrl
          ) +
          "&audio=" +
          encodeURIComponent(
            resolved.audio || ""
          );


        streams.push({

          name:
            `MX Player ${label}`,

          title:
            resolved.audio
              ? `MX Player • ${label} • Audio`
              : `MX Player • ${label}`,

          url:
            master,

          behaviorHints: {

            notWebReady:
              true,

            bingeGroup:
              `mxplayer-${label}`

          }

        });

      }


      console.log(
        "RETURNING STREAM COUNT:",
        streams.length
      );


      res.json({

        streams

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
  "/debug/discover/:videoId",
  async (req, res) => {

    const videoId =
      decodeURIComponent(
        req.params.videoId
      );


    try {

      const result =
        await resolveEpisode(
          videoId
        );


      if (!result) {

        return res.json({

          success:
            false,

          error:
            "Episode is not mapped yet",

          videoId

        });

      }


      res.json({

        success:
          true,

        videoId,

        title:
          result.title,

        page:
          result.page,

        video:
          result.video,

        audio:
          result.audio,

        subtitle:
          result.subtitle,

        all:
          result.all

      });


    } catch (error) {

      res.status(500).json({

        success:
          false,

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
      `MX Player Resolver v10 running on ${HOST}:${PORT}`
    );

  }
);
