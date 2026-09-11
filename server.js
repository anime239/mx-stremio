const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

// Confirmed MX Player Episode 1 HLS playlist
const EPISODE_1_HLS =
  "https://d3sgzbosmwirao.cloudfront.net/video/637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218/3/hls/h264_high.m3u8";

const manifest = {
  id: "com.my.stremio.video",
  version: "1.0.0",
  name: "MX Test Video",
  description: "MX Player HLS playback test addon",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

// CORS — required for HTTP Stremio addons
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

// Manifest
app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

// Stream endpoint
app.get("/stream/:type/:id.json", (req, res) => {
  console.log("Stream request:", req.params);

  res.json({
    streams: [
      {
        name: "MX Player",
        title: "Yeh Meri Family S2E1 — 1080p",
        url: EPISODE_1_HLS
      }
    ]
  });
});

// Simple test page
app.get("/", (req, res) => {
  res.send(`
    <h2>MX Test Video Addon</h2>
    <p>Addon is running.</p>
    <p><a href="/manifest.json">Open manifest</a></p>
  `);
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Addon running on port ${PORT}`);
});
