import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { realpath, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
let requestedPort = process.env.PORT ?? "4173";

for (let index = 0; index < args.length; index += 1) {
  if (args[index] === "--port") requestedPort = args[++index];
  else if (args[index].startsWith("--port="))
    requestedPort = args[index].slice(7);
  else {
    console.error(
      `Unknown option: ${args[index]}. Usage: npm start -- --port 4173`,
    );
    process.exit(1);
  }
}

if (
  !/^\d+$/.test(requestedPort ?? "") ||
  Number(requestedPort) < 1 ||
  Number(requestedPort) > 65535
) {
  console.error(
    "Port must be an integer from 1 to 65535. Use PORT=4173 or --port 4173.",
  );
  process.exit(1);
}

const port = Number(requestedPort);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".wav": "audio/wav",
};

function respond(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end(message);
}

const server = createServer(async (request, response) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Cache-Control", "no-cache");

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    respond(response, 405, "Method not allowed");
    return;
  }

  try {
    const pathname = decodeURIComponent((request.url ?? "/").split("?")[0]);
    if (
      !pathname.startsWith("/") ||
      pathname.includes("\0") ||
      pathname.includes("\\") ||
      pathname.split("/").some((part) => part.startsWith("."))
    ) {
      respond(response, 403, "Forbidden");
      return;
    }

    const candidate = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    const file = await realpath(candidate);
    if (!file.startsWith(`${root}${sep}`)) {
      respond(response, 403, "Forbidden");
      return;
    }

    const info = await stat(file);
    if (!info.isFile()) {
      respond(response, 404, "Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type":
        mimeTypes[extname(file).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": info.size,
    });
    if (request.method === "HEAD") response.end();
    else {
      const stream = createReadStream(file);
      stream.on("error", () => response.destroy());
      response.on("close", () => stream.destroy());
      stream.pipe(response);
    }
  } catch (error) {
    if (error instanceof URIError) respond(response, 400, "Malformed URL");
    else if (error.code === "ENOENT" || error.code === "ENOTDIR")
      respond(response, 404, "Not found");
    else if (error.code === "EACCES") respond(response, 403, "Forbidden");
    else {
      console.error("Unable to serve request:", error.message);
      respond(response, 500, "Internal server error");
    }
  }
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${port} is already in use. Choose another with npm start -- --port ${port + 1}.`,
    );
  } else console.error(`Unable to start Ashveil: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`Ashveil is ready at http://127.0.0.1:${port}`);
  console.log("Press Ctrl+C to stop.");
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
    server.closeAllConnections();
  });
}
