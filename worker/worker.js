// Cloudflare Worker that lets visitors of wentaoz.com/jaysonsays/ ask 杰神模拟器 on the site's own
// Anthropic API key, which is what the page does unless a visitor chooses to use their own key. The
// key stays here as a secret; the page only ever sees the answer.
//
// It accepts the question the page builds (a label photo and/or a typed wine name), checks it, runs
// it with the same code the page uses (../sim.js), and streams the progress and the verdict
// back as newline-delimited JSON. See Deploying in the README for how it is set up.
//
// It keeps every answer it gets in Workers KV (the ANSWERS binding, which wrangler creates on the
// first deploy): only the verdict and the date, never the photo or who asked. The same words asked
// again get the kept answer without asking Claude, and without counting against the rate limit or
// needing the key; the same wine and vintage asked another way get it as soon as Claude's first
// lookup names the wine (sim.js). A question with fresh: true skips the kept answers and replaces
// them. Without the binding it works as before, keeping nothing.

import Anthropic from '@anthropic-ai/sdk';
import { checkInput, runSimulator, textKey } from '../sim.js';

const ORIGINS = ['https://wentaoz.com', 'https://www.wentaoz.com'];
// How long an answer is kept, by what it is: his own verdict only changes with his table (and any
// change to the table is a new ANSWER_VERSION), while a prediction may change once critics score the
// wine.
const KEEP = { found: 180 * 86400, predicted: 30 * 86400 };
const NO_USAGE = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, searches: 0 };

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

    let input;
    try { input = await request.json(); } catch { return fail(400, 'bad json'); }
    const problem = checkInput(input);
    if (problem) return fail(400, problem);

    const ndjson = (body) => new Response(body, { headers: { ...cors, 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-store' } });
    const store = env.ANSWERS;
    const recall = store && !input.fresh ? (k) => store.get(k, 'json').catch(() => null) : null;
    const tkey = textKey(input);
    const told = recall && tkey ? await recall(tkey) : null;
    if (told) {
      return ndjson([{ type: 'cached', at: told.at }, { type: 'verdict', verdict: told.verdict }, { type: 'done', stop: 'cached', usage: NO_USAGE }]
        .map((ev) => JSON.stringify(ev) + '\n').join(''));
    }

    // The page reads this as "the site's key is off" and points the visitor to their own key
    if (!env.ANTHROPIC_API_KEY) return fail(503, 'not_configured');

    if (env.ASK_LIMIT) {
      const { success } = await env.ASK_LIMIT.limit({ key: request.headers.get('CF-Connecting-IP') || 'unknown' });
      if (!success) return fail(429, 'rate_limited');
    }

    // One JSON object per line: the events runSimulator emits, or { type: 'error' } if the API call
    // fails. The response starts at once, so an API error arrives as an event, not as the HTTP status.
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const enc = new TextEncoder();
    const emit = (ev) => { writer.write(enc.encode(JSON.stringify(ev) + '\n')).catch(() => {}); };
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    ctx.waitUntil((async () => {
      let got = null;
      try {
        got = await runSimulator(client, input, emit, { recall });
      } catch (e) {
        emit({ type: 'error', status: e instanceof Anthropic.APIError && e.status ? e.status : 502, message: e instanceof Anthropic.APIError ? e.message : 'upstream error' });
      } finally {
        await writer.close().catch(() => {});
      }
      // Keep a verdict on an identified wine under the words asked and under the wine; an answer
      // that was itself kept goes under the words only, with its first date
      const v = got && got.verdict;
      if (!store || !v || !v.wine || !v.wine.identified || !v.jieshen || !(v.jieshen.source in KEEP)) return;
      const value = JSON.stringify(got.kept || { verdict: v, at: new Date().toISOString().slice(0, 10) });
      const keys = [tkey, got.kept ? null : got.key].filter(Boolean);
      await Promise.all(keys.map((k) => store.put(k, value, { expirationTtl: KEEP[v.jieshen.source] }).catch(() => {})));
    })());
    return ndjson(readable);
  },
};
