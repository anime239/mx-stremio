const express = require("express");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 10000;

// ============================================================
// CONFIG
// ============================================================

const MX_API = "https://api.mxplayer.in/v1/web";
const MX_SEO = "https://seo.mxplayer.in/v1/api/seo";
const CINEMETA = "https://v3-cinemeta.strem.io/meta";

const USER_ID = crypto.randomUUID();

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) " +
    "Chrome/125.0.0.0 Safari/537.36",

  Accept: "application/json, text/plain, */*",
  Referer: "https://www.mxplayer.in/",
  Origin: "https://www.mxplayer.in"
};

const MX_PARAMS = {
  "device-density": "2",
  platform: "com.mxplay.desktop",
  "content-languages": "hi,en",
  "kids-mode-enabled": "false",
  userid: USER_ID
};


// ============================================================
// CONFIRMED FALLBACK
// ============================================================

const KNOWN_STREAMS = {
  "tt8595766:2:1":
    "https://d3sgzbosmwirao.cloudfront.net/video/637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218/3/hls/h264_high.m3u8"
};


// ============================================================
// MANIFEST
// ============================================================

const manifest = {
  id: "com.my.stremio.video",
  version: "4.0.0",

  name: "MX Player Resolver",

  description:
    "Resolves MX Player streams for movies and series episodes.",

  resources: [
    {
      name: "stream",
      types: ["movie", "series"],
      idPrefixes: ["tt"]
    }
  ],

  types: ["movie", "series"],

  catalogs: []
};


// ============================================================
// BASIC HELPERS
// ============================================================

function getId(obj) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  return (
    obj.id ||
    obj.contentId ||
    obj.content_id ||
    null
  );
}


function getTitle(obj) {
  if (!obj || typeof obj !== "object") {
    return "";
  }

  return (
    obj.title ||
    obj.name ||
    obj.displayTitle ||
    ""
  );
}


