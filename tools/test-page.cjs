// Drives the page in Chromium with the Worker mocked: every kind of verdict (his score in points, stars
// and words, a prediction, not a wine), the error paths and a photo upload, in both languages and
// themes. Prints what each run sent and showed, and saves full-page screenshots to tools/shots/.
//   python3 -m http.server 8765 --bind 127.0.0.1    (in the repository root)
//   node tools/test-page.cjs
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = __dirname + '/shots';
fs.mkdirSync(OUT, { recursive: true });
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: '127.0.0.1,localhost' } : undefined;

const predicted = {
  wine: { identified: true, producer: 'Fait-Main (费特曼)', name: 'Beckstoffer Las Piedras Vineyard Cabernet Sauvignon', vintage: '2019', region: 'St. Helena, Napa Valley, California, USA', grapes: 'Cabernet Sauvignon', drink_window: '2027–2045', confidence: 'high', notes: '酒标上能清楚读到酒庄、园名和年份。' },
  jieshen: { source: 'predicted', score: '96', scale: '100', score_value: 96, review: '甘草和黑醋栗打头，干净，层层往外翻，骨架撑得住浓度。纳帕这个价位里少见的不油腻，中段扎实，再放五年会更愉悦。', reasoning: '纳帕顶级赤霞珠起点 94；JD 98 减 4 再取平均得 94；Las Piedras 园他在 2013 酒会上评价很高（干净、骨架平衡），风格对他胃口，加 2 分。', interest: '', sources: [{ title: '杰神酒会后记 | 2013年份纳帕盛宴，满分酒精彩各异', url: 'https://www.sohu.com/a/253269736_764488', date: '2018-09-11' }] },
  critics: [{ critic: 'Jeb Dunnuck', score: '98', url: 'https://jebdunnuck.com/x' }, { critic: 'Wine Advocate', score: '97+', url: '' }, { critic: 'Vinous', score: '96', url: '' }],
};
const found = JSON.parse(JSON.stringify(predicted));
found.wine.producer = 'Realm Cellars'; found.wine.name = 'The Absurd'; found.wine.vintage = '2015';
Object.assign(found.jieshen, { source: 'found', score: '100', scale: '100', score_value: 100, review: '榜单里只有分数，没有单独评语。100 在他那里是封神，一年只有几款。', reasoning: '杰神葡萄酒榜单·2019 给了 100，同榜 2016 年份也是 100。', interest: '据他 2017–2019 年的文章，他的公司杰森洋行卖过 Realm 的酒。', sources: [{ title: '杰神葡萄酒榜单·2019', url: 'https://www.sohu.com/a/369445347_764488', date: '2020-01-29' }] });
found.critics = [{ critic: 'Wine Advocate', score: '100', url: '' }, { critic: 'Jeb Dunnuck', score: '100', url: '' }];
const stars = JSON.parse(JSON.stringify(found));
Object.assign(stars.wine, { producer: 'Petrus', name: 'Pomerol', vintage: '1983', region: 'Pomerol, Bordeaux, France', grapes: 'Merlot' });
Object.assign(stars.jieshen, { score: '1★', scale: 'stars', score_value: 80, review: '黑榜上的一瓶：有一股下水道似的臭味，非常糟。', reasoning: '杰神葡萄酒榜单·2018 给了 1 星，是全榜最低。', interest: '', sources: [{ title: '杰神葡萄酒榜单·2018', url: 'https://www.sohu.com/a/291017193_764488', date: '2019-01-23' }] });
stars.critics = [];
const words = JSON.parse(JSON.stringify(found));
Object.assign(words.wine, { producer: 'Domaine de la Romanée-Conti', name: 'Romanée-Conti Grand Cru', vintage: '1990', region: 'Vosne-Romanée, Burgundy, France', grapes: 'Pinot Noir' });
Object.assign(words.jieshen, { score: '超级好喝', scale: 'words', score_value: 99, review: '2016 年的榜单只有文字评级，这瓶是最高一档。', reasoning: '杰神葡萄酒榜单·2016。', interest: '', sources: [{ title: '杰神葡萄酒榜单·2016', url: 'https://weixin.sogou.com/weixin?type=2&query=x', date: '2017-01-24' }] });
words.critics = [];
const notWine = { wine: { identified: false, producer: '', name: '', vintage: '', region: '', grapes: '', drink_window: '', confidence: 'low', notes: '照片里是一只猫，不是酒标。' }, jieshen: { source: 'none', score: '', score_value: 0, review: '', reasoning: '', sources: [] }, critics: [] };
const nd = (v) => [
  { type: 'search', query: '杰神 Fait-Main 2019' },
  { type: 'search', query: '杰神自号 Las Piedras' },
  { type: 'search', query: 'Fait-Main Las Piedras 2019 Wine Advocate Jeb Dunnuck score' },
  { type: 'verdict', verdict: v },
  { type: 'done', stop: 'tool_use', usage: { input: 3000, output: 2100, cacheRead: 21000, cacheWrite: 0, searches: 3 } },
].map((e) => JSON.stringify(e)).join('\n') + '\n';

