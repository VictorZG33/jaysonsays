// Runs sim.js against the real Anthropic SDK with the API mocked: checks the input checks, the request
// it sends, the pause_turn continuation and the events it emits. No key needed.
//   cd worker && npm ci && cd .. && node tools/test-engine.mjs
import Anthropic from '../worker/node_modules/@anthropic-ai/sdk/index.mjs';
import { runSimulator, checkInput } from '../sim.js';
import assert from 'node:assert/strict';

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const msgStart = (id) => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 } } });
const turn1 = [
  msgStart('msg_1'),
  { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"杰神 Fait-Main 2019"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://www.sohu.com/a/1_764488', title: 't', encrypted_content: 'x', page_age: null }] } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'pause_turn', stop_sequence: null }, usage: { output_tokens: 50, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } },
  { type: 'message_stop' },
];
const verdict = { wine: { identified: true, producer: 'Fait-Main', name: 'Las Piedras', vintage: '2019', region: 'St. Helena', grapes: 'Cabernet Sauvignon', drink_window: '2027–2045', confidence: 'high', notes: 'n' }, jieshen: { source: 'predicted', score: '96', scale: '100', score_value: 96, review: 'r', reasoning: 'w', interest: '', sources: [] }, critics: [{ critic: 'Jeb Dunnuck', score: '98', url: '' }] };
const turn2 = [
  msgStart('msg_2'),
  { type: 'content_block_start', index: 0, content_block: { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_search', input: {} } },
  { type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"query":"Fait-Main Las Piedras 2019 Jeb Dunnuck"}' } },
  { type: 'content_block_stop', index: 0 },
  { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_1', name: 'give_verdict', input: {} } },
  { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(verdict) } },
  { type: 'content_block_stop', index: 1 },
  { type: 'message_delta', delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 300, server_tool_use: { web_search_requests: 1, web_fetch_requests: 0 } } },
  { type: 'message_stop' },
];
const bodies = [], headers = [];
let n = 0;
const fetchMock = async (url, init) => {
  bodies.push(JSON.parse(init.body)); headers.push(new Headers(init.headers));
  const ev = n++ === 0 ? turn1 : turn2;
  return new Response(sse(ev), { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
const client = new Anthropic({ apiKey: 'sk-test', fetch: fetchMock });
const events = [];
const input = { lang: 'zh', text: '2019 Fait-Main Las Piedras', image: null };
assert.equal(checkInput(input), '');
assert.equal(checkInput({ lang: 'zh', text: '  ' }), 'empty');
assert.equal(checkInput({ lang: 'fr', text: 'x' }), 'bad lang');
assert.equal(checkInput({ lang: 'zh', image: 'not base64!' }), 'bad image');
assert.equal(checkInput({ lang: 'zh', text: 'x'.repeat(201) }), 'text too long');
await runSimulator(client, input, (e) => events.push(e));
assert.equal(bodies.length, 2);
const b = bodies[0];
assert.equal(b.model, 'claude-opus-5-5');
assert.equal(b.stream, true);
assert.deepEqual(b.tools.map((t) => t.name), ['web_search', 'give_verdict']);
assert.equal(b.system[0].cache_control.type, 'ephemeral');
assert.equal(b.fallbacks, 'default');
assert.ok(!('betas' in b), 'betas go in the header');
assert.equal(headers[0].get('anthropic-beta'), 'server-side-fallback-2026-07-01');
assert.equal(bodies[1].messages.length, 2);
assert.equal(bodies[1].messages[1].role, 'assistant');
assert.deepEqual(bodies[1].messages[1].content.map((c) => c.type), ['server_tool_use', 'web_search_tool_result']);
assert.deepEqual(events.map((e) => e.type), ['search', 'search', 'verdict', 'done']);
assert.deepEqual(events[3].usage, { input: 2000, output: 350, cacheRead: 1000, cacheWrite: 0, searches: 2 });
console.log(`OK (system prompt ${b.system[0].text.length} characters)`);
