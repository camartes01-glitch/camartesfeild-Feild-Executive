#!/usr/bin/env node
/**
 * Serve the Expo static export for Cursor Preview (127.0.0.1).
 * Extensionless routes (/attendance, /hours) map to HTML files.
 * Gzip is off by default — the Preview proxy mishandles it on HEAD checks.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 43156);
const HOST = process.env.HOST || "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".map": "application/json",
};

const ALIAS = {
  "/hours": "/attendance.html",
  "/run": "/tasks/index.html",
  "/services": "/vendors/index.html",
};

function safeJoin(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0].split("#")[0]);
  const rel = ALIAS[decoded] || decoded;
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function pickFile(urlPath) {
  const full = safeJoin(urlPath);
  if (!full) return path.join(ROOT, "index.html");
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  if (fs.existsSync(full + ".html")) return full + ".html";
  const asIndex = path.join(full, "index.html");
  if (fs.existsSync(asIndex)) return asIndex;
  return path.join(ROOT, "index.html");
}

const server = http.createServer((req, res) => {
  const file = pickFile(req.url || "/");
  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", ext === ".html" ? "no-store" : "public, max-age=60");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "HEAD" || req.method === "OPTIONS") {
    res.statusCode = 200;
    res.end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.statusCode = 404;
      res.end("Not found");
      return;
    }
    res.statusCode = 200;
    res.end(data);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Camartes Field preview http://${HOST}:${PORT}`);
});
