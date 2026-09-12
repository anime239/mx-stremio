const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

const VERSION = "6.0.0";

// ============================================================
// CONFIG
// ============================================================

const API_BASE =
  "https://api.mxplayer.in/v1/web";

const SEO_BASE =
  "https://seo.mxplayer.in/v1/api/seo";

const MX_SITE =
  "https://www.mxplayer.in";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/125.0.0.0 Safari/537.36";

const CONTENT_LANGUAGES =
  "hi,mr,pa,bn,en,ml,kn,gu,te,ta";

let USER_ID = makeUUID();

function makeUUID() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    function (c) {
      const r = Math.random() * 16 | 0;
      const v =
        c === "x"
          ? r
          : (r & 0x3) | 0x8;

      return v.toString(16);
    }
  );
}

// ============================================================
// VERIFIED CONTENT MAP
// ============================================================
//
// We use this to bypass MX search for content where we already
// know the official MX Player page.
//
// This does NOT contain a stream URL. It only identifies the
// public MX Player page for the show.
//
// ============================================================

const KNOWN_SHOWS = {
  "tt8595766": {
    title: "Yeh Meri Family",

    webUrl:
      "https://www.mxplayer.in/show/watch-yeh-meri-family/online-0f96e29c17b376b5ea2dab191ab97d83",

    seasons: {
      "2": {
        id:
          "1a8452f31b2fcff5e495b44afdb3fbdb",

        webUrl:
          "https://www.mxplayer.in/show/watch-yeh-meri-family/seasons/season-2-1a8452f31b2fcff5e495b44afdb3fbdb"
      }
    }
  }
};

// ============================================================
// VERIFIED STREAM FALLBACK
// ============================================================
//
// Only S2E1 has been personally verified from the browser
// Network request.
//
// ============================================================

const KNOWN_STREAMS = {
  "tt8595766:2:1":
    "https://d3sgzbosmwirao.cloudfront.net/video/637eda9d371fa6ddeac209e765b524413fa1cdd15e34d0da6ece4fc9c6706218/3/hls/h264_high.m3u8"
};

// ============================================================
// HTTP HELPERS
// ============================================================

async function request(
  url,
  options = {}
) {
  const controller =
    new AbortController();

  const timeout =
    setTimeout(
      () => controller.abort(),
      options.timeout || 20000
    );

  try {
    const response =
      await fetch(url, {
        method:
          options.method || "GET",

        headers: {
          "User-Agent":
            USER_AGENT,

          "Accept":
            options.accept ||
            "application/json, text/plain, */*",

          "Referer":
            "https://www.mxplayer.in/",

          "Origin":
            "https://www.mxplayer.in",

          ...(options.headers || {})
        },

        body:
          options.body,

        signal:
          controller.signal
      });

    const text =
      await response.text();

    let json = null;

    try {
      json =
        JSON.parse(text);
    } catch {
      // Not JSON.
    }

    return {
      ok:
        response.ok,

      status:
        response.status,

      json,

      text:
        text.substring(0, 5000)
    };

  } catch (error) {

    return {
      ok: false,
      status: 0,
      json: null,
      text: "",
      error:
        error.message
    };

  } finally {

    clearTimeout(timeout);
  }
}

// ============================================================
// MX COMMON QUERY PARAMETERS
// ============================================================

function commonParams() {
  return {
    "device-density":
      "2",

    "platform":
      "com.mxplay.desktop",

    "content-languages":
      CONTENT_LANGUAGES,

    "kids-mode-enabled":
      "false",

    userid:
      USER_ID
  };
}

function makeUrl(
  base,
  path,
  params = {}
) {
  const url =
    new URL(
      base + path
    );

  const all = {
    ...commonParams(),
    ...params
  };

  for (
    const [key, value]
    of Object.entries(all)
  ) {

    if (
      value !== undefined &&
      value !== null &&
      value !== ""
    ) {
      url.searchParams.set(
        key,
        String(value)
      );
    }
  }

  return url.toString();
}

// ============================================================
// MX GET
// ============================================================

