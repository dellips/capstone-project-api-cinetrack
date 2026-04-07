import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const openApiPath = path.resolve(__dirname, "../../openapi.json");

// Membaca file OpenAPI dari root project dan mengubahnya ke object JSON.
async function readOpenApiSpec() {
  const content = await fs.readFile(openApiPath, "utf8");
  return JSON.parse(content);
}

// Membuat halaman Swagger UI sederhana yang memuat spec dari endpoint lokal.
function buildSwaggerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>CineTrack API Docs</title>
    <link
      rel="stylesheet"
      href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css"
    />
    <style>
      body {
        margin: 0;
        background: #f5f5f5;
      }
    </style>
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: "/api/v1/openapi.json",
        dom_id: "#swagger-ui"
      });
    </script>
  </body>
</html>`;
}

// Mendaftarkan route OpenAPI JSON dan halaman Swagger UI untuk akses lokal.
export default async function docsRoutes(fastify) {
  fastify.get("/openapi.json", async (request, reply) => {
    reply.type("application/json");
    return readOpenApiSpec();
  });

  fastify.get("/docs", async (request, reply) => {
    reply.type("text/html; charset=utf-8");
    return buildSwaggerHtml();
  });
}
