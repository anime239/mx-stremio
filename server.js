const express = require("express");

const app = express();
const PORT = process.env.PORT || 7000;

const manifest = {
  id: "com.my.stremio.video",
  version: "1.0.0",
  name: "My Video Addon",
  description: "Custom video addon for Stremio",
  resources: ["stream"],
  types: ["movie", "series"],
  catalogs: []
};

app.get("/manifest.json", (req, res) => {
  res.json(manifest);
});

app.get("/stream/:type/:id.json", (req, res) => {
  res.json({
    streams: []
  });
});

app.listen(PORT, () => {
  console.log(`Addon running on port ${PORT}`);
});