async function mxGet(
  path,
  params = {}
) {
  const url =
    makeUrl(
      API_BASE,
      path,
      params
    );

  console.log(
    "[MX GET]",
    url
  );

  const result =
    await request(
      url
    );

  return {
    ...result,
    url
  };
}

// ============================================================
// MX POST
// ============================================================
//
// IMPORTANT:
// search/resultv2 is POST in the current MX API client.
// ============================================================

async function mxPost(
  path,
  body = {},
  params = {}
) {
  const url =
    makeUrl(
      API_BASE,
      path,
      params
    );

  console.log(
    "[MX POST]",
    url,
    JSON.stringify(body)
  );

  const result =
    await request(
      url,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify(body)
      }
    );

  return {
    ...result,
    url
  };
}

// ============================================================
// SEO
// ============================================================

async function mxSeo(
  pageUrl
) {
  let path =
    pageUrl;

  try {
    if (
      pageUrl.startsWith(
        "http://"
      ) ||
      pageUrl.startsWith(
        "https://"
      )
    ) {
      path =
        new URL(
          pageUrl
        ).pathname;
    }
  } catch {
    return {
      success: false,
      error:
        "Invalid MX URL"
    };
  }

  if (
    !path.startsWith("/")
  ) {
    path =
      "/" + path;
  }

  const url =
    makeUrl(
      SEO_BASE,
      "/get-url-details",
      {
        url:
          path
      }
    );

  console.log(
    "[MX SEO]",
    url
  );

  const result =
    await request(
      url
    );

  if (
    !result.ok ||
    !result.json
  ) {
    return {
      success: false,
      error:
        "MX SEO request failed",

      status:
        result.status,

      raw:
        result.text
    };
  }

  const data =
    result.json.data;

  if (!data) {
    return {
      success: false,
      error:
        "MX SEO returned no data",

      raw:
        result.json
    };
  }

  return {
    success: true,
    data:
      data,

    raw:
      result.json
  };
}

// ============================================================
// STREAM PARSER
// ============================================================

function normalizeStreamUrl(
  url
) {
  if (!url) {
    return null;
  }

  if (
    url.startsWith(
      "http://"
    ) ||
    url.startsWith(
      "https://"
    )
  ) {
    return url;
  }

  return (
    "https://d3sgzbosmwirao.cloudfront.net/" +
    String(url)
      .replace(/^\/+/, "")
  );
}

