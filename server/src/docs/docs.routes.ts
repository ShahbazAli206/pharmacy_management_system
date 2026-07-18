import { Router } from 'express';
import { buildOpenApiSpec } from './openapi';

const router = Router();

// The raw OpenAPI 3 document.
router.get('/docs.json', (_req, res) => {
  res.json(buildOpenApiSpec());
});

// Swagger UI. Assets load from a CDN (dev docs endpoint); the spec itself is
// served locally from /api/docs.json, so the API surface is never exposed
// off-host. Swap to a bundled swagger-ui-express install if offline docs are
// required in a locked-down environment.
const SWAGGER_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pharmacy PMS API — Docs</title>
    <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin></script>
    <script>
      window.onload = () => {
        window.ui = SwaggerUIBundle({
          url: 'docs.json',
          dom_id: '#swagger-ui',
          presets: [SwaggerUIBundle.presets.apis],
          layout: 'BaseLayout',
        });
      };
    </script>
  </body>
</html>`;

router.get('/docs', (_req, res) => {
  // Relax the global helmet CSP just for this page so the CDN-hosted Swagger UI
  // assets (and its inline bootstrap script) can load. Scoped to /docs only.
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://unpkg.com",
      "style-src 'self' 'unsafe-inline' https://unpkg.com",
      "img-src 'self' data: https://unpkg.com",
      "font-src 'self' https://unpkg.com",
      "connect-src 'self'",
      "worker-src 'self' blob:",
    ].join('; '),
  );
  res.type('html').send(SWAGGER_HTML);
});

export default router;
