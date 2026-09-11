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
// MX PLAYER EPISODE API
// --------------------------------------------------

async function getMxEpisode(episodeId) {

  // Generate a fresh UUID for this request
  const userId = crypto.randomUUID();

  const params = new URLSearchParams({
    type: "episode",
    id: episodeId,
    platform: "com.mxplay.desktop",
    "device-density": "2",
    userid: userId,
    "content-languages":
      "hi,mr,pa,bn,en,ml,kn,gu,te,ta"
  });

  const apiUrl =
    `https://api.mxplayer.in/v1/web/detail/video?${params}`;

  console.log("MX API request:");
  console.log(apiUrl);

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140 Safari/537.36",

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
    "MX HTTP status:",
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
      "MX API did not return valid JSON"
    );
  }

  console.log(
    "MX API response received"
  );

  // ------------------------------------------------
  // Look for HLS
  // ------------------------------------------------

  const hls =
    data?.stream?.hls?.high ||
    data?.stream?.hls?.medium ||
    data?.stream?.hls?.low;

  if (!hls) {

    console.log(
      "No HLS found."
    );

    console.log(
      JSON.stringify(data)
    );

    throw new Error(
      "MX API returned no HLS stream"
    );
  }

  return {
    title:
      data.title ||
      "MX Player",

    thumbnail:
      data?.imageInfo?.[1]?.url ||
      data?.imageInfo?.[0]?.url ||
      null,

    url: hls
  };
}

// --------------------------------------------------
// TEST STREAM ENDPOINT
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
              bingeGroup: "mxplayer"
            }
          }
        ]
      });

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error
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
// START
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