function parseStream(
  stream
) {
  if (
    !stream ||
    typeof stream !== "object"
  ) {
    return {
      hls: null,
      dash: null,
      videoHash: null,
      drmProtect: false,
      provider: null
    };
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

  const hlsUrl =
    hls.high ||
    hls.base ||
    hls.main ||
    thirdParty.hlsUrl ||
    altBalaji.hlsUrl ||
    (
      mxplay.hls &&
      (
        mxplay.hls.high ||
        mxplay.hls.base ||
        mxplay.hls.main
      )
    );

  const dashUrl =
    dash.high ||
    dash.base ||
    dash.main ||
    thirdParty.dashUrl ||
    altBalaji.dashUrl ||
    (
      mxplay.dash &&
      (
        mxplay.dash.high ||
        mxplay.dash.base ||
        mxplay.dash.main
      )
    );

  return {
    hls:
      normalizeStreamUrl(
        hlsUrl
      ),

    dash:
      normalizeStreamUrl(
        dashUrl
      ),

    videoHash:
      stream.videoHash ||
      null,

    drmProtect:
      Boolean(
        stream.drmProtect
      ),

    provider:
      stream.provider ||
      null,

    aspectRatio:
      stream.aspectRatio ||
      null
  };
}

// ============================================================
// DETAIL VIDEO
// ============================================================

async function getVideoDetail(
  id,
  type = "episode"
) {
  if (!id) {
    return {
      success: false,
      error:
        "Missing content ID"
    };
  }

  const result =
    await mxGet(
      "/detail/video",
      {
        id,
        type
      }
    );

  if (
    !result.ok ||
    !result.json
  ) {
    return {
      success: false,

      error:
        "MX detail/video failed",

      status:
        result.status,

      raw:
        result.text
    };
  }

  const data =
    result.json;

  return {
    success: true,

    data,

    stream:
      parseStream(
        data.stream
      )
  };
}

// ============================================================
// NEXT VIDEO
// ============================================================

async function getNextVideo(
  id
) {
  const result =
    await mxGet(
      "/detail/nextVideo",
      {
        id,
        type: "episode"
      }
    );

  if (
    !result.ok ||
    !result.json
  ) {
    return {
      success: false,

      status:
        result.status,

      raw:
        result.text
    };
  }

  return {
    success: true,

    data:
      result.json
  };
}

// ============================================================
// SEARCH — CORRECT POST VERSION
// ============================================================

async function searchShow(
  title
) {
  const result =
    await mxPost(
      "/search/resultv2",
      {
        query:
          title
      }
    );

  if (
    !result.ok ||
    !result.json
  ) {
    return {
      success: false,

      error:
        "MX search failed",

      status:
        result.status,

      raw:
        result.text
    };
  }

  const root =
    result.json.data !== undefined
      ? result.json.data
      : result.json;

  const sections =
    root &&
    Array.isArray(
      root.sections
    )
      ? root.sections
      : [];

  const matches = [];

  for (
    const section
    of sections
  ) {

    const items =
      Array.isArray(
        section.items
      )
        ? section.items
        : [];

    for (
      const item
      of items
    ) {

      if (
        item &&
        item.id &&
        (
          item.type ===
            "tvshow" ||
          item.type ===
            "tv_show"
        )
      ) {
        matches.push(
          item
        );
      }
    }
  }

  const wanted =
    title
      .trim()
      .toLowerCase();

  let match =
    matches.find(
      item =>
        String(
          item.title || ""
        )
          .trim()
          .toLowerCase() ===
        wanted
    );

  if (!match) {

    const normalize =
      value =>
        String(
          value || ""
        )
          .toLowerCase()
          .replace(
            /[^\p{L}\p{N}]+/gu,
            " "
          )
          .trim();

    const wantedNorm =
      normalize(
        title
      );

    match =
      matches.find(
        item =>
          normalize(
            item.title
          ) ===
          wantedNorm
      );
  }

  if (!match) {

    match =
      matches.find(
        item => {

          const candidate =
            String(
              item.title ||
              ""
            )
              .toLowerCase();

          return (
            candidate.includes(
              wanted
            ) ||
            wanted.includes(
              candidate
            )
          );
        }
      );
  }

  if (!match) {
    return {
      success: false,

      error:
        "MX show not found",

      candidates:
        matches
          .slice(0, 20)
          .map(
            item => ({
              id:
                item.id,

              title:
                item.title,

              webUrl:
                item.webUrl
            })
          )
    };
  }

  return {
    success: true,

    show:
      match
  };
}

// ============================================================
// CINEMETA
// ============================================================

async function getCinemeta(
  imdbId
) {
  const url =
    `https://v3-cinemeta.strem.io/meta/series/${encodeURIComponent(imdbId)}.json`;

  const result =
    await request(
      url,
      {
        timeout: 15000
      }
    );

  if (
    result.ok &&
    result.json &&
    result.json.meta
  ) {
    return result.json.meta;
  }

  return null;
}

// ============================================================
// SHOW RESOLUTION
// ============================================================

async function resolveShow(
  imdbId
) {
  // ----------------------------------------------------------
  // FIRST: known exact MX mapping
  // ----------------------------------------------------------

  if (
    KNOWN_SHOWS[imdbId]
  ) {
    console.log(
      "[SHOW] Using known MX page for",
      imdbId
    );

    return {
      success: true,

      show:
        KNOWN_SHOWS[imdbId]
    };
  }

  // ----------------------------------------------------------
  // SECOND: Cinemeta title → correct POST search
  // ----------------------------------------------------------

  const meta =
    await getCinemeta(
      imdbId
    );

  const title =
    meta &&
    meta.name
      ? meta.name
      : imdbId;

  console.log(
    "[SHOW] Searching MX for",
    title
  );

  const search =
    await searchShow(
      title
    );

  if (
    !search.success
  ) {
    return search;
  }

  return {
    success: true,

    show:
      search.show
  };
}

// ============================================================
// SEASON EPISODES
// ============================================================

async function getSeasonEpisodes(
  seasonId
) {
  const episodes = [];

  let nextToken =
    null;

  const seenTokens =
    new Set();

  for (
    let page = 0;
    page < 20;
    page++
  ) {

    const params = {
      type:
        "season",

      id:
        seasonId,

      sortOrder:
        "0"
    };

    // MX returns its next pagination token
    // as a query-string fragment.
    if (
      nextToken
    ) {

      try {

        const parsed =
          new URLSearchParams(
            nextToken
          );

        for (
          const [
            key,
            value
          ]
          of parsed.entries()
        ) {

          params[key] =
            value;
        }

      } catch {
        // Continue without malformed token.
      }
    }

    const result =
      await mxGet(
        "/detail/tab/tvshowepisodes",
        params
      );

    if (
      !result.ok ||
      !result.json
    ) {

      return {
        success: false,

        error:
          "MX season episodes request failed",

        status:
          result.status,

        raw:
          result.text,

        episodes
      };
    }

    const root =
      result.json;

    let payload =
      root.data !== undefined
        ? root.data
        : root;

    let items = [];

    if (
      Array.isArray(
        payload
      )
    ) {

      items =
        payload;

    } else if (
      payload &&
      Array.isArray(
        payload.items
      )
    ) {

      items =
        payload.items;
    }

    console.log(
      "[EPISODE PAGE]",
      page + 1,
      "items:",
      items.length
    );

    if (
      !items.length
    ) {
      break;
    }

    for (
      const item
      of items
    ) {

      if (
        !item ||
        !item.id
      ) {
        continue;
      }

      episodes.push({
        id:
          item.id,

        title:
          item.title ||
          null,

        episodeNo:
          item.episodeNo ??
          item.episode_number ??
          item.episodeNumber ??
          null,

        duration:
          item.duration ||
          null,

        webUrl:
          item.webUrl ||
          null,

        stream:
          parseStream(
            item.stream
          )
      });
    }

    const next =
      payload &&
      typeof payload ===
        "object"
        ? payload.next
        : null;

    if (!next) {
      break;
    }

    if (
      seenTokens.has(
        next
      )
    ) {
      break;
    }

    seenTokens.add(
      next
    );

    nextToken =
      next;
  }

  // Remove duplicates.
  const seen =
    new Set();

  const clean =
    episodes.filter(
      episode => {

        if (
          seen.has(
            episode.id
          )
        ) {
          return false;
        }

        seen.add(
          episode.id
        );

        return true;
      }
    );

  return {
    success: true,

    episodes:
      clean
  };
}

// ============================================================
// RESOLVE EPISODE URL
// ============================================================

async function resolveEpisodeUrl(
  webUrl
) {
  if (!webUrl) {
    return {
      success: false,

      error:
        "Episode has no webUrl"
    };
  }

  const seo =
    await mxSeo(
      webUrl
    );

  if (
    !seo.success
  ) {
    return seo;
  }

  const data =
    seo.data;

  if (
    !data.id
  ) {
    return {
      success: false,

      error:
        "SEO did not return content ID",

      seo
    };
  }

  const id =
    data.id;

  const type =
    data.type ||
    "episode";

  console.log(
    "[EPISODE SEO]",
    data.title,
    id,
    type
  );

  const detail =
    await getVideoDetail(
      id,
      type
    );

  if (
    !detail.success
  ) {
    return {
      success: false,

      error:
        "Episode detail failed",

      detail,

      seo
    };
  }

  return {
    success: true,

    id,

    type,

    title:
      detail.data.title ||
      data.title ||
      null,

    stream:
      detail.stream,

    detail:
      detail.data,

    seo:
      data
  };
}

// ============================================================
// RESOLVE TARGET EPISODE
// ============================================================

async function resolveEpisode(
  episode,
  allEpisodes,
  episodeNumber
) {
  // ----------------------------------------------------------
  // 1. Stream already present in season response
  // ----------------------------------------------------------

  if (
    episode.stream &&
    episode.stream.hls
  ) {

    console.log(
      "[STREAM] Season API already supplied HLS"
    );

    return {
      success: true,

      source:
        "season-api",

      id:
        episode.id,

      title:
        episode.title,

      stream:
        episode.stream
    };
  }

  // ----------------------------------------------------------
  // 2. Episode webUrl → SEO → detail
  // ----------------------------------------------------------

  if (
    episode.webUrl
  ) {

    console.log(
      "[STREAM] Episode URL → SEO → detail"
    );

    const result =
      await resolveEpisodeUrl(
        episode.webUrl
      );

    if (
      result.success &&
      result.stream &&
      result.stream.hls
    ) {

      return {
        ...result,

        source:
          "episode-url-seo"
      };
    }

    console.log(
      "[STREAM] Episode SEO path did not return HLS"
    );
  }

  // ----------------------------------------------------------
  // 3. Direct episode ID → detail
  // ----------------------------------------------------------

  if (
    episode.id
  ) {

    console.log(
      "[STREAM] Direct episode detail"
    );

    const detail =
      await getVideoDetail(
        episode.id,
        "episode"
      );

    if (
      detail.success &&
      detail.stream &&
      detail.stream.hls
    ) {

      return {
        success: true,

        source:
          "episode-detail",

        id:
          episode.id,

        title:
          detail.data.title ||
          episode.title,

        stream:
          detail.stream,

        detail:
          detail.data
      };
    }

    console.log(
      "[STREAM] Direct detail did not return HLS"
    );
  }

  // ----------------------------------------------------------
  // 4. Previous episode → nextVideo
  // ----------------------------------------------------------

  if (
    Number(
      episodeNumber
    ) > 1
  ) {

    const previous =
      allEpisodes.find(
        ep =>
          Number(
            ep.episodeNo
          ) ===
          Number(
            episodeNumber
          ) - 1
      );

    if (
      previous &&
      previous.id
    ) {

      console.log(
        "[STREAM] Previous episode → nextVideo",
        previous.id
      );

      const next =
        await getNextVideo(
          previous.id
        );

      if (
        next.success
      ) {

        const data =
          next.data;

        const candidate =
          extractNextEpisode(
            data
          );

        if (
          candidate
        ) {

          console.log(
            "[NEXT VIDEO]",
            JSON.stringify(
              candidate
            )
          );

          if (
            candidate.webUrl
          ) {

            const resolved =
              await resolveEpisodeUrl(
                candidate.webUrl
              );

            if (
              resolved.success &&
              resolved.stream &&
              resolved.stream.hls
            ) {

              return {
                ...resolved,

                source:
                  "next-video-seo"
              };
            }
          }

          if (
            candidate.id
          ) {

            const detail =
              await getVideoDetail(
                candidate.id,
                candidate.type ||
                  "episode"
              );

            if (
              detail.success &&
              detail.stream &&
              detail.stream.hls
            ) {

              return {
                success: true,

                source:
                  "next-video-detail",

                id:
                  candidate.id,

                title:
                  detail.data.title ||
                  candidate.title ||
                  episode.title,

                stream:
                  detail.stream,

                detail:
                  detail.data
              };
            }
          }
        }
      }
    }
  }

  return {
    success: false,

    error:
      "All episode resolution methods failed"
  };
}

// ============================================================
// NEXT VIDEO PARSER
// ============================================================

function extractNextEpisode(
  root
) {
  if (
    !root ||
    typeof root !==
      "object"
  ) {
    return null;
  }

  const candidates = [];

  function add(
    obj
  ) {
    if (
      !obj ||
      typeof obj !==
        "object"
    ) {
      return;
    }

    const id =
      obj.id ||
      obj.contentId ||
      obj.videoId;

    if (!id) {
      return;
    }

    candidates.push({
      id,

      type:
        obj.type ||
        "episode",

      title:
        obj.title ||
        obj.name ||
        null,

      webUrl:
        obj.webUrl ||
        obj.url ||
        null
    });
  }

  add(root);
  add(root.data);
  add(root.nextVideo);

  if (
    root.data
  ) {
    add(
      root.data.nextVideo
    );
  }

  if (
    Array.isArray(
      root.items
    )
  ) {

    for (
      const item
      of root.items
    ) {
      add(item);
    }
  }

  if (
    root.data &&
    Array.isArray(
      root.data.items
    )
  ) {

    for (
      const item
      of root.data.items
    ) {
      add(item);
    }
  }

  return (
    candidates[0] ||
    null
  );
}

// ============================================================
// MAIN RESOLVER
// ============================================================

async function resolveSeries(
  imdbId,
  seasonNumber,
  episodeNumber
) {
  const cacheKey =
    `${imdbId}:${seasonNumber}:${episodeNumber}`;

  console.log(
    "\n=========================================="
  );

  console.log(
    "[RESOLVE]",
    cacheKey
  );

  console.log(
    "=========================================="
  );

  // ----------------------------------------------------------
  // VERIFIED S2E1
  // ----------------------------------------------------------

  if (
    KNOWN_STREAMS[
      cacheKey
    ]
  ) {

    return {
      success: true,

      source:
        "verified-browser-stream",

      imdbId,

      season:
        seasonNumber,

      episode:
        episodeNumber,

      title:
        "Yeh Meri Family",

      episodeTitle:
        "Apna Kamra",

      hls:
        KNOWN_STREAMS[
          cacheKey
        ]
    };
  }

  // ----------------------------------------------------------
  // SHOW
  // ----------------------------------------------------------

  const showResult =
    await resolveShow(
      imdbId
    );

  if (
    !showResult.success
  ) {

    return {
      success: false,

      error:
        "Could not resolve MX show",

      imdbId,

      season:
        seasonNumber,

      episode:
        episodeNumber,

      detail:
        showResult
    };
  }

  const show =
    showResult.show;

  console.log(
    "[SHOW]",
    show.title,
    show.webUrl
  );

  // ----------------------------------------------------------
  // SEASON
  // ----------------------------------------------------------

  let season = null;

  // Known exact season.
  if (
    KNOWN_SHOWS[
      imdbId
    ] &&
    KNOWN_SHOWS[
      imdbId
    ].seasons &&
    KNOWN_SHOWS[
      imdbId
    ].seasons[
      String(
        seasonNumber
      )
    ]
  ) {

    season =
      KNOWN_SHOWS[
        imdbId
      ].seasons[
        String(
          seasonNumber
        )
      ];

    console.log(
      "[SEASON] Using known season:",
      season.id
    );
  }

  // ----------------------------------------------------------
  // If not known, SEO-resolve the show page.
  // ----------------------------------------------------------

  if (!season) {

    const seo =
      await mxSeo(
        show.webUrl
      );

    if (
      seo.success
    ) {

      const data =
        seo.data;

      const dependency =
        data.dependencies &&
        data.dependencies.season;

      if (
        dependency &&
        dependency.id
      ) {

        const dependencyNo =
          Number(
            dependency.season_no ??
            dependency.seasonNo ??
            dependency.sequence
          );

        if (
          !Number.isFinite(
            dependencyNo
          ) ||
          dependencyNo ===
            Number(
              seasonNumber
            )
        ) {

          season = {
            id:
              dependency.id,

            name:
              dependency.name ||
              `Season ${seasonNumber}`,

            seasonNo:
              Number.isFinite(
                dependencyNo
              )
                ? dependencyNo
                : Number(
                    seasonNumber
                  ),

            webUrl:
              dependency.url ||
              null
          };
        }
      }
    }
  }

  if (!season) {

    return {
      success: false,

      error:
        `Could not resolve Season ${seasonNumber}`,

      show
    };
  }

  console.log(
    "[SEASON]",
    season.id
  );

  // ----------------------------------------------------------
  // EPISODES
  // ----------------------------------------------------------

  const episodeResult =
    await getSeasonEpisodes(
      season.id
    );

  if (
    !episodeResult.success
  ) {

    return {
      success: false,

      error:
        episodeResult.error,

      season,

      detail:
        episodeResult
    };
  }

  const episodes =
    episodeResult.episodes;

  console.log(
    "[EPISODES]",
    episodes.length
  );

  for (
    const ep
    of episodes
  ) {

    console.log(
      "[EP]",
      ep.episodeNo,
      "|",
      ep.title,
      "|",
      ep.id,
      "|",
      ep.webUrl,
      "|",
      ep.stream.hls
        ? "HLS"
        : "NO HLS"
    );
  }

  // ----------------------------------------------------------
  // FIND EXACT EPISODE
  // ----------------------------------------------------------

  let episode =
    episodes.find(
      ep =>
        Number(
          ep.episodeNo
        ) ===
        Number(
          episodeNumber
        )
    );

  // Fallback to position.
  if (!episode) {

    const index =
      Number(
        episodeNumber
      ) - 1;

    if (
      index >= 0 &&
      index <
        episodes.length
    ) {

      episode =
        episodes[index];
    }
  }

  if (!episode) {

    return {
      success: false,

      error:
        `Episode ${episodeNumber} not found`,

      season,

      episodes
    };
  }

  console.log(
    "[TARGET]",
    episode.episodeNo,
    episode.title,
    episode.id
  );

  // ----------------------------------------------------------
  // RESOLVE
  // ----------------------------------------------------------

  const resolved =
    await resolveEpisode(
      episode,
      episodes,
      episodeNumber
    );

  if (
    !resolved.success ||
    !resolved.stream ||
    !resolved.stream.hls
  ) {

    return {
      success: false,

      error:
        `MX stream unavailable for ${show.title} S${seasonNumber}E${episodeNumber}`,

      show: {
        id:
          show.id,

        title:
          show.title,

        webUrl:
          show.webUrl
      },

      season,

      episode: {
        id:
          episode.id,

        episodeNo:
          episode.episodeNo,

        title:
          episode.title,

        webUrl:
          episode.webUrl
      },

      attempted:
        [
          "season API stream",
          "episode webUrl → SEO → detail",
          "direct episode detail",
          "previous episode → nextVideo"
        ]
    };
  }

  return {
    success: true,

    source:
      resolved.source,

    imdbId,

    title:
      show.title,

    season:
      Number(
        seasonNumber
      ),

    seasonId:
      season.id,

    episode:
      Number(
        episodeNumber
      ),

    episodeId:
      resolved.id ||
      episode.id,

    episodeTitle:
      resolved.title ||
      episode.title,

    hls:
      resolved.stream.hls,

    dash:
      resolved.stream.dash,

    videoHash:
      resolved.stream.videoHash,

    provider:
      resolved.stream.provider,

    drmProtect:
      resolved.stream.drmProtect
  };
}

// ============================================================
// MANIFEST
// ============================================================

const manifest = {
  id:
    "com.my.stremio.video",

  version:
    VERSION,

  name:
    "MX Player Resolver",

  description:
    "Resolves MX Player streams for testing.",

  resources: [
    {
      name:
        "stream",

      types:
        [
          "movie",
          "series"
        ],

      idPrefixes:
        ["tt"]
    }
  ],

  types:
    [
      "movie",
      "series"
    ],

  catalogs:
    []
};

// ============================================================
// CORS
// ============================================================

app.use(
  (req, res, next) => {

    res.setHeader(
      "Access-Control-Allow-Origin",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Headers",
      "*"
    );

    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,OPTIONS"
    );

    res.setHeader(
      "X-Addon-Version",
      VERSION
    );

    if (
      req.method ===
        "OPTIONS"
    ) {
      return res.sendStatus(
        204
      );
    }

    next();
  }
);