(async () => {
  const browser = await chromium.launch({ proxy });
  const errors = [];
  async function run(name, { width = 390, height = 844, dark = false, lang = 'zh', reply, photo = false, text = '2019 Fait-Main Las Piedras' }) {
    const ctx = await browser.newContext({ viewport: { width, height }, colorScheme: dark ? 'dark' : 'light', locale: lang === 'zh' ? 'zh-CN' : 'en-US' });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(name + ': ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
    let sent = null;
    await page.route((u) => u.host === 'jaysonsays.wentaozhang1997.workers.dev', async (route) => {
      sent = JSON.parse(route.request().postData() || '{}');
      if (typeof reply === 'function') return reply(route);
      await route.fulfill({ status: 200, headers: { 'content-type': 'application/x-ndjson', 'access-control-allow-origin': '*' }, body: reply });
    });
    await page.route((u) => u.host === 'gc.zgo.at', (r) => r.abort());
    await page.goto('http://127.0.0.1:8765/');
    await page.waitForTimeout(800);
    if (reply) {
      if (photo) {
        const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 2400; c.height = 1200; const g = c.getContext('2d'); g.fillStyle = '#eee'; g.fillRect(0, 0, 2400, 1200); g.fillStyle = '#000'; g.font = '120px serif'; g.fillText('FAIT-MAIN 2019', 300, 600); return c.toDataURL('image/png').split(',')[1]; });
        await page.setInputFiles('#file', { name: 'label.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
        await page.waitForSelector('#photo:not([hidden])');
      }
      if (text) await page.fill('#text-input', text);
      await page.click('#go');
      await page.waitForFunction(() => !document.querySelector('#go').disabled);
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    const info = await page.evaluate(() => ({ msg: document.querySelector('#ask-msg').textContent, steps: [...document.querySelectorAll('#steps li')].map((l) => l.textContent), meta: document.querySelector('#meta').textContent, overflow: document.documentElement.scrollWidth > window.innerWidth }));
    if (sent && sent.image) sent.image = `<${sent.image.length} chars>`;
    console.log(name, JSON.stringify({ sent, ...info }));
    await ctx.close();
  }
  await run('01-start', {});
  await run('02-start-desktop-en', { width: 1200, height: 900, lang: 'en' });
  await run('03-predicted', { reply: nd(predicted) });
  await run('04-found-dark', { reply: nd(found), dark: true });
  await run('04b-found-stars', { reply: nd(stars) });
  await run('04c-found-words-en', { reply: nd(words), lang: 'en' });
  await run('05-notwine', { reply: nd(notWine) });
  await run('06-en-predicted-desktop', { reply: nd(predicted), lang: 'en', width: 1200, height: 900 });
  await run('07-error-503', { reply: (r) => r.fulfill({ status: 503, headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' }, body: '{"error":"not_configured"}' }) });
  await run('08-error-instream', { reply: JSON.stringify({ type: 'error', status: 400, message: 'Your credit balance is too low' }) + '\n' });
  await run('09-photo', { reply: nd(predicted), photo: true, text: '' });
  await run('10-empty', { reply: nd(predicted), text: '' });
  console.log('errors:', errors);
  await browser.close();
})();
