#!/usr/bin/env node
/**
 * Local embedding server so `wrangler dev` can run the full query flow with no
 * Workers AI call:  DEV_EMBED_URL="http://127.0.0.1:8791/embed" in worker/.dev.vars
 */
import http from 'node:http';
import { embedBatch } from './lib/embedder.js';

const PORT = Number(process.env.PORT || 8791);
http.createServer(async (req, res) => {
  if (req.method !== 'POST') { res.writeHead(405).end(); return; }
  let body = '';
  for await (const c of req) body += c;
  try {
    const { texts } = JSON.parse(body);
    const vectors = await embedBatch(texts);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ vectors: vectors.map((v) => Array.from(v)) }));
  } catch (err) {
    res.writeHead(500, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}).listen(PORT, () => console.log(`[embed-server] http://127.0.0.1:${PORT}/embed`));
