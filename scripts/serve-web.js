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
  ".apk": "application/vnd.android.package-archive",
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

const DOWNLOAD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Download Camartes Field Test</title>
  <style>
    body { font-family: system-ui, sans-serif; background: #FFF7ED; color: #111827; max-width: 34rem; margin: 48px auto; padding: 0 20px; }
    a.btn { display: inline-block; background: #FF6B35; color: #fff; font-weight: 800; text-decoration: none; padding: 14px 20px; border-radius: 12px; margin: 8px 8px 8px 0; }
    p { color: #6B7280; line-height: 1.5; }
    code { background: #FFEDD5; padding: 2px 6px; border-radius: 4px; color: #111827; }
    ul { color: #374151; line-height: 1.6; }
  </style>
</head>
<body>
  <h1>Camartes Field Test APK</h1>
  <p>45 MB arm64 build for field-executive testing. Package: <code>com.camartes.field.test</code></p>
  <p><a class="btn" href="/camartes-field-test.apk">Download APK on this phone</a></p>
  <p>Open this page from <strong>Cursor Preview</strong> on your phone, then tap the orange button. Do not use <code>127.0.0.1</code> — that points to your phone, not the cloud machine.</p>
  <ul>
    <li>Enable <strong>Install unknown apps</strong> for your browser or file manager.</li>
    <li>If Play Protect warns, choose <strong>Install anyway</strong>.</li>
    <li>Uninstall any old <code>com.camartes.field</code> app if install still fails.</li>
  </ul>
  <p>Sign in with the test account issued to you for this environment.</p>
</body>
</html>`;

function pickFile(urlPath) {
  const pathname = (urlPath || "/").split("?")[0];
  if (pathname === "/health") return { health: true };
  if (pathname === "/download" || pathname === "/download.html" || pathname === "/apk") {
    return { download: true };
  }
  const full = safeJoin(urlPath);
  if (pathname.toLowerCase().endsWith(".apk")) {
    if (full && fs.existsSync(full) && fs.statSync(full).isFile()) return full;
    return { missing: true };
  }
  if (!full) return path.join(ROOT, "index.html");
  if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  if (fs.existsSync(full + ".html")) return full + ".html";
  const asIndex = path.join(full, "index.html");
  if (fs.existsSync(asIndex)) return asIndex;
  return path.join(ROOT, "index.html");
}

function sendApk(req, res, file) {
  const st = fs.statSync(file);
  const size = st.size;
  const headers = {
    "Content-Type": "application/vnd.android.package-archive",
    "Content-Disposition": 'attachment; filename="camartes-field-test.apk"',
    "Accept-Ranges": "bytes",
    "Cache-Control": "public, max-age=120",
    "Access-Control-Allow-Origin": "*",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.method === "OPTIONS") {
    res.writeHead(204, headers);
    res.end();
    return;
  }
  const range = String(req.headers.range || "");
  const m = /^bytes=(\d*)-(\d*)$/i.exec(range);
  let start = 0;
  let end = size - 1;
  if (m) {
    if (m[1]) start = Number(m[1]);
    if (m[2]) end = Number(m[2]);
    if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) {
      headers["Content-Range"] = `bytes */${size}`;
      res.writeHead(416, headers);
      res.end();
      return;
    }
    end = Math.min(end, size - 1);
    headers["Content-Range"] = `bytes ${start}-${end}/${size}`;
    headers["Content-Length"] = String(end - start + 1);
    res.writeHead(206, headers);
  } else {
    headers["Content-Length"] = String(size);
    res.writeHead(200, headers);
  }
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(file, { start, end }).pipe(res);
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
  if (picked && picked.download) {
    const body = Buffer.from(DOWNLOAD_HTML);
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": String(body.length),
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    res.end(body);
    return;
  }
  if (picked && picked.missing) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("APK not found");
    return;
  }
  const file = picked;
  const ext = path.extname(file).toLowerCase();
  if (ext === ".apk") {
    try {
      sendApk(req, res, file);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("APK not found");
    }
    return;
  }
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

server.keepAliveTimeout = 600000;
server.headersTimeout = 610000;
server.requestTimeout = 600000;
server.timeout = 600000;

server.listen(PORT, HOST, () => {
  console.log(`Camartes Field preview http://${HOST}:${PORT}`);
  log(`listen ${HOST}:${PORT}`);
});
