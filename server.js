const express = require("express");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { spawn } = require("node:child_process");
const path = require("node:path");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const YTDLP = process.env.YTDLP_PATH || "yt-dlp";

app.disable("x-powered-by");
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: []
    }
  }
}));
app.use(express.json({ limit: "10kb" }));
app.use(express.static(path.join(__dirname, "public"), { extensions: ["html"] }));

app.use("/api/", rateLimit({
  windowMs: 60 * 1000,
  limit: 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please wait a minute and try again." }
}));

function isPinterestUrl(raw) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return host === "pinterest.com" ||
      host.endsWith(".pinterest.com") ||
      host === "pin.it";
  } catch {
    return false;
  }
}

// Use yt-dlp's metadata output only. No cookies, login credentials, or private Pins.
app.post("/api/info", (req, res) => {
  const url = typeof req.body?.url === "string" ? req.body.url.trim() : "";
  if (!isPinterestUrl(url)) {
    return res.status(400).json({ error: "Please enter a valid HTTPS Pinterest Pin link (pinterest.com or pin.it)." });
  }

  const child = spawn(YTDLP, [
    "--no-warnings",
    "--no-playlist",
    "--skip-download",
    "--dump-single-json",
    "--no-check-certificates",
    "--socket-timeout", "15",
    "--",
    url
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let stdout = "";
  let stderr = "";
  const timeout = setTimeout(() => child.kill("SIGKILL"), 25000);
  child.stdout.on("data", chunk => { stdout += chunk.toString(); if (stdout.length > 2_000_000) child.kill("SIGKILL"); });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); if (stderr.length > 12000) stderr = stderr.slice(-12000); });
  child.on("error", () => {
    clearTimeout(timeout);
    res.status(503).json({ error: "Backend downloader is not installed. Install yt-dlp on the server and try again." });
  });
  child.on("close", code => {
    clearTimeout(timeout);
    if (res.headersSent) return;
    if (code !== 0 || !stdout.trim()) {
      return res.status(422).json({ error: "Could not read this Pin. It may be private, unavailable, unsupported, or blocked by Pinterest.", detail: stderr.slice(-1200) });
    }
    try {
      const data = JSON.parse(stdout);
      const formats = Array.isArray(data.formats) ? data.formats : [];
      const hasVideo = formats.some(f => f.vcodec && f.vcodec !== "none");
      if (!hasVideo && !(data.url && data.ext && ["mp4", "webm", "mov", "m4v"].includes(data.ext))) {
        return res.status(422).json({ error: "No downloadable video format was detected for this Pin." });
      }
      res.json({
        title: String(data.title || "Pinterest video").slice(0, 180),
        thumbnail: typeof data.thumbnail === "string" ? data.thumbnail : null,
        duration: Number.isFinite(data.duration) ? data.duration : null,
        extractor: String(data.extractor_key || data.extractor || "Pinterest"),
        downloadAvailable: true,
        note: "If download fails, the Pin may be restricted or Pinterest may have changed its delivery format."
      });
    } catch {
      res.status(502).json({ error: "The backend returned an unexpected response. Update yt-dlp and try again." });
    }
  });
});

// Streams the video via yt-dlp. The user must have rights/permission to save it.
app.get("/api/download", (req, res) => {
  const url = typeof req.query.url === "string" ? req.query.url.trim() : "";
  if (!isPinterestUrl(url)) {
    return res.status(400).send("Please provide a valid HTTPS Pinterest Pin link.");
  }

  // Prefer MP4 when available; let yt-dlp select a compatible best format.
  const child = spawn(YTDLP, [
    "--no-warnings",
    "--no-playlist",
    "--no-progress",
    "--format", "best[ext=mp4]/best",
    "--output", "-",
    "--socket-timeout", "20",
    "--retries", "1",
    "--",
    url
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let started = false;
  let stderr = "";
  const timeout = setTimeout(() => child.kill("SIGKILL"), 120000);
  child.stdout.once("data", firstChunk => {
    started = true;
    res.status(200);
    res.setHeader("Content-Type", "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="pinterest-video.mp4"');
    res.setHeader("Cache-Control", "no-store");
    res.write(firstChunk);
    child.stdout.pipe(res);
  });
  child.stderr.on("data", chunk => { stderr += chunk.toString(); if (stderr.length > 8000) stderr = stderr.slice(-8000); });
  child.on("error", () => {
    clearTimeout(timeout);
    if (!res.headersSent) res.status(503).send("yt-dlp is not installed on this server.");
    else res.destroy();
  });
  child.on("close", code => {
    clearTimeout(timeout);
    if (!started && !res.headersSent) {
      res.status(422).send("Unable to download this Pin. It may be private, unavailable, or unsupported.");
    } else if (code !== 0 && !res.writableEnded) {
      res.destroy(new Error("Video stream failed: " + stderr.slice(-500)));
    }
  });
  req.on("close", () => { if (!res.writableEnded) child.kill("SIGTERM"); });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "Pinterest video helper" }));

app.listen(PORT, () => {
  console.log(`Pinterest video downloader backend listening on port ${PORT}`);
});