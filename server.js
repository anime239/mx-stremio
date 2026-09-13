const express = require("express");
const crypto = require("crypto");

const app = express();

const PORT = process.env.PORT || 3000;

// Public URL used by Stremio for deployed HLS wrapper endpoints.
// Render provides RENDER_EXTERNAL_URL automatically.
const PUBLIC_URL =
  process.env.RENDER_EXTERNAL_URL ||
  `http://127.0.0.1:${PORT}`;

const MX_BASE = "https://api.mxplayer.in/v1/web";

const MX_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "en-IN,en;q=0.9",
};

const API_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36",
  "Accept":
    "application/json, text/plain, */*",
  "Content-Type": "application/json",
  "Origin": "https://www.mxplayer.in",
  "Referer": "https://www.mxplayer.in/",
};


// ============================================================
// CORS
// ============================================================

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,OPTIONS"
  );

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});


// ============================================================
// Helpers
// ============================================================

function absoluteMxUrl(url) {
  if (!url) return null;

  if (
    url.startsWith("http://") ||
    url.startsWith("https://")
  ) {
    return url;
  }

  if (url.startsWith("/")) {
    return "https://www.mxplayer.in" + url;
  }

  return "https://www.mxplayer.in/" + url;
}


async function fetchText(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  return {
    response,
    text,
  };
}


