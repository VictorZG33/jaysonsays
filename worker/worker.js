// Cloudflare Worker that lets visitors of wentaoz.com/jaysonsays/ ask 杰神模拟器 on the site's own
// Anthropic API key, which is what the page does unless a visitor chooses to use their own key. The
// key stays here as a secret; the page only ever sees the answer.
//
// It accepts the question the page builds (a label photo and/or a typed wine name), checks it, runs
// it with the same code the page uses (../sim.js), and streams the progress and the verdict
// back as newline-delimited JSON. See Deploying in the README for how it is set up.

import Anthropic from '@anthropic-ai/sdk';
import { checkInput, runSimulator } from '../sim.js';

const ORIGINS = ['https://wentaoz.com', 'https://www.wentaoz.com'];

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin',
    };
    const fail = (status, error) => Response.json({ error }, { status, headers: cors });

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return fail(405, 'POST only');
    // Browsers always send Origin on a cross-site POST; this keeps other websites from using the key.
    // It does not stop scripts that fake the header, which is what the rate limit and the spend limit
    // on the Anthropic key are for.
    if (!ORIGINS.includes(origin)) return fail(403, 'origin not allowed');
    // The page reads this as "the site's key is off" and points the visitor to their own key
    if (!env.ANTHROPIC_API_KEY) return fail(503, 'not_configured');

    if (env.ASK_LIMIT) {
      const { success } = await env.ASK_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
      if (!success) return fail(429, 'rate_limited');
    }

    let input;
    try { input = await request.json(); } catch { return fail(400, 'bad json'); }
    const problem = checkInput(input);
    if (problem) return fail(400, problem);

    // One JSON object per line: the events runSimulator emits, or { type: 'error' } if the API call
    // fails. The response starts at once, so an API error arrives as an event, not as the HTTP status.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const emit = (ev) => { writer.write(enc.encode(JSON.stringify(ev) + '\n')).catch(() => {}); };
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    ctx.waitUntil((async () => {
      try {
        await runSimulator(client, input, emit);
      } catch (e) {
        emit({ type: 'error', status: e instanceof Anthropic.APIError && e.status ? e.status : 502, message: e instanceof Anthropic.APIError ? e.message : 'upstream error' });
      } finally {
        await writer.close().catch(() => {});
      }
    })());
    return new Response(readable, { headers: { ...cors, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
  },
};
