const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const BASE = "https://api.mxplayer.in/v1/web";
const SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io";
const MX = "https://www.mxplayer.in";
const CDN = "https://d3sgzbosmwirao.cloudfront.net";
const ADDON = "https://my-stremio-addon-q8ep.onrender.com";
const UID = crypto.randomUUID();

const headers = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/140 Mobile Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: MX + "/",
  Origin: MX
};

function params(extra = {}) {
  return {
    "device-density": "2",
    platform: "com.mxplay.desktop",
    "content-languages": "hi,en",
    "kids-mode-enabled": "false",
    userid: UID,
    ...extra
  };
}

async function request(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
    signal: AbortSignal.timeout(20000)
  });

  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 200)}`);

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function mx(path, extra = {}) {
  const u = new URL(BASE + path);
  Object.entries(params(extra)).forEach(([k, v]) =>
    u.searchParams.set(k, v)
  );
  return request(u);
}

async function search(q) {
  const u = new URL(BASE + "/search/resultv2");
  Object.entries(params({ query: q })).forEach(([k, v]) =>
    u.searchParams.set(k, v)
  );
  return request(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}"
  });
}

function allObjects(x, out = []) {
  if (!x || typeof x !== "object") return out;
  out.push(x);
  if (Array.isArray(x)) x.forEach(v => allObjects(v, out));
  else Object.values(x).forEach(v => allObjects(v, out));
  return out;
}

function type(x) {
  return String(x?.type || x?.contentType || "").toLowerCase();
}

function urlOf(x) {
  return x?.webUrl || x?.webURL || x?.web_url || null;
}

function streamOf(x) {
  return x?.stream ||
    x?.data?.stream ||
    x?.result?.stream ||
    null;
}

function hlsOf(s) {
  if (!s) return null;

  let h =
    s.hls?.high ||
    s.hls?.base ||
    s.hls?.main ||
    s.thirdParty?.hlsUrl ||
    s.altBalaji?.hlsUrl ||
    s.mxplay?.hls?.high;

  if (h && !h.startsWith("http"))
    h = CDN + "/" + h.replace(/^\/+/, "");

  return h || null;
}

/* ---------- SEO ---------- */

async function seo(webUrl) {
  const path = new URL(webUrl, MX).pathname;
  const u = new URL(SEO + "/get-url-details");

  Object.entries(params({ url: path })).forEach(([k, v]) =>
    u.searchParams.set(k, v)
  );

  const r = await request(u);

  if (!r?.data?.id)
    throw new Error("SEO did not resolve URL");

  return r.data;
}

/* ---------- PAGE FALLBACK ---------- */

async function moviePage(webUrl) {
  const html = await request(
    new URL(webUrl, MX),
    {
      headers: {
        "Accept": "text/html,*/*",
        "User-Agent": headers["User-Agent"]
      }
    }
  );

  const text = typeof html === "string" ? html : JSON.stringify(html);

  /* Look for a directly embedded HLS URL. */
  const match = text.match(
    /https?:[^"'\\\s]+\.m3u8/
  );

  if (match)
    return { hls: match[0].replace(/\\u0026/g, "&") };

  return null;
}

/* ---------- DETAIL ---------- */

async function detail(id, t) {
  return mx("/detail/video", {
    id,
    type: t
  });
}

/* ---------- MOVIE ---------- */

async function movie(imdb) {
  const cm = await request(
    `${CINEMETA}/meta/movie/${imdb}.json`
  );

  const meta = cm?.meta;
  if (!meta) throw new Error("Cinemeta movie not found");

  const rows = allObjects(await search(meta.name))
    .filter(x => type(x) === "movie" && x.id);

  if (!rows.length)
    throw new Error(`MX movie not found: ${meta.name}`);

  const item = rows
    .map(x => ({
      x,
      score:
        String(x.title).toLowerCase() ===
        String(meta.name).toLowerCase()
          ? 100
          : String(x.title)
              .toLowerCase()
              .includes(String(meta.name).toLowerCase())
            ? 80
            : 0
    }))
    .sort((a, b) => b.score - a.score)[0].x;

  /* 1. Search result stream */
  let hls = hlsOf(streamOf(item));
  if (hls) return hls;

  /* 2. SEO → canonical detail */
  if (urlOf(item)) {
    try {
      const s = await seo(urlOf(item));
      const d = await detail(s.id, s.type);
      hls = hlsOf(streamOf(d));
      if (hls) return hls;
    } catch {}
  }

  /* 3. Actual movie page fallback */
  if (urlOf(item)) {
    try {
      const p = await moviePage(urlOf(item));
      if (p?.hls) return p.hls;
    } catch {}
  }

  /* 4. Last direct-ID fallback */
  try {
    const d = await detail(item.id, "movie");
    hls = hlsOf(streamOf(d));
    if (hls) return hls;
  } catch {}

  throw new Error(`No MX movie stream: ${meta.name}`);
}

/* ---------- SEASON ---------- */

async function season(showTitle, number) {
  const rows = allObjects(
    await search(`${showTitle} season ${number}`)
  );

  const s = rows.find(x =>
    type(x) === "season" &&
    Number(x.sequence ?? x.seasonNo ?? x.seasonNumber) ===
      Number(number)
  );

  if (s) return s;

  /* Search may return "Season 2" without a numeric field. */
  return rows.find(x =>
    type(x) === "season" &&
    /season\s*2/i.test(x.title || "")
  );
}

/* ---------- EPISODES ---------- */

async function episodes(seasonId) {
  const r = await mx("/detail/tab/tvshowepisodes", {
    type: "season",
    id: seasonId,
    sortOrder: "0"
  });

  return allObjects(r).filter(
    x => type(x) === "episode" && x.id
  );
}

/* ---------- SERIES ---------- */

async function series(imdb, sn, en) {
  const cm = await request(
    `${CINEMETA}/meta/series/${imdb}.json`
  );

  const title = cm?.meta?.name;
  if (!title) throw new Error("Cinemeta series not found");

  const rows = allObjects(await search(title));
  const show = rows.find(
    x => type(x) === "tvshow" && x.id
  );

  if (!show) throw new Error(`MX show not found: ${title}`);

  const s = await season(title, sn);
  if (!s) throw new Error(`MX Season ${sn} not found`);

  const eps = await episodes(s.id);

  /* MX uses sequence for episode number. */
  const ep = eps.find(
    x => Number(
      x.sequence ??
      x.episodeNo ??
      x.episodeNumber
    ) === Number(en)
  );

  if (!ep)
    throw new Error(
      `MX Episode ${en} not found in Season ${sn}`
    );

  /* Episode item stream */
  let hls = hlsOf(streamOf(ep));
  if (hls) return hls;

  /* Episode webUrl → SEO → detail */
  if (urlOf(ep)) {
    try {
      const s = await seo(urlOf(ep));
      const d = await detail(s.id, s.type);
      hls = hlsOf(streamOf(d));
      if (hls) return hls;
    } catch {}
  }

  /* Direct fallback */
  try {
    const d = await detail(ep.id, "episode");
    hls = hlsOf(streamOf(d));
    if (hls) return hls;
  } catch {}

  throw new Error(
    `No MX stream: ${title} S${sn}E${en}`
  );
}

/* ---------- AUDIO ---------- */

async function audioFor(hls) {
  const base = hls.slice(0, hls.lastIndexOf("/") + 1);

  for (const f of [
    "audio_128000_0_96.m3u8",
    "audio_96000_0_96.m3u8"
  ]) {
    const u = base + f;

    try {
      const r = await fetch(u, {
        headers,
        signal: AbortSignal.timeout(7000)
      });

      if (r.ok) return u;
    } catch {}
  }

  return "";
}

/* ---------- HLS PROXY ---------- */

app.get("/hls", async (req, res) => {
  const video = req.query.video;
  const audio = req.query.audio;

  if (!video)
    return res.status(400).send("Missing video");

  let body = "#EXTM3U\n#EXT-X-VERSION:3\n";

  if (audio) {
    body +=
      `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",` +
      `NAME="Audio",DEFAULT=YES,AUTOSELECT=YES,` +
      `URI="${audio}"\n`;
  }

  body +=
    `#EXT-X-STREAM-INF:BANDWIDTH=5000000` +
    (audio ? `,AUDIO="a"` : "") +
    `\n${video}\n`;

  res.type("application/vnd.apple.mpegurl").send(body);
});