async function fetchJson(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();

  let data;

  try {
    data = JSON.parse(text);
  } catch (_) {
    throw new Error(
      `Invalid JSON from ${url}`
    );
  }

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status}: ${text.slice(0, 500)}`
    );
  }

  return data;
}


// ============================================================
// MX __mxs__ extraction
// ============================================================

function extractMxs(html) {
  const marker = "window.__mxs__";

  const markerIndex = html.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error(
      "window.__mxs__ not found"
    );
  }

  const equalsIndex = html.indexOf(
    "=",
    markerIndex
  );

  if (equalsIndex === -1) {
    throw new Error(
      "window.__mxs__ assignment not found"
    );
  }

  let start = equalsIndex + 1;

  while (
    start < html.length &&
    /\s/.test(html[start])
  ) {
    start++;
  }

  if (html[start] !== "{") {
    throw new Error(
      "window.__mxs__ is not an object"
    );
  }

  let depth = 0;
  let inString = false;
  let quote = "";
  let escaped = false;

  for (
    let i = start;
    i < html.length;
    i++
  ) {
    const ch = html[i];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (ch === "\\") {
        escaped = true;
        continue;
      }

      if (ch === quote) {
        inString = false;
      }

      continue;
    }

    if (
      ch === '"' ||
      ch === "'"
    ) {
      inString = true;
      quote = ch;
      continue;
    }

    if (ch === "{") {
      depth++;
    }

    if (ch === "}") {
      depth--;

      if (depth === 0) {
        const jsonText =
          html.slice(start, i + 1);

        try {
          return JSON.parse(jsonText);
        } catch (error) {
          throw new Error(
            "Could not parse window.__mxs__: " +
              error.message
          );
        }
      }
    }
  }

  throw new Error(
    "Could not find end of window.__mxs__"
  );
}


async function fetchMxPage(url) {
  const result =
    await fetchText(url, {
      headers: MX_HEADERS,
      redirect: "follow",
    });

  console.log(
    "MX page status:",
    result.response.status,
    "bytes:",
    result.text.length
  );

  if (!result.response.ok) {
    throw new Error(
      `MX page HTTP ${result.response.status}`
    );
  }

  return result.text;
}


function getEntity(mxs, id) {
  if (!mxs || !id) {
    return null;
  }

  if (
    mxs.entities &&
    mxs.entities[id]
  ) {
    return mxs.entities[id];
  }

  if (
    mxs.entities &&
    Array.isArray(mxs.entities)
  ) {
    return (
      mxs.entities.find(
        item =>
          item &&
          item.id === id
      ) || null
    );
  }

  return null;
}


// ============================================================
// HLS attribute parser
// ============================================================

function parseAttributeList(text) {
  const result = {};

  const regex =
    /([A-Z0-9-]+)=(?:"((?:[^"\\]|\\.)*)"|([^,]*))/g;

  let match;

  while (
    (match = regex.exec(text))
  ) {
    result[match[1]] =
      match[2] !== undefined
        ? match[2]
        : match[3];
  }

  return result;
}


function resolutionHeight(resolution) {
  if (!resolution) {
    return null;
  }

  const match =
    String(resolution).match(
      /^\d+x(\d+)$/i
    );

  if (!match) {
    return null;
  }

  return Number(match[1]);
}


function resolutionWidth(resolution) {
  if (!resolution) {
    return null;
  }

  const match =
    String(resolution).match(
      /^(\d+)x\d+$/i
    );

  if (!match) {
    return null;
  }

  return Number(match[1]);
}


function qualityFromHeight(height) {
  if (!height) {
    return null;
  }

  if (height >= 2160) return "2160p";
  if (height >= 1440) return "1440p";
  if (height >= 1080) return "1080p";
  if (height >= 720) return "720p";
  if (height >= 576) return "576p";
  if (height >= 480) return "480p";
  if (height >= 360) return "360p";
  if (height >= 240) return "240p";

  return `${height}p`;
}


// ============================================================
// Parse HLS master
//
// IMPORTANT:
// First collect ALL audio groups.
// Then collect ALL video variants.
//
// This avoids the old ordering problem where a video variant
// could be parsed before its AUDIO group was known.
// ============================================================

function parseHlsMaster(
  playlistUrl,
  text
) {
  const lines =
    text.split(/\r?\n/);

  const audioGroups = {};
  const variants = [];

  // ----------------------------------------------------------
  // PASS 1: audio groups
  // ----------------------------------------------------------

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i].trim();

    if (
      !line.startsWith(
        "#EXT-X-MEDIA:"
      )
    ) {
      continue;
    }

    const attributes =
      parseAttributeList(
        line.substring(
          "#EXT-X-MEDIA:".length
        )
      );

    if (
      String(
        attributes.TYPE || ""
      ).toUpperCase() !== "AUDIO"
    ) {
      continue;
    }

    const groupId =
      attributes["GROUP-ID"];

    if (!groupId) {
      continue;
    }

    let audioUrl = null;

    if (attributes.URI) {
      try {
        audioUrl =
          new URL(
            attributes.URI,
            playlistUrl
          ).href;
      } catch (_) {
        audioUrl = null;
      }
    }

    if (!audioGroups[groupId]) {
      audioGroups[groupId] = [];
    }

    audioGroups[groupId].push({
      url: audioUrl,

      name:
        attributes.NAME ||
        "Audio",

      language:
        attributes.LANGUAGE ||
        null,

      default:
        String(
          attributes.DEFAULT || ""
        ).toUpperCase() === "YES",

      autoSelect:
        String(
          attributes.AUTOSELECT || ""
        ).toUpperCase() === "YES",

      channels:
        attributes.CHANNELS ||
        null,
    });
  }


  // ----------------------------------------------------------
  // PASS 2: video variants
  // ----------------------------------------------------------

  for (
    let i = 0;
    i < lines.length;
    i++
  ) {
    const line =
      lines[i].trim();

    if (
      !line.startsWith(
        "#EXT-X-STREAM-INF:"
      )
    ) {
      continue;
    }

    const attributes =
      parseAttributeList(
        line.substring(
          "#EXT-X-STREAM-INF:".length
        )
      );

    let variantUrl = null;

    for (
      let j = i + 1;
      j < lines.length;
      j++
    ) {
      const next =
        lines[j].trim();

      if (!next) {
        continue;
      }

      if (
        next.startsWith("#")
      ) {
        continue;
      }

      try {
        variantUrl =
          new URL(
            next,
            playlistUrl
          ).href;
      } catch (_) {
        variantUrl = null;
      }

      break;
    }

    if (!variantUrl) {
      continue;
    }

    const height =
      resolutionHeight(
        attributes.RESOLUTION
      );

    const width =
      resolutionWidth(
        attributes.RESOLUTION
      );

    const bandwidth =
      Number(
        attributes.BANDWIDTH || 0
      );

    const averageBandwidth =
      Number(
        attributes["AVERAGE-BANDWIDTH"] || 0
      );

    const audioGroup =
      attributes.AUDIO ||
      null;

    const audio =
      audioGroup &&
      audioGroups[audioGroup]
        ? audioGroups[audioGroup]
            .filter(
              item => item.url
            )
        : [];

    variants.push({
      url: variantUrl,

      resolution:
        attributes.RESOLUTION ||
        null,

      width,

      height,

      bandwidth,

      averageBandwidth,

      codecs:
        attributes.CODECS ||
        null,

      frameRate:
        attributes["FRAME-RATE"]
          ? Number(
              attributes["FRAME-RATE"]
            )
          : null,

      audioGroup,

      quality:
        qualityFromHeight(
          height
        ),

      audio,
    });
  }


  return {
    variants,
    audioGroups,
  };
}


// ============================================================
// Fetch HLS master
// ============================================================

async function getHlsMaster(
  masterUrl
) {
  try {
    const result =
      await fetchText(
        masterUrl,
        {
          headers: {
            ...MX_HEADERS,

            Accept:
              "application/vnd.apple.mpegurl," +
              "application/x-mpegURL," +
              "application/octet-stream," +
              "text/plain,*/*",
          },

          redirect:
            "follow",
        }
      );

    if (
      !result.response.ok
    ) {
      console.log(
        "HLS master HTTP:",
        result.response.status
      );

      return null;
    }

    if (
      !result.text.includes(
        "#EXTM3U"
      )
    ) {
      return null;
    }

    return result.text;

  } catch (error) {
    console.log(
      "HLS master error:",
      error.message
    );

    return null;
  }
}


// ============================================================
// Base64 URL helpers
// ============================================================

function encodeUrl(value) {
  return Buffer.from(
    value,
    "utf8"
  )
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}


function decodeUrl(value) {
  let base64 =
    String(value || "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");

  while (
    base64.length % 4 !== 0
  ) {
    base64 += "=";
  }

  return Buffer.from(
    base64,
    "base64"
  ).toString("utf8");
}


// ============================================================
// HLS quality wrapper
//
// Creates a small valid HLS MASTER playlist:
//
//   audio rendition
//          +
//   selected video quality
//
// The important part is that the video variant explicitly
// references AUDIO="audio".
// ============================================================

app.get(
  "/hls/quality",
  (req, res) => {
    try {
      const video =
        decodeUrl(
          req.query.video
        );

      const audio =
        req.query.audio
          ? decodeUrl(
              req.query.audio
            )
          : null;

      const bandwidth =
        Number(
          req.query.bandwidth || 0
        );

      const width =
        Number(
          req.query.width || 0
        );

      const height =
        Number(
          req.query.height || 0
        );

      const codecs =
        req.query.codecs
          ? decodeUrl(
              req.query.codecs
            )
          : null;

      if (!video) {
        return res
          .status(400)
          .send("Missing video");
      }

      let output =
        "#EXTM3U\n";

      output +=
        "#EXT-X-VERSION:6\n";

      output +=
        "#EXT-X-INDEPENDENT-SEGMENTS\n";


      // --------------------------------------------------------
      // AUDIO
      // --------------------------------------------------------

      if (audio) {
        output +=
          '#EXT-X-MEDIA:' +
          'TYPE=AUDIO,' +
          'GROUP-ID="audio",' +
          'NAME="Hindi",' +
          'DEFAULT=YES,' +
          'AUTOSELECT=YES,' +
          'LANGUAGE="hi",' +
          'CHANNELS="2",' +
          `URI="${audio}"\n`;
      }


      // --------------------------------------------------------
      // VIDEO
      // --------------------------------------------------------

      let streamBandwidth =
        bandwidth;

      if (
        streamBandwidth > 0 &&
        audio
      ) {
        streamBandwidth += 128000;
      }

      let attributes = [];

      if (
        streamBandwidth > 0
      ) {
        attributes.push(
          `BANDWIDTH=${streamBandwidth}`
        );
      }

      if (
        width > 0 &&
        height > 0
      ) {
        attributes.push(
          `RESOLUTION=${width}x${height}`
        );
      }

      if (codecs) {
        attributes.push(
          `CODECS="${codecs}"`
        );
      }

      if (audio) {
        attributes.push(
          'AUDIO="audio"'
        );
      }

      output +=
        "#EXT-X-STREAM-INF:" +
        attributes.join(",") +
        "\n";

      output +=
        video +
        "\n";


      // --------------------------------------------------------
      // Response
      // --------------------------------------------------------

      res.status(200);

      res.set(
        "Content-Type",
        "application/vnd.apple.mpegurl"
      );

      res.set(
        "Content-Disposition",
        'inline; filename="mx-quality.m3u8"'
      );

      res.set(
        "Access-Control-Allow-Origin",
        "*"
      );

      res.set(
        "Access-Control-Allow-Headers",
        "*"
      );

      res.set(
        "Cache-Control",
        "no-cache, no-store, must-revalidate"
      );

      res.send(output);

      console.log(
        "HLS quality wrapper:",
        {
          video,
          audio,
          width,
          height,
        }
      );

    } catch (error) {
      console.error(
        "HLS wrapper error:",
        error
      );

      res
        .status(500)
        .send(
          "HLS wrapper error: " +
            error.message
        );
    }
  }
);


// ============================================================
// Collect raw stream URLs
// ============================================================

function collectStreamUrls(
  value,
  cdnBase,
  output = [],
  seen = new Set()
) {
  if (!value) {
    return output;
  }

  if (
    typeof value === "string"
  ) {
    if (
      value.includes(".m3u8") ||
      value.includes(".mpd")
    ) {
      let url = value;

      if (
        cdnBase &&
        !url.startsWith("http://") &&
        !url.startsWith("https://")
      ) {
        try {
          url =
            new URL(
              url,
              cdnBase
            ).href;
        } catch (_) {}
      }

      if (!seen.has(url)) {
        seen.add(url);
        output.push(url);
      }
    }

    return output;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      collectStreamUrls(
        item,
        cdnBase,
        output,
        seen
      );
    }

    return output;
  }

  if (
    typeof value === "object"
  ) {
    for (
      const key of Object.keys(value)
    ) {
      collectStreamUrls(
        value[key],
        cdnBase,
        output,
        seen
      );
    }
  }

  return output;
}


// ============================================================
// Select best audio
// ============================================================

function selectAudio(audioList) {
  if (
    !Array.isArray(audioList) ||
    audioList.length === 0
  ) {
    return null;
  }

  return (
    audioList.find(
      item => item.default
    ) ||
    audioList.find(
      item =>
        item.autoSelect
    ) ||
    audioList[0]
  );
}


// ============================================================
// Build streams
// ============================================================

async function buildStreams(
  entity,
  cdnBase
) {
  if (!entity) {
    throw new Error(
      "MX entity not found"
    );
  }

  if (!entity.stream) {
    throw new Error(
      "MX entity contains no stream"
    );
  }

  if (
    entity.stream.drmProtect === true ||
    entity.stream.drmProtected === true
  ) {
    throw new Error(
      "MX stream is DRM protected"
    );
  }

  const rawUrls =
    collectStreamUrls(
      entity.stream,
      cdnBase
    );

  const hlsMasters =
    rawUrls.filter(
      url =>
        url.includes(".m3u8")
    );

  const dashUrls =
    rawUrls.filter(
      url =>
        url.includes(".mpd")
    );

  const streams = [];


  // ==========================================================
  // HLS
  // ==========================================================

  for (
    const masterUrl of hlsMasters
  ) {
    const masterText =
      await getHlsMaster(
        masterUrl
      );

    if (!masterText) {
      streams.push({
        url: masterUrl,

        name:
          "MX Player • Auto",

        title:
          "Auto • HLS",

        tag:
          ["HLS"],

        isFree:
          true,

        behaviorHints: {
          notWebReady: true,
          bingeGroup:
            "mxplayer-auto",
        },
      });

      continue;
    }


    const parsed =
      parseHlsMaster(
        masterUrl,
        masterText
      );


    console.log(
      "HLS AUDIO GROUPS:",
      JSON.stringify(
        parsed.audioGroups,
        null,
        2
      )
    );

    console.log(
      "HLS VARIANTS:",
      parsed.variants.map(
        v => ({
          quality: v.quality,
          url: v.url,
          audioGroup:
            v.audioGroup,
          audio:
            v.audio,
        })
      )
    );


    // --------------------------------------------------------
    // Individual qualities
    // --------------------------------------------------------

    for (
      const variant of
      parsed.variants
    ) {
      const quality =
        variant.quality ||
        "Auto";

      const audio =
        selectAudio(
          variant.audio
        );


      // ------------------------------------------------------
      // AUDIO AVAILABLE
      // ------------------------------------------------------

      if (audio) {
        const wrapperUrl =
          "/hls/quality" +
          `?video=${encodeUrl(
            variant.url
          )}` +
          `&audio=${encodeUrl(
            audio.url
          )}` +
          `&bandwidth=${
            variant.bandwidth || 0
          }` +
          `&width=${
            variant.width || 0
          }` +
          `&height=${
            variant.height || 0
          }` +
          `&codecs=${encodeUrl(
            variant.codecs || ""
          )}`;

        streams.push({
          url:
            PUBLIC_URL +
            wrapperUrl,

          name:
            `MX Player • ${quality}`,

          title:
            `${quality}` +
            (
              variant.bandwidth
                ? ` • ${Math.round(
                    variant.bandwidth /
                    1000
                  )} kbps`
                : ""
            ) +
            " • Audio",

          tag: [
            quality,
            "HLS",
          ],

          isFree: true,

          behaviorHints: {
            notWebReady: true,
            bingeGroup:
              `mxplayer-${quality}`,
          },
        });

        continue;
      }


      // ------------------------------------------------------
      // NO AUDIO
      // ------------------------------------------------------

      streams.push({
        url:
          variant.url,

        name:
          `MX Player • ${quality}`,

        title:
          `${quality}` +
          (
            variant.bandwidth
              ? ` • ${Math.round(
                  variant.bandwidth /
                  1000
                )} kbps`
              : ""
          ),

        tag: [
          quality,
          "HLS",
        ],

        isFree: true,

        behaviorHints: {
          notWebReady: true,
          bingeGroup:
            `mxplayer-${quality}`,
        },
      });
    }


    // --------------------------------------------------------
    // No variants
    // --------------------------------------------------------

    if (
      parsed.variants.length === 0
    ) {
      streams.push({
        url:
          masterUrl,

        name:
          "MX Player • Auto",

        title:
          "Auto • HLS",

        tag:
          ["HLS"],

        isFree:
          true,

        behaviorHints: {
          notWebReady: true,
          bingeGroup:
            "mxplayer-auto",
        },
      });
    }
  }


  // ==========================================================
  // DASH
  // ==========================================================

  for (
    const dashUrl of dashUrls
  ) {
    streams.push({
      url:
        dashUrl,

      name:
        "MX Player • DASH",

      title:
        "Adaptive • DASH • Audio",

      tag:
        ["DASH"],

      isFree:
        true,

      behaviorHints: {
        notWebReady: true,
        bingeGroup:
          "mxplayer-dash",
      },
    });
  }


  // ==========================================================
  // Remove duplicate URLs
  // ==========================================================

  const unique = [];
  const seen = new Set();

  for (
    const stream of streams
  ) {
    if (
      seen.has(stream.url)
    ) {
      continue;
    }

    seen.add(stream.url);
    unique.push(stream);
  }


  // ==========================================================
  // Sort quality
  // ==========================================================

  function score(stream) {
    const match =
      String(
        stream.name || ""
      ).match(
        /(\d{3,4})p/
      );

    if (match) {
      return Number(
        match[1]
      );
    }

    if (
      String(
        stream.name || ""
      ).includes("DASH")
    ) {
      return -1;
    }

    return 0;
  }

  unique.sort(
    (a, b) =>
      score(b) - score(a)
  );

  return unique;
}


// ============================================================
// Resolve MX page
// ============================================================

async function resolveMxPage(
  url
) {
  const html =
    await fetchMxPage(url);

  const mxs =
    extractMxs(html);

  const config =
    mxs.config || {};

  const cdnBase =
    config.videoCdnBaseUrl
      ? (
          config.videoCdnBaseUrl.endsWith("/")
            ? config.videoCdnBaseUrl
            : config.videoCdnBaseUrl + "/"
        )
      : null;

  const match =
    url.match(
      /([a-f0-9]{32})(?:[?#]|$)/i
    );

  const id =
    match
      ? match[1]
      : null;

  let entity =
    getEntity(
      mxs,
      id
    );

  if (
    !entity &&
    mxs.entities
  ) {
    const candidates =
      Object.values(
        mxs.entities
      ).filter(
        x =>
          x &&
          typeof x === "object" &&
          x.stream
      );

    if (
      candidates.length === 1
    ) {
      entity =
        candidates[0];
    }
  }

  if (!entity) {
    throw new Error(
      `MX entity ${
        id || "unknown"
      } not found`
    );
  }

  const streams =
    await buildStreams(
      entity,
      cdnBase
    );

  return {
    ok: true,

    url,

    cdnBase,

    title:
      entity.title,

    id:
      entity.id,

    type:
      entity.type,

    streams,

    entity,
  };
}


// ============================================================
// MX Search
// ============================================================

async function mxSearch(
  query
) {
  const userid =
    crypto.randomUUID();

  const url =
    `${MX_BASE}/search/resultv2` +
    `?query=${encodeURIComponent(
      query
    )}` +
    `&userid=${encodeURIComponent(
      userid
    )}` +
    `&device-density=2` +
    `&platform=com.mxplay.desktop` +
    `&content-languages=hi,en` +
    `&kids-mode-enabled=false`;

  const response =
    await fetch(
      url,
      {
        method: "POST",

        headers:
          API_HEADERS,

        body: "{}",
      }
    );

  const text =
    await response.text();

  if (!response.ok) {
    throw new Error(
      `MX search HTTP ${
        response.status
      }: ${text.slice(
        0,
        500
      )}`
    );
  }

  return JSON.parse(text);
}


function flattenSearchResults(
  value,
  output = [],
  seen = new Set()
) {
  if (!value) {
    return output;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      flattenSearchResults(
        item,
        output,
        seen
      );
    }

    return output;
  }

  if (
    typeof value !== "object"
  ) {
    return output;
  }

  if (
    value.id &&
    value.webUrl &&
    value.title
  ) {
    const key =
      `${value.type || ""}:${value.id}`;

    if (!seen.has(key)) {
      seen.add(key);
      output.push(value);
    }
  }

  for (
    const key of
    Object.keys(value)
  ) {
    flattenSearchResults(
      value[key],
      output,
      seen
    );
  }

  return output;
}


function normalizeTitle(
  title
) {
  return String(
    title || ""
  )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}


function findBestSearchResult(
  data,
  title,
  wantedType
) {
  const items =
    flattenSearchResults(
      data
    );

  const wanted =
    normalizeTitle(
      title
    );

  const typed =
    items.filter(
      item =>
        !wantedType ||
        item.type === wantedType
    );

  const candidates =
    typed.length
      ? typed
      : items;

  let exact =
    candidates.find(
      item =>
        normalizeTitle(
          item.title
        ) === wanted
    );

  if (exact) {
    return exact;
  }

  exact =
    candidates.find(
      item => {
        const t =
          normalizeTitle(
            item.title
          );

        return (
          t.includes(wanted) ||
          wanted.includes(t)
        );
      }
    );

  if (exact) {
    return exact;
  }

  return (
    candidates[0] ||
    null
  );
}


// ============================================================
// Cinemeta
// ============================================================

async function getCinemetaMeta(
  imdbId,
  type
) {
  const url =
    `https://v3-cinemeta.strem.io/meta/` +
    `${type}/` +
    `${encodeURIComponent(
      imdbId
    )}.json`;

  const response =
    await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Cinemeta HTTP ${
        response.status
      }`
    );
  }

  return response.json();
}


// ============================================================
// Season discovery
// ============================================================

function collectSeasonCandidates(
  value,
  output = [],
  seen = new Set(),
  parentKey = ""
) {
  if (!value) {
    return output;
  }

  if (
    Array.isArray(value)
  ) {
    for (
      const item of value
    ) {
      collectSeasonCandidates(
        item,
        output,
        seen,
        parentKey
      );
    }

    return output;
  }

  if (
    typeof value !== "object"
  ) {
    return output;
  }

  if (
    value.type === "season" &&
    value.id
  ) {
    const id =
      String(value.id);

    if (!seen.has(id)) {
      seen.add(id);

      const number =
        Number(
          value.sequence ??
          value.seasonNo ??
          value.seasonNumber ??
          value.number ??
          value.season
        );

      output.push({
        id,

        title:
          value.title ||
          value.name ||
          null,

        number:
          Number.isFinite(number)
            ? number
            : null,
      });
    }
  }

  if (
    parentKey === "seasons" ||
    parentKey === "seasonIds" ||
    parentKey === "seasonMap" ||
    parentKey === "season_map"
  ) {
    for (
      const [
        key,
        child,
      ] of Object.entries(value)
    ) {
      if (
        /^\d+$/.test(key) &&
        typeof child === "string" &&
        /^[a-f0-9]{32}$/i.test(child)
      ) {
        if (!seen.has(child)) {
          seen.add(child);

          output.push({
            id: child,

            title:
              `Season ${key}`,

            number:
              Number(key),
          });
        }
      }

      if (
        child &&
        typeof child === "object" &&
        child.id
      ) {
        const id =
          String(child.id);

        if (!seen.has(id)) {
          seen.add(id);

          output.push({
            id,

            title:
              child.title ||
              child.name ||
              `Season ${key}`,

            number:
              Number(key),
          });
        }
      }
    }
  }

  for (
    const [
      key,
      child,
    ] of Object.entries(value)
  ) {
    collectSeasonCandidates(
      child,
      output,
      seen,
      key
    );
  }

  return output;
}


async function findMxSeason(
  showUrl,
  seasonNumber
) {
  const html =
    await fetchMxPage(
      showUrl
    );

  const mxs =
    extractMxs(html);

  const candidates =
    collectSeasonCandidates(
      mxs
    );

  const exact =
    candidates.find(
      season =>
        season.number ===
        seasonNumber
    );

  if (exact) {
    return {
      season: exact,
      candidates,
      mxs,
    };
  }

  const titleMatch =
    candidates.find(
      season =>
        normalizeTitle(
          season.title
        ) ===
        `season ${seasonNumber}`
    );

  if (titleMatch) {
    return {
      season: titleMatch,
      candidates,
      mxs,
    };
  }

  throw new Error(
    `MX Season ${seasonNumber} not found`
  );
}


// ============================================================
// Episode list
// ============================================================

async function getSeasonEpisodes(
  seasonId
) {
  const userid =
    crypto.randomUUID();

  const url =
    `${MX_BASE}/detail/tab/tvshowepisodes` +
    `?type=season` +
    `&id=${encodeURIComponent(
      seasonId
    )}` +
    `&sortOrder=0` +
    `&userid=${encodeURIComponent(
      userid
    )}` +
    `&device-density=2` +
    `&platform=com.mxplay.desktop` +
    `&content-languages=hi,en` +
    `&kids-mode-enabled=false`;

  const data =
    await fetchJson(
      url,
      {
        headers:
          API_HEADERS,
      }
    );

  const episodes = [];
  const seen = new Set();

  function walk(value) {
    if (!value) {
      return;
    }

    if (
      Array.isArray(value)
    ) {
      for (
        const item of value
      ) {
        walk(item);
      }

      return;
    }

    if (
      typeof value !== "object"
    ) {
      return;
    }

    if (
      value.id &&
      (
        value.type === "episode" ||
        value.webUrl
      ) &&
      (
        value.sequence !== undefined ||
        value.episodeNo !== undefined ||
        value.episode_no !== undefined
      )
    ) {
      const id =
        String(value.id);

      if (!seen.has(id)) {
        seen.add(id);

        const episodeNumber =
          Number(
            value.sequence ??
            value.episodeNo ??
            value.episode_no
          );

        episodes.push({
          id,

          title:
            value.title ||
            value.name ||
            "Episode",

          episodeNumber:
            Number.isFinite(
              episodeNumber
            )
              ? episodeNumber
              : null,

          webUrl:
            value.webUrl
              ? absoluteMxUrl(
                  value.webUrl
                )
              : null,
        });
      }
    }

    for (
      const key of
      Object.keys(value)
    ) {
      walk(
        value[key]
      );
    }
  }

  walk(data);

  episodes.sort(
    (a, b) =>
      (
        a.episodeNumber ??
        9999
      ) -
      (
        b.episodeNumber ??
        9999
      )
  );

  return {
    data,
    episodes,
  };
}


// ============================================================
// Series resolver
// ============================================================

async function resolveSeriesEpisode(
  imdbId,
  seasonNumber,
  episodeNumber
) {
  console.log(
    `Resolving ${imdbId} S${seasonNumber}E${episodeNumber}`
  );

  const meta =
    await getCinemetaMeta(
      imdbId,
      "series"
    );

  const title =
    meta &&
    meta.meta &&
    meta.meta.name
      ? meta.meta.name
      : null;

  if (!title) {
    throw new Error(
      "Cinemeta did not return title"
    );
  }

  const search =
    await mxSearch(
      title
    );

  const show =
    findBestSearchResult(
      search,
      title,
      "tvshow"
    );

  if (!show) {
    throw new Error(
      `MX TV show not found: ${title}`
    );
  }

  const showUrl =
    absoluteMxUrl(
      show.webUrl
    );

  const seasonResult =
    await findMxSeason(
      showUrl,
      seasonNumber
    );

  const season =
    seasonResult.season;

  const episodeResult =
    await getSeasonEpisodes(
      season.id
    );

  const episode =
    episodeResult.episodes.find(
      item =>
        item.episodeNumber ===
        episodeNumber
    );

  if (!episode) {
    throw new Error(
      `Episode ${episodeNumber} not found`
    );
  }

  if (!episode.webUrl) {
    throw new Error(
      "MX episode has no webUrl"
    );
  }

  const resolved =
    await resolveMxPage(
      episode.webUrl
    );

  return {
    ok: true,

    imdbId,

    seasonNumber,

    episodeNumber,

    cinemetaTitle:
      title,

    mxShow: {
      id:
        show.id,

      title:
        show.title,

      webUrl:
        showUrl,
    },

    mxSeason:
      season,

    mxEpisode: {
      id:
        episode.id,

      title:
        episode.title,

      episodeNumber:
        episode.episodeNumber,

      webUrl:
        episode.webUrl,
    },

    streams:
      resolved.streams,
  };
}


// ============================================================
// Debug: extract
// ============================================================

app.get(
  "/debug/extract",
  async (req, res) => {
    try {
      const url =
        req.query.url;

      if (!url) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Missing ?url=",
          });
      }

      const result =
        await resolveMxPage(
          url
        );

      res.json({
        ok:
          result.ok,

        url:
          result.url,

        cdnBase:
          result.cdnBase,

        title:
          result.title,

        id:
          result.id,

        type:
          result.type,

        streams:
          result.streams,
      });

    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          ok: false,
          error:
            error.message,
        });
    }
  }
);


// ============================================================
// Debug: series
// ============================================================

app.get(
  "/debug/series",
  async (req, res) => {
    try {
      const imdb =
        req.query.imdb;

      const season =
        Number(
          req.query.season
        );

      const episode =
        Number(
          req.query.episode
        );

      if (
        !imdb ||
        !Number.isFinite(season) ||
        !Number.isFinite(episode)
      ) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Use ?imdb=tt8595766&season=2&episode=1",
          });
      }

      const result =
        await resolveSeriesEpisode(
          imdb,
          season,
          episode
        );

      res.json(result);

    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          ok: false,
          error:
            error.message,
        });
    }
  }
);


// ============================================================
// Debug: search
// ============================================================

app.get(
  "/debug/search",
  async (req, res) => {
    try {
      const title =
        req.query.title;

      if (!title) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Missing ?title=",
          });
      }

      const data =
        await mxSearch(
          title
        );

      const results =
        flattenSearchResults(
          data
        );

      res.json({
        ok: true,

        query:
          title,

        count:
          results.length,

        results,
      });

    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          ok: false,
          error:
            error.message,
        });
    }
  }
);


// ============================================================
// Debug: movie
// ============================================================

app.get(
  "/debug/movie",
  async (req, res) => {
    try {
      const title =
        req.query.title;

      if (!title) {
        return res
          .status(400)
          .json({
            ok: false,
            error:
              "Missing ?title=",
          });
      }

      const search =
        await mxSearch(
          title
        );

      const movie =
        findBestSearchResult(
          search,
          title,
          "movie"
        );

      if (!movie) {
        throw new Error(
          `MX movie not found: ${title}`
        );
      }

      const url =
        absoluteMxUrl(
          movie.webUrl
        );

      const result =
        await resolveMxPage(
          url
        );

      res.json({
        ok: true,

        searchResult:
          movie,

        result: {
          title:
            result.title,

          id:
            result.id,

          type:
            result.type,

          streams:
            result.streams,
        },
      });

    } catch (error) {
      console.error(error);

      res
        .status(500)
        .json({
          ok: false,
          error:
            error.message,
        });
    }
  }
);


// ============================================================
// Manifest
// ============================================================

app.get(
  "/manifest.json",
  (req, res) => {
    res.json({
      id:
        "com.mxplayer.localresolver",

      version:
        "1.3.0",

      name:
        "MX Player",

      logo:
        "https://archive.org/download/mx-player-logo-450x450/mx-player-logo-450x450.png",

      description:
        "MX Player movies and series stream",

      resources: [
        {
          name:
            "stream",

          types: [
            "movie",
            "series",
          ],

          idPrefixes: [
            "tt",
          ],
        },
      ],

      types: [
        "movie",
        "series",
      ],

      catalogs: [],

      idPrefixes: [
        "tt",
      ],
    });
  }
);


// ============================================================
// Stremio movie
// ============================================================

app.get(
  "/stream/movie/:id.json",
  async (req, res) => {
    try {
      const imdbId =
        req.params.id;

      console.log(
        "Movie request:",
        imdbId
      );

      const meta =
        await getCinemetaMeta(
          imdbId,
          "movie"
        );

      const title =
        meta &&
        meta.meta &&
        meta.meta.name
          ? meta.meta.name
          : null;

      if (!title) {
        return res.json({
          streams: [],
        });
      }

      const search =
        await mxSearch(
          title
        );

      const movie =
        findBestSearchResult(
          search,
          title,
          "movie"
        );

      if (!movie) {
        return res.json({
          streams: [],
        });
      }

      const url =
        absoluteMxUrl(
          movie.webUrl
        );

      const result =
        await resolveMxPage(
          url
        );

      return res.json({
        streams:
          result.streams,
      });

    } catch (error) {
      console.error(
        "Movie resolver error:",
        error
      );

      return res.json({
        streams: [],
      });
    }
  }
);


// ============================================================
// Stremio series
// ============================================================

app.get(
  "/stream/series/:id.json",
  async (req, res) => {
    try {
      const videoId =
        req.params.id;

      console.log(
        "Series request:",
        videoId
      );

      const parts =
        videoId.split(":");

      if (
        parts.length !== 3
      ) {
        return res.json({
          streams: [],
        });
      }

      const imdbId =
        parts[0];

      const season =
        Number(
          parts[1]
        );

      const episode =
        Number(
          parts[2]
        );

      if (
        !/^tt\d+$/i.test(
          imdbId
        ) ||
        !Number.isInteger(
          season
        ) ||
        !Number.isInteger(
          episode
        )
      ) {
        return res.json({
          streams: [],
        });
      }

      const result =
        await resolveSeriesEpisode(
          imdbId,
          season,
          episode
        );

      return res.json({
        streams:
          result.streams,
      });

    } catch (error) {
      console.error(
        "Series resolver error:",
        error
      );

      return res.json({
        streams: [],
      });
    }
  }
);


// ============================================================
// Root
// ============================================================

app.get(
  "/",
  (req, res) => {
    res.send(
      "MX Player Local Resolver is running."
    );
  }
);


// ============================================================
// Start
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `MX Player Local Resolver running on http://127.0.0.1:${PORT}`
    );
  }
);
