#!/usr/bin/env node
/**
 * Cursor CVM Preview server.
 * - Listen on 0.0.0.0 (ingress is not localhost)
 * - Long timeouts so the ~3MB bundle is not cut off
 * - Gzip JS/CSS/HTML on GET
 * - Map /hours and tab paths to HTML
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..", "dist");
const PORT = Number(process.env.PORT || 43156);
const HOST = process.env.HOST || "0.0.0.0";
const LOG = process.env.PREVIEW_LOG || "/tmp/camartes-preview.log";

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
  "/health": null,
};

function log(line) {
  fs.appendFile(LOG, `${new Date().toISOString()} ${line}\n`, () => {});
}

function safeJoin(urlPath) {
  const decoded = decodeURIComponent((urlPath || "/").split("?")[0].split("#")[0]);
  const rel = ALIAS[decoded] || decoded;
  if (rel == null) return null;
  const full = path.normalize(path.join(ROOT, rel));
  if (!full.startsWith(ROOT)) return null;
  return full;
}

function pickFile(urlPath) {
  const pathname = (urlPath || "/").split("?")[0];
  if (pathname === "/health") return { health: true };
  const full = safeJoin(urlPath);
  if (!full) return path.join(ROOT, "index.html");
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  if (fs.existsSync(full + ".html")) return full + ".html";
  const asIndex = path.join(full, "index.html");
  if (fs.existsSync(asIndex)) return asIndex;
  return path.join(ROOT, "index.html");
}

function tokenFrom(req) {
  try {
    const u = new URL(req.url || "/", "http://local");
    const q = u.searchParams.get("_ingress_token");
    if (q) return q;
  } catch {
    /* ignore */
  }
  for (const raw of [req.headers.cookie, req.headers.referer, req.headers.referrer]) {
    if (!raw) continue;
    const m = String(raw).match(/_ingress_token=([^;&]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

function injectAssetToken(html, token) {
  if (!token) return html;
  const q = `_ingress_token=${encodeURIComponent(token)}`;
  return html.replace(/(src|href)="(\/[^"]+)"/g, (full, attr, url) => {
    if (url.includes("_ingress_token")) return full;
    const sep = url.includes("?") ? "&" : "?";
    return `${attr}="${url}${sep}${q}"`;
  });
}

const BOOT = `<script>
(function(){
  window.addEventListener("error", function(e){
    var n=document.getElementById("boot-err");
    if(!n){n=document.createElement("pre");n.id="boot-err";n.style.cssText="padding:16px;color:#b91c1c;white-space:pre-wrap";document.body.prepend(n);}
    n.textContent=String(e.message||e.error||e);
  });
})();
</script>`;

const server = http.createServer((req, res) => {
  log(`${req.method} ${req.url}`);
  const picked = pickFile(req.url || "/");
  if (picked && picked.health) {
    res.setHeader("Content-Type", "text/plain");
    res.statusCode = 200;
    res.end("ok");
    return;
  }
  const file = picked;
  const ext = path.extname(file).toLowerCase();
  res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
  res.setHeader("Cache-Control", ext === ".html" ? "no-store" : "public, max-age=120");
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
    let body = data;
    if (ext === ".html") {
      let html = injectAssetToken(data.toString("utf8"), tokenFrom(req));
      html = html.replace("</head>", `${BOOT}</head>`);
      body = Buffer.from(html);
    }
    const accept = req.headers["accept-encoding"] || "";
    if (accept.includes("gzip") && (ext === ".js" || ext === ".html" || ext === ".css")) {
      body = zlib.gzipSync(body);
      res.setHeader("Content-Encoding", "gzip");
      res.setHeader("Vary", "Accept-Encoding");
    }
    res.setHeader("Content-Length", body.length);
    res.statusCode = 200;
    res.end(body);
  });
});

server.keepAliveTimeout = 120000;
server.headersTimeout = 125000;
server.requestTimeout = 120000;
server.timeout = 120000;

server.listen(PORT, HOST, () => {
  console.log(`Camartes Field preview http://${HOST}:${PORT}`);
  log(`listen ${HOST}:${PORT}`);
});
