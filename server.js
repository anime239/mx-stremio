const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 7000;

// ==================================================
// STREMIO MANIFEST
// ==================================================

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

// ==================================================
// MX PLAYER API REQUEST
// ==================================================

async function requestMxEpisode() {
  const userId = crypto.randomUUID();

  const params = new URLSearchParams({
    type: "episode",
    id: "a2c9ed2742914673e2f83d8ec6b863b8",
    "device-density": "2",
    platform: "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: userId
  });

  const url =
    `https://api.mxplayer.in/v1/web/detail/video?${params}`;

  console.log("=================================");
  console.log("MX API URL");
  console.log(url);
  console.log("=================================");

  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
        "AppleWebKit/537.36 (KHTML, like Gecko) " +
        "Chrome/140.0.0.0 Safari/537.36",

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

  return data;
}

// ==================================================
// DEBUG MX RESPONSE
// ==================================================

app.get("/debug-mx", async (req, res) => {
  try {
    const data = await requestMxEpisode();

    const stream =
      data.stream || null;

    const dataStream =
      data.data?.stream || null;

    res.json({
      success: true,

      topLevelKeys:
        Object.keys(data),

      dataKeys:
        data.data &&
        typeof data.data === "object"
          ? Object.keys(data.data)
          : null,

      title:
        data.title ||
        data.data?.title ||
        null,

      streamExists:
        !!stream,

      streamKeys:
        stream &&
        typeof stream === "object"
          ? Object.keys(stream)
          : null,

      dataStreamExists:
        !!dataStream,

      dataStreamKeys:
        dataStream &&
        typeof dataStream === "object"
          ? Object.keys(dataStream)
          : null,

      streamHls:
        stream?.hls || null,

      dataStreamHls:
        dataStream?.hls || null,

      streamThirdParty:
        stream?.thirdParty || null,

      dataStreamThirdParty:
        dataStream?.thirdParty || null,

      streamMxplay:
        stream?.mxplay || null,

      dataStreamMxplay:
        dataStream?.mxplay || null
    });

  } catch (error) {

    console.error(
      "DEBUG ERROR:",
      error
    );

    res.json({
      success: false,
      error: error.message
    });
  }
});

// ==================================================
// FIND HLS
// ==================================================

function findHls(data) {

  const possibleStreams = [
    data?.stream,
    data?.data?.stream,
    data?.video?.stream,
    data?.data?.video?.stream
  ];

  for (const stream of possibleStreams) {

    if (!stream) {
      continue;
    }

    const hls =
      stream?.hls?.high ||
      stream?.hls?.medium ||
      stream?.hls?.low ||
      stream?.hls?.base ||
      stream?.hls?.main ||
      stream?.thirdParty?.hlsUrl ||
      stream?.thirdParty?.hls ||
      stream?.altBalaji?.hlsUrl ||
      stream?.mxplay?.hls?.high;

    if (hls) {
      return hls;
    }
  }

  return null;
}

// ==================================================
// STREMIO STREAM ENDPOINT
// ==================================================

app.get(
  "/stream/:type/:id.json",
  async (req, res) => {

    try {

      console.log(
        "================================="
      );

      console.log(
        "STREMIO REQUEST"
      );

      console.log(
        req.params
      );

      // Known MX Player episode ID
      const episodeId =
        "a2c9ed2742914673e2f83d8ec6b863b8";

      const data =
        await requestMxEpisode();

      const hls =
        findHls(data);

      if (!hls) {

        console.log(
          "NO HLS FOUND"
        );

        console.log(
          JSON.stringify(data)
        );

        throw new Error(
          "MX API returned no HLS stream"
        );
      }

      console.log(
        "HLS FOUND:"
      );

      console.log(hls);

      // ------------------------------------------------
      // Return stream to Stremio
      // ------------------------------------------------

      res.json({
        streams: [
          {
            name: "MX Player",

            title:
              data.title ||
              data.data?.title ||
              "MX Player",

            url: hls,

            behaviorHints: {
              bingeGroup: "mxplayer"
            }
          }
        ]
      });

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error.message
      );

      res.json({
        streams: [],
        error: error.message
      });
    }
  }
);

// ==================================================
// ROOT
// ==================================================

app.get("/", (req, res) => {
  res.send(
    "MX Test Video Stremio Addon is running."
  );
});

// ==================================================
// START SERVER
// ==================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Addon running on port ${PORT}`
    );
  }
);
