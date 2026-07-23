// Vercel serverless entrypoint for the Express API.
//
// Vercel runs each request as a short-lived function, so we export the Express
// `app` (which is itself an `(req, res)` handler) instead of calling
// `app.listen()`. This deliberately does NOT start the background jobs (daily
// backups, recall feed, notifications) — those need a long-running process and
// live in ../src/index.ts, the entrypoint used when self-hosting.
import { createApp } from '../src/app';

const app = createApp();

export default app;
