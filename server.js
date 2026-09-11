const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

const EPISODE_PAGE =
  "https://www.mxplayer.in/show/watch-yeh-meri-family/season-2/apna-kamra-online-a2c9ed2742914673e2f83d8ec6b863b8";

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

app.get("/debug-page", async (req, res) => {
  try {
    const response = await fetch(EPISODE_PAGE, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
          "AppleWebKit/537.36 (KHTML, like Gecko) " +
          "Chrome/140.0.0.0 Safari/537.36",

        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

        "Accept-Language":
          "en-IN,en;q=0.9",

        "Referer":
          "https://www.mxplayer.in/"
      }
    });

    const html = await response.text();

    const m3u8Matches = [
      ...html.matchAll(
        /https?:[^"'\\\s<>]+\.m3u8[^"'\\\s<>]*/gi
      )
    ].map(x => x[0]);

    const contentUrlMatches = [
      ...html.matchAll(
        /"contentUrl"\s*:\s*"([^"]+)"/gi
      )
    ].map(x => x[1]);

    const cloudfrontMatches = [
      ...html.matchAll(
        /https?:[^"'\\\s<>]*cloudfront\.net[^"'\\\s<>]*/gi
      )
    ].map(x => x[0]);

    const videoObject =
      html.includes('"@type":"VideoObject"') ||
      html.includes('"@type": "VideoObject"');

    res.json({
      httpStatus: response.status,

      htmlLength: html.length,

      videoObjectFound:
        videoObject,

      m3u8Found:
        m3u8Matches.length > 0,

      m3u8Urls:
        [...new Set(m3u8Matches)].slice(0, 10),

      contentUrlFound:
        contentUrlMatches.length > 0,

      contentUrls:
        [...new Set(contentUrlMatches)].slice(0, 10),

      cloudfrontFound:
        cloudfrontMatches.length > 0,

      cloudfrontUrls:
        [...new Set(cloudfrontMatches)].slice(0, 10)
    });

  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

app.get("/stream/:type/:id.json", (req, res) => {
  res.json({
    streams: []
  });
});

app.get("/", (req, res) => {
  res.send("MX Test addon is running.");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Addon running on port ${PORT}`);
});
