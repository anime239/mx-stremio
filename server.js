const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

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

/*
 * Extract the VideoObject from an MX Player page.
 */
async function extractMxPlayer(pageUrl) {
  const response = await fetch(pageUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36"
    }
  });

  if (!response.ok) {
    throw new Error(`MX Player returned HTTP ${response.status}`);
  }

  const html = await response.text();

  const scripts = [
    ...html.matchAll(
      /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
    )
  ];

  for (const match of scripts) {
    try {
      const data = JSON.parse(match[1]);

      const objects = Array.isArray(data) ? data : [data];

      for (const obj of objects) {
        if (
          obj &&
          obj["@type"] === "VideoObject" &&
          obj.contentUrl &&
          obj.contentUrl.includes(".m3u8")
        ) {
          return {
            url: obj.contentUrl,
            title: obj.name || "MX Player",
            description: obj.description || "",
            thumbnail: obj.thumbnailUrl || null,
            duration: obj.duration || null
          };
        }
      }
    } catch {
      // Ignore invalid JSON-LD blocks.
    }
  }

  throw new Error("No MX Player HLS stream found");
}

/*
 * TEST:
 *
 * The ID here is an MX Player episode ID.
 *
 * Example:
 * /stream/series/a2c9ed2742914673e2f83d8ec6b863b8.json
 */
app.get("/stream/:type/:id.json", async (req, res) => {
  try {
    const { type, id } = req.params;

    const episodeId = id.split(":")[0];

    if (!/^[a-f0-9]{32}$/i.test(episodeId)) {
      return res.json({
        streams: []
      });
    }

    const pageUrl =
      `https://www.mxplayer.in/detail/episode/${episodeId}`;

    const video = await extractMxPlayer(pageUrl);

    res.json({
      streams: [
        {
          name: "MX Player",
          title: video.title,
          url: video.url,
          thumbnail: video.thumbnail,
          behaviorHints: {
            bingeGroup: "mxplayer"
          }
        }
      ]
    });
  } catch (error) {
    console.error(error);

    res.json({
      streams: []
      error: error.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Addon running on port ${PORT}`);
});