/* ---------- STREAM ---------- */

app.get("/stream/:type/:id.json", async (req, res) => {
  try {
    const { type: t, id } = req.params;

    let hls;

    if (t === "movie") {
      hls = await movie(id);
    } else if (t === "series") {
      const p = id.split(":");
      if (p.length !== 3)
        return res.json({ streams: [] });

      hls = await series(
        p[0],
        Number(p[1]),
        Number(p[2])
      );
    } else {
      return res.json({ streams: [] });
    }

    const audio = await audioFor(hls);

    res.json({
      streams: [{
        name: "MX Player",
        title: audio
          ? "MX Player • Audio"
          : "MX Player",
        url:
          `${ADDON}/hls?video=` +
          encodeURIComponent(hls) +
          `&audio=` +
          encodeURIComponent(audio),
        behaviorHints: {
          notWebReady: true,
          bingeGroup: "mxplayer"
        }
      }]
    });
  } catch (e) {
    console.log("[STREAM]", e.message);
    res.json({ streams: [] });
  }
});

/* ---------- DEBUG ---------- */

app.get("/debug/resolve/:type/:id", async (req, res) => {
  try {
    let hls;

    if (req.params.type === "movie") {
      hls = await movie(req.params.id);
    } else {
      const [imdb, s, e] =
        req.params.id.split(":");
      hls = await series(
        imdb,
        Number(s),
        Number(e)
      );
    }

    res.json({
      ok: true,
      hls,
      audio: await audioFor(hls)
    });
  } catch (e) {
    res.json({
      ok: false,
      error: e.message
    });
  }
});

app.get("/health", (_, res) =>
  res.json({
    status: "ok",
    version: "19.0.0"
  })
);

app.get("/", (_, res) =>
  res.json({
    name: "MX Player Free",
    version: "19.0.0"
  })
);

app.get("/manifest.json", (_, res) =>
  res.json({
    id: "com.minecraft.mxplayer",
    version: "19.0.0",
    name: "MX Player Free",
    description: "MX Player stream resolver",
    resources: [
      {
        name: "stream",
        types: ["movie", "series"],
        idPrefixes: ["tt"]
      }
    ],
    types: ["movie", "series"]
  })
);

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

app.listen(PORT, "0.0.0.0", () =>
  console.log(`MX addon v19 running on ${PORT}`)
);