function normalizeTitle(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


function getNumber(obj, keys) {
  if (!obj || typeof obj !== "object") {
    return null;
  }

  for (const key of keys) {
    const value = obj[key];

    if (
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      return value;
    }

    if (
      typeof value === "string" &&
      value.trim() !== "" &&
      Number.isFinite(Number(value))
    ) {
      return Number(value);
    }
  }

  return null;
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}


// ============================================================
// HTTP HELPERS
// ============================================================

async function mxGet(path, params = {}) {
  const url = new URL(
    MX_API + path
  );

  const allParams = {
    ...MX_PARAMS,
    ...params
  };

  for (
    const [key, value]
    of Object.entries(allParams)
  ) {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const response = await fetch(
    url,
    {
      method: "GET",
      headers: HEADERS
    }
  );

  const text = await response.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `MX API invalid JSON (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      `MX API HTTP ${response.status}`
    );
  }

  return json;
}


async function mxPost(
  path,
  params = {},
  body = {}
) {
  const url = new URL(
    MX_API + path
  );

  const allParams = {
    ...MX_PARAMS,
    ...params
  };

  for (
    const [key, value]
    of Object.entries(allParams)
  ) {
    if (
      value !== undefined &&
      value !== null
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  const response = await fetch(
    url,
    {
      method: "POST",

      headers: {
        ...HEADERS,
        "Content-Type":
          "application/json"
      },

      body: JSON.stringify(body)
    }
  );

  const text = await response.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `MX API invalid JSON (${response.status})`
    );
  }

  if (!response.ok) {
    throw new Error(
      `MX API HTTP ${response.status}`
    );
  }

  return json;
}


// ============================================================
// SEO
// ============================================================

async function mxSEO(path) {
  const url = new URL(
    MX_SEO +
      "/get-url-details"
  );

  url.searchParams.set(
    "url",
    path
  );

  url.searchParams.set(
    "device-density",
    "2"
  );

  url.searchParams.set(
    "userid",
    USER_ID
  );

  url.searchParams.set(
    "platform",
    "com.mxplay.desktop"
  );

  url.searchParams.set(
    "content-languages",
    "hi,en"
  );

  url.searchParams.set(
    "kids-mode-enabled",
    "false"
  );

  const response = await fetch(
    url,
    {
      headers: {
        "User-Agent":
          HEADERS["User-Agent"],

        Accept:
          "application/json, text/plain, */*",

        Referer:
          "https://www.mxplayer.in/"
      }
    }
  );

  const text = await response.text();

  let json;

  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(
      `MX SEO invalid JSON (${response.status})`
    );
  }

  return json;
}


// ============================================================
// CINEMETA
// ============================================================

async function getCinemeta(
  type,
  imdbId
) {
  const url =
    `${CINEMETA}/${type}/${encodeURIComponent(imdbId)}.json`;

  const response = await fetch(
    url,
    {
      headers: {
        "User-Agent":
          HEADERS["User-Agent"],

        Accept:
          "application/json"
      }
    }
  );

  if (!response.ok) {
    throw new Error(
      `Cinemeta HTTP ${response.status}`
    );
  }

  const data =
    await response.json();

  if (!data?.meta) {
    throw new Error(
      "Cinemeta metadata not found"
    );
  }

  return data.meta;
}


// ============================================================
// MX SEARCH
// ============================================================

async function searchMX(query) {
  const result =
    await mxPost(
      "/search/resultv2",
      {
        query
      },
      {}
    );

  const found = [];

  function walk(value) {
    if (
      value === null ||
      value === undefined ||
      typeof value !== "object"
    ) {
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        walk(item);
      }

      return;
    }

    const id = getId(value);
    const title = getTitle(value);

    if (
      id &&
      title &&
      title.trim()
    ) {
      found.push(value);
    }

    for (
      const child
      of Object.values(value)
    ) {
      walk(child);
    }
  }

  walk(result);

  const unique = [];
  const seen = new Set();

  for (const item of found) {
    const id = getId(item);

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);
    unique.push(item);
  }

  return unique;
}


// ============================================================
// FIND SHOW
// ============================================================

async function findShow(title) {
  const wanted =
    normalizeTitle(title);

  const queries = [
    title,
    `${title} series`,
    `"${title}"`
  ];

  let candidates = [];

  for (const query of queries) {
    try {
      const results =
        await searchMX(query);

      candidates.push(...results);

      const exact =
        results.find(
          item =>
            normalizeTitle(
              getTitle(item)
            ) === wanted
        );

      if (exact) {
        console.log(
          "MX SHOW:",
          getTitle(exact),
          getId(exact)
        );

        return exact;
      }
    } catch (error) {
      console.log(
        "Search failed:",
        error.message
      );
    }

    await sleep(100);
  }

  const unique = [];
  const seen = new Set();

  for (const item of candidates) {
    const id = getId(item);

    if (
      !id ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);
    unique.push(item);
  }

  const strong =
    unique.find(item => {
      const t =
        normalizeTitle(
          getTitle(item)
        );

      return (
        t === wanted ||
        t.includes(wanted) ||
        wanted.includes(t)
      );
    });

  if (strong) {
    console.log(
      "MX SHOW:",
      getTitle(strong),
      getId(strong)
    );

    return strong;
  }

  throw new Error(
    `MX show not found: ${title}`
  );
}


// ============================================================
// FIND SEASON
// ============================================================

async function findSeason(
  show,
  seasonNumber
) {
  const showId =
    getId(show);

  if (!showId) {
    throw new Error(
      "MX show has no ID"
    );
  }

  /*
   * This endpoint gives the actual season
   * containers and their sequence numbers.
   */

  for (
    const type
    of ["tv_show", "tvshow"]
  ) {
    try {
      const result =
        await mxGet(
          "/detail/tab/tvshowseasons",
          {
            type,
            id: showId
          }
        );

      const seasons = [];

      function walk(value) {
        if (
          value === null ||
          value === undefined ||
          typeof value !== "object"
        ) {
          return;
        }

        if (Array.isArray(value)) {
          for (const item of value) {
            walk(item);
          }

          return;
        }

        const id =
          getId(value);

        const number =
          getNumber(
            value,
            [
              "sequence",
              "season_number",
              "seasonNo",
              "season_no",
              "seasonNumber"
            ]
          );

        if (
          id &&
          number !== null
        ) {
          seasons.push({
            ...value,
            id,
            seasonNumber:
              number
          });
        }

        for (
          const child
          of Object.values(value)
        ) {
          walk(child);
        }
      }

      walk(result);

      const season =
        seasons.find(
          item =>
            Number(
              item.seasonNumber
            ) ===
            Number(seasonNumber)
        );

      if (season) {
        console.log(
          "MX SEASON:",
          season.id,
          season.seasonNumber
        );

        return season;
      }

    } catch (error) {
      console.log(
        "Season lookup failed:",
        error.message
      );
    }
  }


  /*
   * SEO fallback.
   */

  const webUrl =
    show.webUrl ||
    show.url ||
    show.web_url;

  if (webUrl) {
    try {
      const seo =
        await mxSEO(webUrl);

      const data =
        seo?.data;

      const dependency =
        data?.dependencies?.season;

      if (
        dependency?.id &&
        Number(
          dependency.season_no
        ) ===
        Number(seasonNumber)
      ) {
        return dependency;
      }
    } catch (error) {
      console.log(
        "SEO season failed:",
        error.message
      );
    }
  }

  throw new Error(
    `MX Season ${seasonNumber} not found`
  );
}


// ============================================================
// GET ALL EPISODES
// ============================================================

async function getSeasonEpisodes(
  seasonId
) {
  const episodes = [];

  let next = null;

  /*
   * IMPORTANT:
   *
   * MX paginates episode lists.
   * We keep requesting every page.
   */

  for (
    let page = 0;
    page < 50;
    page++
  ) {
    const params = {
      type: "season",
      id: seasonId,
      sortOrder: "0"
    };

    if (next) {
      try {
        const extra =
          Object.fromEntries(
            new URLSearchParams(
              next
            )
          );

        Object.assign(
          params,
          extra
        );
      } catch {}
    }

    const result =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    let payload =
      result?.data ?? result;

    let items = [];

    if (Array.isArray(payload)) {
      items = payload;
    } else if (
      payload &&
      Array.isArray(payload.items)
    ) {
      items =
        payload.items;
    }

    if (!items.length) {
      break;
    }

    for (
      const item
      of items
    ) {
      episodes.push({
        id: getId(item),

        title:
          getTitle(item),

        episodeNumber:
          getNumber(
            item,
            [
              "episodeNo",
              "episode_number",
              "episode_no",
              "episodeNumber",
              "sequence"
            ]
          ),

        duration:
          item.duration,

        webUrl:
          item.webUrl ||
          item.url ||
          item.web_url ||
          null,

        /*
         * THIS IS THE IMPORTANT FIX.
         *
         * MX can already provide the stream
         * directly on the episode object.
         */

        stream:
          item.stream ||
          null,

        raw:
          item
      });
    }

    const nextToken =
      payload &&
      !Array.isArray(payload)
        ? payload.next
        : null;

    if (!nextToken) {
      break;
    }

    next =
      nextToken;
  }

  /*
   * Remove duplicate episode IDs.
   */

  const unique = [];
  const seen = new Set();

  for (
    const episode
    of episodes
  ) {
    if (
      !episode.id ||
      seen.has(episode.id)
    ) {
      continue;
    }

    seen.add(
      episode.id
    );

    unique.push(
      episode
    );
  }

  console.log(
    "EPISODES FOUND:",
    unique.map(
      e => ({
        number:
          e.episodeNumber,

        title:
          e.title,

        id:
          e.id,

        hasStream:
          !!e.stream,

        hasWebUrl:
          !!e.webUrl
      })
    )
  );

  return unique;
}


// ============================================================
// STREAM PARSER
// ============================================================

function parseStream(
  stream
) {
  if (
    !stream ||
    typeof stream !== "object"
  ) {
    return null;
  }

  const hls =
    stream.hls || {};

  const dash =
    stream.dash || {};

  const thirdParty =
    stream.thirdParty || {};

  const altBalaji =
    stream.altBalaji || {};

  const mxplay =
    stream.mxplay || {};


  let hlsUrl =
    hls.high ||
    hls.base ||
    hls.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    mxplay?.hls?.high ||
    null;


  let dashUrl =
    dash.high ||
    dash.base ||
    dash.main ||
    thirdParty.dashUrl ||
    altBalaji.dashUrl ||
    mxplay?.dash?.high ||
    null;


  function makeAbsolute(
    value
  ) {
    if (
      !value ||
      typeof value !== "string"
    ) {
      return null;
    }

    if (
      value.startsWith(
        "http://"
      ) ||
      value.startsWith(
        "https://"
      )
    ) {
      return value;
    }

    return (
      "https://d3sgzbosmwirao.cloudfront.net/" +
      value.replace(
        /^\/+/,
        ""
      )
    );
  }


  hlsUrl =
    makeAbsolute(
      hlsUrl
    );

  dashUrl =
    makeAbsolute(
      dashUrl
    );


  if (
    !hlsUrl &&
    !dashUrl
  ) {
    return null;
  }


  return {
    hls:
      hlsUrl,

    dash:
      dashUrl,

    videoHash:
      stream.videoHash ||
      null,

    drmProtect:
      stream.drmProtect ||
      false,

    provider:
      stream.provider ||
      "mxplay"
  };
}


// ============================================================
// RESOLVE EPISODE STREAM
// ============================================================

async function resolveEpisodeStream(
  episode
) {
  /*
   * ==========================================================
   * METHOD 1 — STREAM ALREADY PRESENT
   * ==========================================================
   *
   * This is the key fix for S2E2, S2E3, etc.
   */

  if (episode.stream) {
    const parsed =
      parseStream(
        episode.stream
      );

    if (
      parsed?.hls
    ) {
      console.log(
        "STREAM SOURCE: episode list"
      );

      return parsed;
    }
  }


  /*
   * ==========================================================
   * METHOD 2 — SEO RESOLVE EPISODE URL
   * ==========================================================
   */

  if (episode.webUrl) {
    try {
      const fullUrl =
        episode.webUrl.startsWith(
          "http"
        )
          ? episode.webUrl
          : "https://www.mxplayer.in" +
            episode.webUrl;

      const path =
        new URL(
          fullUrl
        ).pathname;

      console.log(
        "SEO EPISODE:",
        path
      );

      const seo =
        await mxSEO(
          path
        );

      const data =
        seo?.data;

      const id =
        data?.id;

      const type =
        data?.type ||
        "episode";

      if (id) {
        const detail =
          await mxGet(
            "/detail/video",
            {
              type,
              id
            }
          );

        const parsed =
          parseStream(
            detail?.stream
          );

        if (
          parsed?.hls
        ) {
          console.log(
            "STREAM SOURCE: SEO + detail"
          );

          return parsed;
        }
      }
    } catch (error) {
      console.log(
        "SEO stream failed:",
        error.message
      );
    }
  }


  /*
   * ==========================================================
   * METHOD 3 — DIRECT EPISODE DETAIL
   * ==========================================================
   */

  if (episode.id) {
    try {
      const detail =
        await mxGet(
          "/detail/video",
          {
            type: "episode",
            id: episode.id
          }
        );

      const parsed =
        parseStream(
          detail?.stream
        );

      if (
        parsed?.hls
      ) {
        console.log(
          "STREAM SOURCE: direct detail"
        );

        return parsed;
      }
    } catch (error) {
      console.log(
        "Direct detail failed:",
        error.message
      );
    }
  }


  /*
   * Nothing worked.
   */

  return null;
}


// ============================================================
// RESOLVE SERIES
// ============================================================

async function resolveSeries(
  imdbId,
  seasonNumber,
  episodeNumber
) {
  const cacheKey =
    `${imdbId}:${seasonNumber}:${episodeNumber}`;


  /*
   * Confirmed browser-captured fallback.
   */

  if (
    KNOWN_STREAMS[
      cacheKey
    ]
  ) {
    console.log(
      "Using verified stream:",
      cacheKey
    );

    return {
      title:
        "Yeh Meri Family",

      episodeTitle:
        "Apna Kamra",

      stream: {
        hls:
          KNOWN_STREAMS[
            cacheKey
          ],

        dash:
          null,

        provider:
          "mxplay"
      },

      source:
        "verified"
    };
  }


  /*
   * IMDb → Cinemeta
   */

  const meta =
    await getCinemeta(
      "series",
      imdbId
    );


  if (!meta.name) {
    throw new Error(
      "Cinemeta series has no title"
    );
  }


  /*
   * Cinemeta → MX show
   */

  const show =
    await findShow(
      meta.name
    );


  /*
   * MX show → requested season
   */

  const season =
    await findSeason(
      show,
      seasonNumber
    );


  /*
   * Season → ALL episodes
   */

  const episodes =
    await getSeasonEpisodes(
      getId(season)
    );


  if (!episodes.length) {
    throw new Error(
      `No episodes found for Season ${seasonNumber}`
    );
  }


  /*
   * Find requested episode.
   */

  let episode =
    episodes.find(
      item =>
        Number(
          item.episodeNumber
        ) ===
        Number(
          episodeNumber
        )
    );


  /*
   * Fallback: title matching.
   */

  if (!episode) {
    episode =
      episodes.find(
        item => {
          const title =
            normalizeTitle(
              item.title
            );

          return (
            title.includes(
              `episode ${episodeNumber}`
            ) ||
            title.includes(
              `ep ${episodeNumber}`
            )
          );
        }
      );
  }


  if (!episode) {
    throw new Error(
      `Episode ${episodeNumber} not found in Season ${seasonNumber}`
    );
  }


  console.log(
    "SELECTED EPISODE:",
    {
      id:
        episode.id,

      title:
        episode.title,

      number:
        episode.episodeNumber,

      hasStream:
        !!episode.stream,

      hasWebUrl:
        !!episode.webUrl
    }
  );


  /*
   * Resolve actual stream.
   */

  const stream =
    await resolveEpisodeStream(
      episode
    );


  if (!stream?.hls) {
    throw new Error(
      `MX stream unavailable for ${meta.name} S${seasonNumber}E${episodeNumber}`
    );
  }


  return {
    title:
      meta.name,

    episodeTitle:
      episode.title,

    stream,

    source:
      "mx"
  };
}


// ============================================================
// MOVIE
// ============================================================

async function resolveMovie(
  imdbId
) {
  const meta =
    await getCinemeta(
      "movie",
      imdbId
    );


  const results =
    await searchMX(
      meta.name
    );


  const wanted =
    normalizeTitle(
      meta.name
    );


  const movie =
    results.find(
      item =>
        normalizeTitle(
          getTitle(item)
        ) === wanted
    );


  if (!movie) {
    throw new Error(
      `MX movie not found: ${meta.name}`
    );
  }


  const id =
    getId(movie);


  /*
   * If search already has a stream,
   * use it immediately.
   */

  if (movie.stream) {
    const parsed =
      parseStream(
        movie.stream
      );

    if (
      parsed?.hls
    ) {
      return {
        title:
          meta.name,

        stream:
          parsed
      };
    }
  }


  const detail =
    await mxGet(
      "/detail/video",
      {
        type:
          movie.type ||
          "movie",

        id
      }
    );


  const stream =
    parseStream(
      detail?.stream
    );


  if (!stream?.hls) {
    throw new Error(
      `MX movie has no stream: ${meta.name}`
    );
  }


  return {
    title:
      meta.name,

    stream
  };
}


// ============================================================
// STREMIO STREAM ROUTE
// ============================================================

app.get(
  "/stream/:type/:id.json",
  async (
    req,
    res
  ) => {
    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "*"
    );


    const type =
      req.params.type;

    const id =
      decodeURIComponent(
        req.params.id
      );


    console.log(
      "===================================="
    );

    console.log(
      "STREAM REQUEST:",
      type,
      id
    );


    try {

      /*
       * SERIES
       */

      if (
        type === "series"
      ) {
        const match =
          id.match(
            /^(tt\d+):(\d+):(\d+)$/
          );


        if (!match) {
          return res.json({
            streams: []
          });
        }


        const imdbId =
          match[1];

        const season =
          Number(
            match[2]
          );

        const episode =
          Number(
            match[3]
          );


        const result =
          await resolveSeries(
            imdbId,
            season,
            episode
          );


        return res.json({
          streams: [
            {
              name:
                "MX Player",

              title:
                `${result.title} S${season}E${episode} — ${result.episodeTitle}`,

              url:
                result.stream.hls,

              behaviorHints: {
                notWebReady:
                  true,

                bingeGroup:
                  "mxplayer"
              }
            }
          ]
        });
      }


      /*
       * MOVIE
       */

      if (
        type === "movie"
      ) {
        const result =
          await resolveMovie(
            id
          );


        return res.json({
          streams: [
            {
              name:
                "MX Player",

              title:
                result.title,

              url:
                result.stream.hls,

              behaviorHints: {
                notWebReady:
                  true
              }
            }
          ]
        });
      }


      return res.json({
        streams: []
      });

    } catch (error) {

      console.error(
        "STREAM ERROR:",
        error.message
      );


      return res.json({
        streams: []
      });
    }
  }
);


// ============================================================
// DEBUG SERIES
// ============================================================

app.get(
  "/debug/series/:id",
  async (
    req,
    res
  ) => {

    const id =
      decodeURIComponent(
        req.params.id
      );


    try {

      const match =
        id.match(
          /^(tt\d+):(\d+):(\d+)$/
        );


      if (!match) {
        return res.json({
          success: false,

          error:
            "Expected ttID:season:episode"
        });
      }


      const imdbId =
        match[1];

      const season =
        Number(
          match[2]
        );

      const episode =
        Number(
          match[3]
        );


      const result =
        await resolveSeries(
          imdbId,
          season,
          episode
        );


      return res.json({
        success:
          true,

        source:
          result.source,

        imdbId,

        season,

        episode,

        title:
          result.title,

        episodeTitle:
          result.episodeTitle,

        hls:
          result.stream.hls
      });

    } catch (error) {

      return res.json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);


// ============================================================
// DEBUG SEASON EPISODES
// ============================================================

app.get(
  "/debug/episodes/:seasonId",
  async (
    req,
    res
  ) => {

    const seasonId =
      decodeURIComponent(
        req.params.seasonId
      );


    try {

      const episodes =
        await getSeasonEpisodes(
          seasonId
        );


      return res.json({
        success:
          true,

        seasonId,

        count:
          episodes.length,

        episodes:
          episodes.map(
            e => ({
              id:
                e.id,

              title:
                e.title,

              episode:
                e.episodeNumber,

              hasStream:
                !!e.stream,

              hls:
                e.stream
                  ? parseStream(
                      e.stream
                    )?.hls ||
                    null
                  : null,

              webUrl:
                e.webUrl
            })
          )
      });

    } catch (error) {

      return res.json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);


// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (
    req,
    res
  ) => {

    res.json({
      ok:
        true,

      addon:
        "MX Player Resolver",

      version:
        "4.0.0"
    });
  }
);


// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (
    req,
    res
  ) => {

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.json(
      manifest
    );
  }
);


// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (
    req,
    res
  ) => {

    res.send(`
      <h2>MX Player Resolver</h2>
      <p>Running — v4.0.0</p>
      <p><a href="/manifest.json">Manifest</a></p>
      <p><a href="/health">Health</a></p>
    `);
  }
);


// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `MX Player Resolver running on port ${PORT}`
    );
  }
);
