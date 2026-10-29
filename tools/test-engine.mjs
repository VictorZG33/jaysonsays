// Runs sim.js against the real Anthropic SDK with the API mocked: checks the input checks, the table
// lookup, the request it sends, the lookup round trip, the pause_turn continuation and the events it
// emits. No key needed.
//   cd worker && npm ci && cd .. && node tools/test-engine.mjs
import Anthropic from '../worker/node_modules/@anthropic-ai/sdk/index.mjs';
import { runSimulator, checkInput, lookupScores, textKey, wineKey, ANSWER_VERSION } from '../sim.js';
import assert from 'node:assert/strict';

// The lookup finds producers however they are spelled, and only them
const producers = (q, wine = '') => [...new Set(lookupScores({ producer: q, wine }).split('\n\nSources:')[0].split('\n').slice(1).map((l) => l.split(' | ')[0]))];
assert.deepEqual(producers('Realm Cellars', 'The Absurd'), ['Realm Cellars']);
assert.deepEqual(producers('DRC', 'La Tache'), ['Domaine de la Romanee-Conti']);
assert.deepEqual(producers('Domaine de la Romanée-Conti'), ['Domaine de la Romanee-Conti']);
assert.deepEqual(producers('Lafite'), ['Chateau Lafite Rothschild']);
assert.deepEqual(producers('Le Pin'), ['Le Pin']);
assert.deepEqual(producers('木杺红'), ['木杺 (Mu Xin)']);
assert.deepEqual(producers('Penfolds Grange'), ['Penfolds']);
assert.deepEqual(producers('de Vogüé', 'Musigny'), ['Domaine Comte Georges de Vogue']);
assert.match(lookupScores({ producer: 'Two Buck Chuck', wine: '' }), /^No rows/);
assert.match(lookupScores({ producer: 'Realm', wine: 'The Absurd' }), /Realm Cellars \| Absurd \| 2015 \| 100 \| RP100 JD100 \| L19/);
assert.match(lookupScores({ producer: 'Realm', wine: 'The Absurd' }), /L19: 杰神葡萄酒榜单·2019, 2020-01-29, https:\/\/www\.sohu\.com\/a\/369445347_764488/);
// and says who made which vintages there, with or without rows of his
assert.match(lookupScores({ producer: 'Realm Cellars', wine: 'The Bard' }), /\n\nWho made the wine there[^\n]*\nRealm Cellars \| Benoit Touquette \| 酿酒师 \| 2011–2022 全程；2023、2024 只负责采收和发酵 \|/);
assert.match(lookupScores({ producer: 'Tusk Estates', wine: '' }), /\nTusk \| Philippe Melka \|/);
assert.match(lookupScores({ producer: 'Fairest Creature', wine: 'Triniceros' }), /^No rows for "Fairest Creature"[^\n]*\n\nWho made the wine there[^]*Michel Rolland \| 调配 \| 2018–2024/);
assert.ok(!lookupScores({ producer: 'Le Pin', wine: '' }).includes('Who made'));

// Answers are kept under the words asked, in any order, and under the wine and vintage
assert.equal(textKey({ lang: 'zh', text: '2024 Realm The Bard' }), textKey({ lang: 'zh', text: 'realm  bard 2024' }));
assert.notEqual(textKey({ lang: 'zh', text: '2024 Realm The Bard' }), textKey({ lang: 'en', text: '2024 Realm The Bard' }));
assert.equal(textKey({ lang: 'zh', text: 'Realm', image: 'abc' }), null);
assert.equal(wineKey('zh', { producer: 'Realm Cellars', wine: 'The Bard', vintage: '2024' }), `${ANSWER_VERSION}:zh:w:realm|bard|2024`);
assert.equal(wineKey('zh', { producer: 'Realm', wine: 'Bard', vintage: '2024' }), wineKey('zh', { producer: 'Realm Cellars', wine: 'The Bard', vintage: '2024' }));
assert.equal(wineKey('zh', { producer: 'Krug', wine: 'Grande Cuvée', vintage: 'nv' }), `${ANSWER_VERSION}:zh:w:krug|grande cuvee|NV`);
assert.equal(wineKey('zh', { producer: 'Realm', wine: 'The Bard', vintage: '' }), null);

