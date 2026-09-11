const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

const manifest = {
  id: "com.my.stremio.video",
  version: "1.0.0",
  name: "MX Test",
  description: "MX Player API test",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/test", async (req, res) => {
  try {
    const path =
      "/show/watch-yeh-meri-family/season-2/apna-kamra-online-a2c9ed2742914673e2f83d8ec6b863b8";

    const params = new URLSearchParams({
      url: path,
      "device-density": "2",
      platform: "com.mxplay.desktop",
      "content-languages": "hi,en",
      userid: "30bb09af-733a-413b-b8b7-b10348ec2b3d"
    });

    const url =
      `https://seo.mxplay.com/v1/api/seo/get-url-details?${params}`;

    console.log("SEO URL:", url);

    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36",
        "Referer": "https://www.mxplayer.in/"
      }
    });

    const text = await response.text();

    res.status(response.status).json({
      httpStatus: response.status,
      response: text
    });

  } catch (error) {
    res.json({
      error: error.message
    });
  }
});

app.get("/stream/:type/:id.json", async (req, res) => {
  res.json({
    streams: []
  });
});

app.get("/", (req, res) => {
  res.send("MX Test addon is running");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Running on port ${PORT}`);
});