// ============================================================
// ROOT
// ============================================================

app.get(
  "/",
  (req, res) => {

    res.json({
      addon:
        "MX Player Resolver",

      version:
        VERSION,

      status:
        "ok"
    });
  }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
  "/health",
  (req, res) => {

    res.json({
      ok:
        true,

      addon:
        "MX Player Resolver",

      version:
        VERSION
    });
  }
);

// ============================================================
// MANIFEST
// ============================================================

app.get(
  "/manifest.json",
  (req, res) => {
    res.json(
      manifest
    );
  }
);

// ============================================================
// STREMIO STREAM
// ============================================================

app.get(
  "/stream/:type/:videoId",
  async (
    req,
    res
  ) => {

    try {

      const type =
        req.params.type;

      const videoId =
        decodeURIComponent(
          req.params.videoId
        );

      console.log(
        "[STREMIO]",
        type,
        videoId
      );

      if (
        type !== "series"
      ) {

        return res.json({
          streams:
            []
        });
      }

      const parts =
        videoId.split(":");

      if (
        parts.length <
          3
      ) {

        return res.json({
          streams:
            []
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
        !/^tt\d+$/.test(
          imdbId
        ) ||
        !Number.isFinite(
          season
        ) ||
        !Number.isFinite(
          episode
        )
      ) {

        return res.json({
          streams:
            []
        });
      }

      const result =
        await resolveSeries(
          imdbId,
          season,
          episode
        );

      if (
        !result.success ||
        !result.hls
      ) {

        console.log(
          "[NO STREAM]",
          JSON.stringify(
            result,
            null,
            2
          )
        );

        return res.json({
          streams:
            []
        });
      }

      return res.json({
        streams: [
          {
            name:
              "MX Player",

            title:
              result.episodeTitle
                ? `${result.episodeTitle} • MX Player`
                : "MX Player",

            url:
              result.hls,

            behaviorHints: {
              notWebReady:
                true,

              bingeGroup:
                `mx-${imdbId}-s${season}`
            }
          }
        ]
      });

    } catch (
      error
    ) {

      console.error(
        "[STREAM ERROR]",
        error
      );

      return res.json({
        streams:
          []
      });
    }
  }
);

// ============================================================
// DEBUG: SERIES
// ============================================================

app.get(
  "/debug/series/:videoId",
  async (
    req,
    res
  ) => {

    try {

      const videoId =
        decodeURIComponent(
          req.params.videoId
        );

      const parts =
        videoId.split(":");

      const result =
        await resolveSeries(
          parts[0],
          Number(parts[1]),
          Number(parts[2])
        );

      res.json(
        result
      );

    } catch (
      error
    ) {

      res.status(
        500
      ).json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// DEBUG: SEASON EPISODES
// ============================================================

app.get(
  "/debug/episodes/:seasonId",
  async (
    req,
    res
  ) => {

    try {

      const result =
        await getSeasonEpisodes(
          req.params.seasonId
        );

      res.json(
        result
      );

    } catch (
      error
    ) {

      res.status(
        500
      ).json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// DEBUG: DETAIL
// ============================================================

app.get(
  "/debug/detail/:id",
  async (
    req,
    res
  ) => {

    try {

      const result =
        await getVideoDetail(
          req.params.id,
          "episode"
        );

      res.json(
        result
      );

    } catch (
      error
    ) {

      res.status(
        500
      ).json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// DEBUG: NEXT VIDEO
// ============================================================

app.get(
  "/debug/next/:id",
  async (
    req,
    res
  ) => {

    try {

      const result =
        await getNextVideo(
          req.params.id
        );

      res.json(
        result
      );

    } catch (
      error
    ) {

      res.status(
        500
      ).json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// DEBUG: SEO
// ============================================================

app.get(
  "/debug/seo",
  async (
    req,
    res
  ) => {

    try {

      if (
        !req.query.url
      ) {

        return res.status(
          400
        ).json({
          success:
            false,

          error:
            "Use ?url=https://www.mxplayer.in/..."
        });
      }

      const result =
        await mxSeo(
          req.query.url
        );

      res.json(
        result
      );

    } catch (
      error
    ) {

      res.status(
        500
      ).json({
        success:
          false,

        error:
          error.message
      });
    }
  }
);

// ============================================================
// START
// ============================================================

app.listen(
  PORT,
  () => {

    console.log(
      `MX Player Resolver v${VERSION} running on port ${PORT}`
    );

    console.log(
      "Anonymous user:",
      USER_ID
    );
  }
);
