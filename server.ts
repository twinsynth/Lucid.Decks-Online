import express from "express";
import path from "path";
import { Readable } from "stream";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Modality } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// SoundCloud Client ID Cache & Discovery
let cachedClientId: string | null = process.env.SOUNDCLOUD_CLIENT_ID || null;
let lastClientIdFetch = 0;

async function getSoundCloudClientId(): Promise<string> {
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
          console.log("[SoundCloud] Auto-discovered client_id:", cachedClientId);
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
          console.log("[SoundCloud] Auto-discovered client_id:", cachedClientId);
          return cachedClientId;
        }
      } catch {}
    }
  } catch (err: any) {
    console.error("[SoundCloud] Auto-discovery error:", err.message);
  }

  return cachedClientId || "Pb72ranhoyt6gw7hM7TkzUItXlMWSNSo";
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

  app.use(express.json());

  // 1. SoundCloud Search Route
  app.get("/api/soundcloud/search", async (req, res) => {
    try {
      const q = (req.query.q as string) || "techno remix";
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 24;
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
        .map((t: any) => {
          const prog = t.media?.transcodings?.find((tr: any) => tr.format?.protocol === "progressive");
          const hls = t.media?.transcodings?.find((tr: any) => tr.format?.protocol === "hls");
          const transcoding = prog || hls;
          if (!transcoding) return null;

          return {
            id: t.id,
            title: t.title,
            artist: t.user?.username || "Unknown Artist",
            avatarUrl: t.user?.avatar_url || "",
            artworkUrl: t.artwork_url ? t.artwork_url.replace("-large", "-t500x500") : (t.user?.avatar_url || ""),
            duration: Math.round((t.duration || 0) / 1000),
            permalinkUrl: t.permalink_url,
            streamTranscodingUrl: transcoding.url,
            protocol: transcoding.format?.protocol,
            trackAuth: t.track_authorization,
            genre: t.genre || "",
            playbackCount: t.playback_count || 0
          };
        })
        .filter(Boolean);

      res.json({ success: true, tracks });
    } catch (err: any) {
      console.error("SoundCloud search error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 2. SoundCloud URL Resolve Route (Direct link paste)
  app.get("/api/soundcloud/resolve", async (req, res) => {
    try {
      const url = req.query.url as string;
      if (!url) return res.status(400).json({ success: false, error: "Missing url parameter" });

      const clientId = await getSoundCloudClientId();
      const resolveUrl = `https://api-v2.soundcloud.com/resolve?url=${encodeURIComponent(url)}&client_id=${clientId}`;
      const scRes = await fetch(resolveUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      });

      if (!scRes.ok) {
        // Fallback: extract artist and title from SoundCloud URL pathname and search
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/').filter(Boolean);
          if (pathParts.length >= 2) {
            const fallbackQuery = `${pathParts[0]} ${pathParts[1].replace(/-/g, ' ')}`;
            const fallbackScUrl = `https://api-v2.soundcloud.com/search/tracks?q=${encodeURIComponent(fallbackQuery)}&client_id=${clientId}&limit=1`;
            const fallbackRes = await fetch(fallbackScUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
              }
            });
            if (fallbackRes.ok) {
              const fallbackData = await fallbackRes.json();
              if (fallbackData.collection?.[0]) {
                const t = fallbackData.collection[0];
                const prog = t.media?.transcodings?.find((tr: any) => tr.format?.protocol === "progressive");
                const hls = t.media?.transcodings?.find((tr: any) => tr.format?.protocol === "hls");
                const transcoding = prog || hls;
                return res.json({
                  success: true,
                  track: {
                    id: t.id,
                    title: t.title,
                    artist: t.user?.username || "Unknown Artist",
                    avatarUrl: t.user?.avatar_url || "",
                    artworkUrl: t.artwork_url ? t.artwork_url.replace("-large", "-t500x500") : (t.user?.avatar_url || ""),
                    duration: Math.round((t.duration || 0) / 1000),
                    permalinkUrl: t.permalink_url,
                    streamTranscodingUrl: transcoding?.url,
                    protocol: transcoding?.format?.protocol,
                    trackAuth: t.track_authorization,
                    genre: t.genre || "",
                    playbackCount: t.playback_count || 0
                  }
                });
              }
            }
          }
        } catch {}

        return res.status(scRes.status).json({ success: false, error: `Failed to resolve track: ${scRes.status}` });
      }

      const t = await scRes.json();
      const prog = t.media?.transcodings?.find((tr: any) => tr.format?.protocol === "progressive");
      const hls = t.media?.transcodings?.find((tr: any) => tr.format?.protocol === "hls");
      const transcoding = prog || hls;

      const track = {
        id: t.id,
        title: t.title,
        artist: t.user?.username || "Unknown Artist",
        avatarUrl: t.user?.avatar_url || "",
        artworkUrl: t.artwork_url ? t.artwork_url.replace("-large", "-t500x500") : (t.user?.avatar_url || ""),
        duration: Math.round((t.duration || 0) / 1000),
        permalinkUrl: t.permalink_url,
        streamTranscodingUrl: transcoding?.url,
        protocol: transcoding?.format?.protocol,
        trackAuth: t.track_authorization,
        genre: t.genre || "",
        playbackCount: t.playback_count || 0
      };

      res.json({ success: true, track });
    } catch (err: any) {
      console.error("SoundCloud resolve error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // 3. SoundCloud Audio Stream Proxy Route
  app.get("/api/soundcloud/stream", async (req, res) => {
    try {
      const transcodingUrl = req.query.transcodingUrl as string;
      const trackAuth = req.query.trackAuth as string;

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
        // @ts-ignore
        Readable.fromWeb(audioRes.body).pipe(res);
      } else {
        const arrayBuf = await audioRes.arrayBuffer();
        res.send(Buffer.from(arrayBuf));
      }
    } catch (err: any) {
      console.error("SoundCloud streaming error:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message });
      }
    }
  });

  // API Route for Music Generation (Lyria)
  app.post("/api/generate-music", async (req, res) => {
    try {
      const { prompt, duration } = req.body;
      const model = duration === 'pro' ? 'lyria-3-pro-preview' : 'lyria-3-clip-preview';
      
      const response = await ai.models.generateContentStream({
        model: model,
        contents: prompt,
      });

      res.setHeader('Content-Type', 'text/plain');

      let audioBase64 = "";
      let mimeType = "audio/wav";

      for await (const chunk of response) {
        const parts = chunk.candidates?.[0]?.content?.parts;
        if (!parts) continue;
        
        for (const part of parts) {
          if (part.inlineData?.data) {
            if (!audioBase64 && part.inlineData.mimeType) {
              mimeType = part.inlineData.mimeType;
            }
            audioBase64 += part.inlineData.data;
          }
        }
      }

      res.json({ success: true, audioBase64, mimeType });

    } catch (error: any) {
      console.error("Music generation error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
