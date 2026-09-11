const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 7000;

// --------------------------------------------------
// STREMIO MANIFEST
// --------------------------------------------------

const manifest = {
  id: "com.my.stremio.video",
  version: "1.0.0",
  name: "MX Test Video",
  description: "MX Player test addon",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// --------------------------------------------------
// FIND MX HLS STREAM
// --------------------------------------------------

function findHls(stream) {
  if (!stream || typeof stream !== "object") {
    return null;
  }

  const hlsData = stream.hls || {};
  const thirdParty = stream.thirdParty || {};
  const altBalaji = stream.altBalaji || {};
  const mxplay = stream.mxplay || {};
  const mxplayHls = mxplay.hls || {};

  let hls =
    hlsData.high ||
    hlsData.base ||
    hlsData.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    mxplayHls.high;

  if (!hls) {
    return null;
  }

  // MX sometimes returns a relative CloudFront path
  if (!hls.startsWith("http")) {
    hls =
      `https://d3sgzbosmwirao.cloudfront.net/${hls}`;
  }

  return hls;
}

// --------------------------------------------------
// MX PLAYER DETAIL API
// --------------------------------------------------

async function getMxEpisode(episodeId) {

  // Keep one anonymous UUID for this request
  const userId = crypto.randomUUID();

  const params = new URLSearchParams({
    type: "episode",
    id: episodeId,

    "device-density": "2",

    platform: "com.mxplay.desktop",

    "content-languages": "hi,en",

    "kids-mode-enabled": "false",

    userid: userId
  });

  const apiUrl =
    `https://api.mxplayer.in/v1/web/detail/video?${params}`;

  console.log("=================================");
  console.log("MX API REQUEST");
  console.log(apiUrl);
  console.log("=================================");

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/125.0.0.0 Safari/537.36",

      "Accept":
        "application/json, text/plain, */*",

      "Referer":
        "https://www.mxplayer.in/",

      "Origin":
        "https://www.mxplayer.in"
    }
  });

  const text = await response.text();

  console.log(
    "MX HTTP STATUS:",
    response.status
  );

  if (!response.ok) {
    throw new Error(
      `MX API returned HTTP ${response.status}: ${text.substring(0, 500)}`
    );
  }

  let data;

  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(
      "MX API returned invalid JSON"
    );
  }

  console.log(
    "MX title:",
    data.title || "unknown"
  );

  // ------------------------------------------------
  // STREAM OBJECT
  // ------------------------------------------------

  const stream =
    data.stream ||
    data.data?.stream ||
    {};

  console.log(
    "Stream object found:",
    !!data.stream
  );

  console.log(
    "Stream keys:",
    Object.keys(stream)
  );

  if (stream.hls) {
    console.log(
      "HLS keys:",
      Object.keys(stream.hls)
    );
  }

  if (stream.thirdParty) {
    console.log(
      "thirdParty keys:",
      Object.keys(stream.thirdParty)
    );
  }

  if (stream.mxplay) {
    console.log(
      "mxplay keys:",
      Object.keys(stream.mxplay)
    );
  }

  // ------------------------------------------------
  // FIND HLS
  // ------------------------------------------------

  const hls = findHls(stream);

  if (!hls) {

    const drmProtect =
      stream.drmProtect;

    console.log(
      "DRM protected:",
      drmProtect
    );

    throw new Error(
      `MX API returned no HLS stream` +
      (drmProtect
        ? " (stream is marked DRM protected)"
        : "")
    );
  }

  console.log(
    "HLS FOUND:",
    hls
  );

  return {
    title:
      data.title ||
      "MX Player",

    description:
      data.description ||
      "",

    thumbnail:
      data.imageInfo?.find(
        x => x?.type === "landscape"
      )?.url ||
      data.imageInfo?.[0]?.url ||
      null,

    url: hls
  };
}

// --------------------------------------------------
// STREMIO STREAM ENDPOINT
// --------------------------------------------------

app.get(
  "/stream/:type/:id.json",
  async (req, res) => {

    try {

      console.log(
        "Stremio request:",
        req.params
      );

      // Known MX Player episode:
      //
      // Yeh Meri Family
      // Season 2
      // Episode 1
      // Apna Kamra

      const episodeId =
        "a2c9ed2742914673e2f83d8ec6b863b8";

      const video =
        await getMxEpisode(episodeId);

      res.json({
        streams: [
          {
            name: "MX Player",

            title:
              video.title,

            url:
              video.url,

            thumbnail:
              video.thumbnail || undefined,

            behaviorHints: {
              bingeGroup:
                "mxplayer"
            }
          }
        ]
      });

    } catch (error) {

      console.error(
        "================================="
      );

      console.error(
        "STREAM ERROR:",
        error.message
      );

      console.error(
        "================================="
      );

      res.json({
        streams: [],
        error: error.message
      });
    }
  }
);

// --------------------------------------------------
// ROOT
// --------------------------------------------------

app.get("/", (req, res) => {
  res.send(
    "MX Test Video Stremio Addon is running."
  );
});

// --------------------------------------------------
// START SERVER
// --------------------------------------------------

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Addon running on port ${PORT}`
    );
  }
);