const sse = (events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
const msgStart = (id) => ({ type: 'message_start', message: { id, type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 1, cache_read_input_tokens: 500, cache_creation_input_tokens: 0 } } });
const block = (index, content_block, json) => [
  { type: 'content_block_start', index, content_block },
  ...(json ? [{ type: 'content_block_delta', index, delta: { type: 'input_json_delta', partial_json: JSON.stringify(json) } }] : []),
  { type: 'content_block_stop', index },
];
const end = (stop, out, searches) => [
  { type: 'message_delta', delta: { stop_reason: stop, stop_sequence: null }, usage: { output_tokens: out, server_tool_use: { web_search_requests: searches, web_fetch_requests: 0 } } },
  { type: 'message_stop' },
];
// 1: Claude asks for the producer's rows; 2: it searches and the API pauses the turn; 3: the verdict
const turn1 = [msgStart('msg_1'), ...block(0, { type: 'tool_use', id: 'toolu_1', name: 'lookup_scores', input: {} }, { producer: 'Fait-Main', wine: 'Las Piedras', vintage: '2019' }), ...end('tool_use', 40, 0)];
const turn2 = [
  msgStart('msg_2'),
  ...block(0, { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: {} }, { query: 'Fait-Main Las Piedras 2019 Wine Advocate' }),
  ...block(1, { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [{ type: 'web_search_result', url: 'https://example.com', title: 't', encrypted_content: 'x', page_age: null }] }),
  ...end('pause_turn', 50, 1),
];
const verdict = { wine: { identified: true, producer: 'Fait-Main', name: 'Las Piedras', vintage: '2019', region: 'St. Helena', grapes: 'Cabernet Sauvignon', drink_window: '2027–2045', winemaker: 'Benoit Touquette', confidence: 'high', notes: 'n' }, jieshen: { source: 'predicted', score: '96', scale: '100', score_value: 96, history: '', review: 'r', reasoning: 'w', interest: '', sources: [] }, critics: [{ critic: 'Jeb Dunnuck', score: '98', url: '' }] };
const turn3 = [
  msgStart('msg_3'),
  ...block(0, { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_search', input: {} }, { query: 'Fait-Main Las Piedras 2019 Jeb Dunnuck' }),
  ...block(1, { type: 'tool_use', id: 'toolu_2', name: 'give_verdict', input: {} }, verdict),
  ...end('tool_use', 300, 1),
];
const turns = [turn1, turn2, turn3];
const bodies = [], headers = [];
const fetchMock = async (url, init) => {
  bodies.push(JSON.parse(init.body)); headers.push(new Headers(init.headers));
  return new Response(sse(turns[bodies.length - 1]), { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
const client = new Anthropic({ apiKey: 'sk-test', fetch: fetchMock });
const events = [];
const input = { lang: 'zh', text: '2019 Fait-Main Las Piedras', image: null };
assert.equal(checkInput(input), '');
assert.equal(checkInput({ lang: 'zh', text: '  ' }), 'empty');
assert.equal(checkInput({ lang: 'fr', text: 'x' }), 'bad lang');
assert.equal(checkInput({ lang: 'zh', image: 'not base64!' }), 'bad image');
assert.equal(checkInput({ lang: 'zh', text: 'x'.repeat(201) }), 'text too long');
assert.equal(checkInput({ lang: 'zh', text: 'x', fresh: 'yes' }), 'bad fresh');
const asked = [];
const got = await runSimulator(client, input, (e) => events.push(e), { recall: async (k) => { asked.push(k); return null; } });

assert.equal(bodies.length, 3);
const b = bodies[0];
assert.equal(b.model, 'claude-opus-5-5');
assert.equal(b.stream, true);
assert.deepEqual(b.tools.map((t) => t.name), ['web_search', 'lookup_scores', 'give_verdict']);
assert.equal(b.system[0].cache_control.type, 'ephemeral');
assert.ok(b.system[0].text.length < 15000, 'the table stays out of the prompt');
assert.equal(b.fallbacks, 'default');
assert.ok(!('betas' in b), 'betas go in the header');
assert.equal(headers[0].get('anthropic-beta'), 'server-side-fallback-2026-07-01');
// the lookup's answer goes back as a tool result, after Claude's turn
const [, claude, answered] = bodies[1].messages;
assert.equal(claude.role, 'assistant');
assert.equal(answered.content[0].type, 'tool_result');
assert.equal(answered.content[0].tool_use_id, 'toolu_1');
assert.match(answered.content[0].content, /Fait-Main \| Beckstoffer Las Piedras Vineyard Cabernet Sauvignon \| 2018 \| 97/);
assert.match(answered.content[0].content, /Fait-Main \| Benoit Touquette \| 庄主、酿酒师/);
// the paused turn goes back as it came, with no extra user message
assert.equal(bodies[2].messages.length, 4);
assert.deepEqual(bodies[2].messages[3].content.map((c) => c.type), ['server_tool_use', 'web_search_tool_result']);
assert.deepEqual(events.map((e) => e.type), ['lookup', 'search', 'search', 'verdict', 'done']);
assert.equal(events[0].producer, 'Fait-Main');
assert.deepEqual(events[4].usage, { input: 3000, output: 390, cacheRead: 1500, cacheWrite: 0, searches: 2 });
// it looked for a kept answer once, at the first lookup, and says where to keep this one
const key = wineKey('zh', { producer: 'Fait-Main', wine: 'Las Piedras', vintage: '2019' });
assert.deepEqual(asked, [key]);
assert.deepEqual(got, { verdict, key, kept: null });

// A kept answer for the wine ends the conversation at the first lookup
bodies.length = 0;
const kept = { verdict, at: '2026-10-01' }, events2 = [];
const got2 = await runSimulator(client, input, (e) => events2.push(e), { recall: async (k) => (k === key ? kept : null) });
assert.equal(bodies.length, 1);
assert.deepEqual(events2.map((e) => e.type), ['lookup', 'cached', 'verdict', 'done']);
assert.equal(events2[1].at, '2026-10-01');
assert.equal(events2[3].stop, 'cached');
assert.deepEqual(events2[3].usage, { input: 1000, output: 40, cacheRead: 500, cacheWrite: 0, searches: 0 });
assert.deepEqual(got2, { verdict, key, kept });
console.log(`OK (system prompt ${b.system[0].text.length} characters)`);
