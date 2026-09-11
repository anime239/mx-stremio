const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

// --------------------------------------------------
// STREMIO MANIFEST
// --------------------------------------------------

const manifest = {
  id: "com.my.stremio.video",
  version: "1.0.0",
  name: "MX Test Video",
  description: "Educational MX Player Stremio addon",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// --------------------------------------------------
// MX PLAYER API
// --------------------------------------------------

async function getMxEpisode(episodeId) {

  const params = new URLSearchParams({
    type: "episode",
    id: episodeId,
    platform: "com.mxplay.desktop",
    "device-density": "2",
    userid: "30bb09af-733a-413b-b8b7-b10348ec2b3d",
    "content-languages":
      "hi,mr,pa,bn,en,ml,kn,gu,te,ta"
  });

  const apiUrl =
    `https://api.mxplay.com/v1/web/detail/video?${params}`;

  console.log("Requesting MX API:");
  console.log(apiUrl);

  const response = await fetch(apiUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
      "Accept": "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(
      `MX API returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  console.log(
    "MX API status:",
    data.statusCode
  );

  console.log(
    "MX title:",
    data.title
  );

  // ------------------------------------------------
  // Find HLS
  // ------------------------------------------------

  const hls =
    data?.stream?.hls?.high ||
    data?.stream?.hls?.medium ||
    data?.stream?.hls?.low;

  if (!hls) {
    console.log(
      "Full MX response:",
      JSON.stringify(data)
    );

    throw new Error(
      "MX API returned no HLS stream"
    );
  }

  return {
    title: data.title || "MX Player",
    description: data.description || "",
    thumbnail:
      data?.imageInfo?.[1]?.url ||
      data?.imageInfo?.[0]?.url ||
      null,
    url: hls,
    duration: data.duration || null
  };
}

// --------------------------------------------------
// STREMIO STREAM ENDPOINT
// --------------------------------------------------

app.get(
  "/stream/:type/:id.json",
  async (req, res) => {

    try {

      const { type, id } = req.params;

      console.log(
        `Stremio request: type=${type} id=${id}`
      );

      // --------------------------------------------
      // TEST EPISODE
      // --------------------------------------------

      // For now we use the real MX Player episode
      // ID supplied earlier.
      //
      // Yeh Meri Family
      // Season 2
      // Episode 1
      // Apna Kamra

      const episodeId =
        "a2c9ed2742914673e2f83d8ec6b863b8";

      // --------------------------------------------
      // Get stream from MX API
      // --------------------------------------------

      const video =
        await getMxEpisode(episodeId);

      // --------------------------------------------
      // Return Stremio stream
      // --------------------------------------------

      res.json({
        streams: [
          {
            name: "MX Player",
            title: video.title,

            url: video.url,

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
