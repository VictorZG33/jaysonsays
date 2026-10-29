// Runs worker/worker.js in Node with the Anthropic API mocked and Workers KV faked by a Map: the
// answers it keeps and when it serves them, without Claude, without the rate limit or without the key.
// No key or Cloudflare account needed.
//   cd worker && npm ci && cd .. && node tools/test-worker.mjs
import assert from 'node:assert/strict';
import { textKey, wineKey } from '../sim.js';

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const msgStart = (id) => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 } } });
const block = (index, content_block, json) => [
  { type: 'content_block_start', index, content_block },
  { type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(json) } },
  { type: 'content_block_stop', index },
];
const end = (out) => [{ type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: out } }, { type: 'message_stop' }];
const verdict = { wine: { identified: true, producer: 'Fait-Main', name: 'Las Piedras', vintage: '2019', region: 'St. Helena', grapes: 'Cabernet Sauvignon', drink_window: '2027–2045', winemaker: 'Benoit Touquette', confidence: 'high', notes: 'n' }, jieshen: { source: 'predicted', score: '96', scale: '100', score_value: 96, history: '', review: 'r', reasoning: 'w', interest: '', sources: [] }, critics: [] };
// Claude looks the wine up, then answers
const turns = [
  [msgStart('msg_1'), ...block(0, { type: 'tool_use', id: 'toolu_1', name: 'lookup_scores', input: {} }, { producer: 'Fait-Main', wine: 'Las Piedras', vintage: '2019' }), ...end(40)],
  [msgStart('msg_2'), ...block(0, { type: 'tool_use', id: 'toolu_2', name: 'give_verdict', input: {} }, verdict), ...end(300)],
];
let calls = 0;
globalThis.fetch = async (url) => {
  assert.match(String(url), /api\.anthropic\.com\/v1\/messages/);
  return new Response(sse(turns[calls++ % 2]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
const { default: worker } = await import('../worker/worker.js');

const kv = new Map(), ttls = new Map();
const ANSWERS = {
  async get(k, type) { assert.equal(type, 'json'); return kv.has(k) ? JSON.parse(kv.get(k)) : null; },
  async put(k, v, opts) { kv.set(k, v); ttls.set(k, opts.expirationTtl); },
};
let limited = 0;
const ASK_LIMIT = { async limit() { limited++; return { success: true } } };
const env = { ANTHROPIC_API_KEY: 'sk-test', ANSWERS, ASK_LIMIT };

// One question through the Worker: its status and events, once everything it does afterwards is done
async function ask(body, e = env) {
  const waits = [];
  const res = await worker.fetch(new Request('https://jaysonsays.example.workers.dev', { method: 'POST', headers: { Origin: 'https://wentaoz.com', 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), e, { waitUntil: (p) => waits.push(p) });
  const text = await res.text();
  await Promise.all(waits);
  return { status: res.status, events: text.trim() ? text.trim().split('\n').map((l) => JSON.parse(l)) : [] };
}
const types = (r) => r.events.map((ev) => ev.type);
const q = { lang: 'zh', text: '2019 Fait-Main Las Piedras', image: null };
const tkey = textKey(q), wkey = wineKey('zh', { producer: 'Fait-Main', wine: 'Las Piedras', vintage: '2019' });

// 1. A new wine: Claude answers, and the answer is kept under the words and under the wine for 30 days
let r = await ask(q);
assert.deepEqual(types(r), ['lookup', 'verdict', 'done']);
assert.equal(calls, 2);
assert.equal(limited, 1);
assert.deepEqual([...kv.keys()].sort(), [tkey, wkey].sort());
assert.equal(ttls.get(wkey), 30 * 86400);
const at = JSON.parse(kv.get(wkey)).at;
assert.match(at, /^\d{4}-\d{2}-\d{2}$/);

// 2. The same words in another order: the kept answer, no Claude, no rate limit
r = await ask({ ...q, text: 'fait-main LAS PIEDRAS 2019' });
assert.deepEqual(types(r), ['cached', 'verdict', 'done']);
assert.equal(r.events[0].at, at);
assert.deepEqual(r.events[1].verdict, verdict);
assert.equal(r.events[2].stop, 'cached');
assert.equal(calls, 2);
assert.equal(limited, 1);

// 3. A photo of the same wine: Claude works out the wine, and its first lookup finds the kept answer
r = await ask({ lang: 'zh', text: '', image: 'aGVsbG8=' });
assert.deepEqual(types(r), ['lookup', 'cached', 'verdict', 'done']);
assert.equal(calls, 3);
assert.equal(kv.size, 2);

// 4. The same words typed another way and answered from the wine: now kept under those words too
calls = 0;
r = await ask({ ...q, text: 'Fait Main Las Piedras 2019 cabernet' });
assert.deepEqual(types(r), ['lookup', 'cached', 'verdict', 'done']);
assert.equal(calls, 1);
assert.equal(kv.size, 3);
assert.equal(JSON.parse(kv.get(textKey({ ...q, text: 'Fait Main Las Piedras 2019 cabernet' }))).at, at);

// 5. fresh: Claude answers again and the answer replaces the kept ones
kv.set(wkey, JSON.stringify({ verdict, at: '2026-01-01' }));
calls = 0;
r = await ask({ ...q, fresh: true });
assert.deepEqual(types(r), ['lookup', 'verdict', 'done']);
assert.equal(calls, 2);
assert.equal(JSON.parse(kv.get(wkey)).at, at);

// 6. His own verdict is kept for 180 days; an answer on no wine isn't kept
const found = JSON.parse(JSON.stringify(verdict)); found.jieshen.source = 'found';
turns[1] = [msgStart('msg_2'), ...block(0, { type: 'tool_use', id: 'toolu_2', name: 'give_verdict', input: {} }, found), ...end(300)];
kv.clear(); calls = 0;
await ask(q);
assert.equal(ttls.get(wkey), 180 * 86400);
const none = { ...verdict, wine: { ...verdict.wine, identified: false }, jieshen: { ...verdict.jieshen, source: 'none' } };
turns[1] = [msgStart('msg_2'), ...block(0, { type: 'tool_use', id: 'toolu_2', name: 'give_verdict', input: {} }, none), ...end(300)];
kv.clear(); calls = 0;
await ask({ ...q, text: 'a cat' });
assert.equal(kv.size, 0);

// 7. Without the KV binding it answers as before and keeps nothing
calls = 0;
r = await ask(q, { ANTHROPIC_API_KEY: 'sk-test', ASK_LIMIT });
assert.deepEqual(types(r), ['lookup', 'verdict', 'done']);
assert.equal(calls, 2);

// 8. Without the key, a kept answer still comes back; anything else is 503 as before
kv.set(tkey, JSON.stringify({ verdict, at }));
r = await ask(q, { ANSWERS, ASK_LIMIT });
assert.deepEqual(types(r), ['cached', 'verdict', 'done']);
r = await ask({ ...q, text: 'something else 2020' }, { ANSWERS, ASK_LIMIT });
assert.equal(r.status, 503);

// 9. Other websites and bad questions are still turned away, before any kept answer
const other = await worker.fetch(new Request('https://x.example', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: JSON.stringify(q) }), env, { waitUntil() {} });
assert.equal(other.status, 403);
assert.equal((await ask({ ...q, fresh: 'yes' })).status, 400);

console.log('OK');
