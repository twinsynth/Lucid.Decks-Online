const { onRequest } = require("firebase-functions/v2/https");
const express = require("express");
const cors = require("cors");
const { Readable } = require("stream");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

// SoundCloud Client ID Cache & Discovery
let cachedClientId = process.env.SOUNDCLOUD_CLIENT_ID || null;
let lastClientIdFetch = 0;

async function getSoundCloudClientId() {
  const now = Date.now();
  if (cachedClientId && now - lastClientIdFetch < 24 * 60 * 60 * 1000) {
    return cachedClientId;
  }

  try {
    const htmlRes = await fetch("https://soundcloud.com", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });
    const html = await htmlRes.text();
    const scriptUrls = [...html.matchAll(/<script[^>]+src="([^">]+\.js)"/g)].map(m => m[1]);

    for (const url of scriptUrls.slice(-6)) {
      try {
        const jsRes = await fetch(url);
        const js = await jsRes.text();
        const match = js.match(/client_id[:=]["']([a-zA-Z0-9]{32})["']/);
        if (match) {
          cachedClientId = match[1];
          lastClientIdFetch = now;
          return cachedClientId;
        }
      } catch {}
    }

    for (const url of scriptUrls) {
      try {
        const jsRes = await fetch(url);
        const js = await jsRes.text();
        const match = js.match(/client_id[:=]["']([a-zA-Z0-9_-]{32})["']/);
        if (match) {
          cachedClientId = match[1];
          lastClientIdFetch = now;
          return cachedClientId;
        }
      } catch {}
    }
  } catch (err) {
    console.error("[SoundCloud] Auto-discovery error:", err.message);
  }

  return cachedClientId || "Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo";
}

// 1. SoundCloud Search Route
app.get("/api/soundcloud/search", async (req, res) => {
  try {
    const q = req.query.q || "techno remix";
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 24;
    const clientId = await getSoundCloudClientId();

    const scUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(q)}&client_id=${clientId}&limit=${limit}`;
    const scRes = await fetch(scUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!scRes.ok) {
      return res.status(scRes.status).json({ success: false, error: `SoundCloud API returned ${scRes.status}` });
    }

    const data = await scRes.json();
    const tracks = (data.collection || [])
      .map(t => {
        const prog = t.media?.transcodings?.find(tr => tr.format?.protocol === "progressive");
        const hls = t.media?.transcodings?.find(tr => tr.format?.protocol === "hls");
        const transcoding = prog || hls;
        if (!transcoding) return null;

        return {
          id: t.id,
          title: t.title,
          artist: t.user?.username || "Unknown Artist",
          duration: Math.round(t.duration / 1000),
          artworkUrl: t.artwork_url ? t.artwork_url.replace("-large", "-t500x500") : t.user?.avatar_url,
          permalinkUrl: t.permalink_url,
          genre: t.genre,
          streamTranscodingUrl: transcoding.url,
          trackAuth: t.track_authorization,
          format: transcoding.format?.protocol || "progressive"
        };
      })
      .filter(Boolean);

    res.json({ success: true, tracks });
  } catch (err) {
    console.error("SoundCloud search error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. SoundCloud URL Resolve Route (Direct link paste)
app.get("/api/soundcloud/resolve", async (req, res) => {
  try {
    const url = req.query.url;
    if (!url) {
      return res.status(400).json({ success: false, error: "Missing url parameter" });
    }

    const clientId = await getSoundCloudClientId();
    const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
    let scRes = await fetch(resolveUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    let t;
    if (!scRes.ok) {
      try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split("/").filter(Boolean);
        if (parts.length >= 2) {
          const fallbackQuery = `${parts[0]} ${parts[1].replace(/-/g, " ")}`;
          const fallbackScUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(fallbackQuery)}&client_id=${clientId}&limit=1`;
          const fallbackRes = await fetch(fallbackScUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });
          if (fallbackRes.ok) {
            const fbData = await fallbackRes.json();
            if (fbData.collection && fbData.collection.length > 0) {
              t = fbData.collection[0];
            }
          }
        }
      } catch {}

      if (!t) {
        return res.status(scRes.status).json({ success: false, error: `SoundCloud resolve returned ${scRes.status}` });
      }
    } else {
      t = await scRes.json();
    }

    const prog = t.media?.transcodings?.find(tr => tr.format?.protocol === "progressive");
    const hls = t.media?.transcodings?.find(tr => tr.format?.protocol === "hls");
    const transcoding = prog || hls;

    if (!transcoding) {
      return res.status(404).json({ success: false, error: "No streamable audio found for this track." });
    }

    const track = {
      id: t.id,
      title: t.title,
      artist: t.user?.username || "Unknown Artist",
      duration: Math.round(t.duration / 1000),
      artworkUrl: t.artwork_url ? t.artwork_url.replace("-large", "-t500x500") : t.user?.avatar_url,
      permalinkUrl: t.permalink_url,
      genre: t.genre,
      streamTranscodingUrl: transcoding.url,
      trackAuth: t.track_authorization,
      format: transcoding.format?.protocol || "progressive"
    };

    res.json({ success: true, track });
  } catch (err) {
    console.error("SoundCloud resolve error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. SoundCloud Audio Stream Proxy Route
app.get("/api/soundcloud/stream", async (req, res) => {
  try {
    const transcodingUrl = req.query.transcodingUrl;
    const trackAuth = req.query.trackAuth;

    if (!transcodingUrl) {
      return res.status(400).json({ success: false, error: "Missing transcodingUrl parameter" });
    }

    const clientId = await getSoundCloudClientId();
    const trUrl = `${transcodingUrl}?client_id=${clientId}${trackAuth ? `&track_authorization=${encodeURIComponent(trackAuth)}` : ""}`;

    const streamInfoRes = await fetch(trUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!streamInfoRes.ok) {
      return res.status(streamInfoRes.status).json({ success: false, error: `Failed to obtain stream info: ${streamInfoRes.status}` });
    }

    const streamInfo = await streamInfoRes.json();
    const directUrl = streamInfo.url;
    if (!directUrl) {
      return res.status(404).json({ success: false, error: "Direct stream URL not found" });
    }

    const audioRes = await fetch(directUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    });

    if (!audioRes.ok) {
      return res.status(audioRes.status).json({ success: false, error: `Failed to download audio: ${audioRes.status}` });
    }

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Content-Type", audioRes.headers.get("content-type") || "audio/mpeg");
    const contentLength = audioRes.headers.get("content-length");
    if (contentLength) {
      res.setHeader("Content-Length", contentLength);
    }
    res.setHeader("Accept-Ranges", "bytes");

    if (audioRes.body) {
      Readable.fromWeb(audioRes.body).pipe(res);
    } else {
      const arrayBuf = await audioRes.arrayBuffer();
      res.send(Buffer.from(arrayBuf));
    }
  } catch (err) {
    console.error("SoundCloud streaming error:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
});

// Export Cloud Function
exports.api = onRequest({ cors: true, timeoutSeconds: 60, memory: "512MiB" }, app);
