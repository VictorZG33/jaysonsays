# 杰神模拟器 · Jieshen Simulator

Photograph a wine label, or type the wine, and see the score 杰神 gave it, or the one he would. Live at **https://wentaoz.com/jaysonsays/** once GitHub Pages is on (see [Deploying](#deploying)).

拍一张酒标，或者直接输入酒名，看看杰神给过几分。页面先认出这是哪款酒（酒庄、酒款、年份、产区、适饮期），再查杰神有没有评过：评过，就给出他的原始分数和出处；没评过，就按他一贯的打分习惯预测一个分数，并模仿他的口吻写一段短评。模拟的部分会标明，不是他本人写的。

杰神 (Jieshen) writes the Chinese WeChat account 杰神自号. Every year he publishes 杰神葡萄酒榜单, a list of the fine wines he drank with a verdict on each, and he is blunt about it: he scores about 4 points below the Parker school on average, calls anything under 93 hard to drink, and marks down young Bordeaux and Italy as readily as he praises ripe, pure Napa cabernet. That makes him unusually predictable, which is what this page is built on.

## What it does

1. **Identifies the wine** from the label photo or the typed name: producer, cuvée, vintage, region, grapes, who made it and a drinking window. Where the label is unclear it says what it assumed.
2. **Looks up his verdict** in a table of every score of his that could be collected: his lists from 2016 to 2025 and the wines his articles judge, 1,359 rows. It counts only when producer, wine and vintage all match, and it shows the source.
3. **Otherwise predicts** the score he would give, on his 100-point scale, from his rules: a starting point for the region, what he gave other vintages of the same wine and the same producer, who made this vintage, and other critics' scores for the wine (Wine Advocate, Jeb Dunnuck …), which it looks up on the web. Then it writes a short note in his voice. The page marks a prediction with a dashed seal and says he didn't write it.
4. **Notes his interests**: where his import company has sold the producer's wine, or the wine is his own, the page says so.

It works in Chinese and English, in light and dark, on a phone.

## How it works

The page sends the photo (scaled to at most 1568 px) and the text to Claude Opus 5.5. The system prompt holds his framework; with the tools it comes to about 13,000 tokens, the same for every visitor, so it is cached. The table isn't in the prompt: Claude calls the `lookup_scores` tool with the producer's name, and `sim.js` answers with every row of that producer, all its wines and vintages, so Claude decides what matches and has the producer's other verdicts to predict from, and with them who made which vintages there. The lookup compares names as words, without accents, case or words like *Domaine* and *Château*, so "DRC", "Domaine de la Romanée-Conti" and "Romanee-Conti" all find the same rows. Claude answers through one tool, `give_verdict`, with a strict schema, so the page always gets the same fields back. Web search (at most 3 searches) only finds other critics' scores for a prediction: his own scores sit in image tables inside WeChat articles, which search engines don't index, so the table is the only place to look them up.

By default the request goes through the Cloudflare Worker in `worker/`, which keeps the site's Anthropic API key secret, checks the input, allows 3 questions a minute per IP address and only accepts requests from wentaoz.com. A visitor can tick *Use my own Anthropic API key*; the page then runs the same code in the browser with their key (kept in `localStorage` under `jaysonsays.apiKey` only if they tick *Remember*).

## Files

- `index.html`: the page. `ENDPOINT` near the top of its script is the Worker's address; `PRICE` is what it charges per token and per search, for the cost line under each answer.
- `sim.js`: the engine, shared by the page and the Worker. `checkInput` checks a question, `buildRequest` shapes the Claude request (prompt, tools, the `give_verdict` schema), `lookupScores` answers Claude's table lookups, and `runSimulator` runs the conversation: it answers lookups (at most 4), continues a turn the API paused, and reports each lookup, search, the verdict and the token counts as events.
- `reviews.js`: what it knows about 杰神. `FRAMEWORK` is his framework in Chinese, which goes into the prompt: his scales, how he relates to other critics, what he rewards and punishes, his interests, his rules for a score, his voice. `WINEMAKERS` says who made which vintages at 34 producers, each with its source, for the lookups to return with a producer's rows. `SOURCES` are the articles, `REVIEWS` the rows that lookups read, one wine each: producer, wine, vintage, his score, the critics' scores printed next to it, the source, and the gist of his note.
- `worker/`: the Cloudflare Worker (`worker.js`, `wrangler.toml`).
- `.github/workflows/worker.yml`: deploys the Worker.
- `tools/`: the tests.
- `og.png`: the 1200×630 link-preview image.

## The data

His WeChat articles can't be read outside WeChat, so the lists come from printouts and screenshots of the original articles and from the account's mirror on Sohu (author 764488, June 2017 to April 2020). His score tables are images; every one was read row by row.

| List | Published | Wines | His verdict | Source |
|---|---|---|---|---|
| 2016 | 2017-01-24 | 200 | words: 超级好喝, 好喝, 很普通 / 不好喝, 难喝, 超级难喝, 表现正常, and remarks | article text |
| 2017 | 2018-02-02 | 146 of 163 | 1–6 stars, and the wine's state (超级年轻 … 老) | printout |
| 2018 | 2019-01-23 | 241 | 1–6 stars | Sohu mirror |
| 2019 | 2020-01-29 | 201 | out of 100, with WA/RP and Jeb Dunnuck | Sohu mirror |
| 2021 | 2022-02-28 | 106 | out of 100 | printout |
| 2022 | 2023-02-19 | 107 | out of 100 | screenshots |
| 2023 | 2024-01-19 | 106 | out of 100 | printout |
| 2025 | 2026-02-09 | 210 | a colour per wine (see below) | screenshots |

Each list matches the number of wines, of 100-point wines and of RP 100 wines its article states, and for 2017, 2018 and 2019 the regional averages he published come out of the transcription exactly. The 2017 article itself lacks 17 wines (two tables). No 2020 list exists; a 2024 list probably does (the 2025 article mentions it) but hasn't been found. The 2018 screenshots resolved four star ratings a watermark hides on the Sohu copy. Another 41 rows are verdicts from his other articles (a 2018 tasting of 2013 Napa 100-point wines, his piece on Opus One, and others).

**2025 has no scores.** He prints each wine's name in a colour and says the list gives enough hints, without a legend. What the article says about the wines it names fits one reading, which the table uses:

| Colour | Wines | Reading | Wines the article names |
|---|---|---|---|
| red | 6 | 超一流, outstanding | Yquem 1943 ("the best Yquem I've had"), La Chapelle 1961, Huet Le Haut-Lieu 1947, Egon Müller Eiswein 1983 |
| blue | 19 | 顶级, top-class | Krug Clos du Mesnil 2008 ("论牛逼还是得看"); Marcassin Chardonnay up to 2012 |
| black | 125 | 正常, ordinary | 木杺红 2023 ("finally drinkable"), Tiansai Chardonnay ("on the right path") |
| orange | 13 | 老了/失望, old or not worth its name | Le Pin 1982, Latour à Pomerol 1961, Petrus 1947, Vega Sicilia 1962 ("垂垂老矣"), Rousseau Chambertin 1991 (disappointing), Screaming Eagle 1992 |
| green | 46 | 糟糕, poor | Fourrier, Kalin, Les Horées, Guilbert Gillet, William Kelley's Aligoté 2022 (worst of the year), DRC Romanée-Conti 2022 (most disappointing), Marcassin Chardonnay after 2012 |
| grey | 1 | 最恶心, the most disgusting | Audiffred Vosne-Romanée Reignots 2022 |

The colours were measured from the pixels, not judged by eye. The framework tells Claude the reading is inferred and to say so.

Scores are as he gave them. The notes are paraphrases, never his text, and the page shows only scores, paraphrases and links to the sources.

**Winemakers.** He holds that the winemaker shapes a wine far more than its vineyard, and his verdicts on a producer change when its winemaker does: Realm is "the real Realm" from 2012 (Benoit Touquette arrived in September 2011), Bryant was best under Helen Turley and slipped after 2002, Colgin rose after 2010 (Allison Tauziet, from 2007), Dana stopped being too hard in 2015 (Chris Cooney, from 2015). The framework says which winemakers he admires (Michel Rolland above all, then Thomas Rivers Brown, Philippe Melka and Benoit Touquette, who make his own Fairest Creature) and which he doesn't, from his articles; `WINEMAKERS` says who made which vintages, from the wineries and the wine press, and leaves a gap where no source confirms it. A prediction counts a producer's other vintages as evidence only when the same winemaker made them.

**Adding a list**: append its rows to `REVIEWS` in table order, one array per wine, and its article to `SOURCES`; if it changes his habits (a new scale, a new favourite), update `FRAMEWORK` too. Check the counts against what the article states before you commit. A push to `main` that changes `reviews.js` redeploys the Worker.

## Deploying

Once, in this repository's settings:

1. **Pages**: Settings → Pages → Build and deployment → Source: *Deploy from a branch*, Branch: `main`, folder `/ (root)`. Like every project site of VictorZG33, it is served at `https://wentaoz.com/jaysonsays/` because it inherits the custom domain of the `VictorZG33.github.io` user site.
2. **Secrets**: Settings → Secrets and variables → Actions, the same three as the golf coach server in VictorZG33.github.io:
   - `CLOUDFLARE_API_TOKEN`: a Cloudflare API token from the *Edit Cloudflare Workers* template (My Profile → API Tokens).
   - `CLOUDFLARE_ACCOUNT_ID`: from the Workers & Pages overview.
   - `ANTHROPIC_API_KEY`: a key from a workspace with a monthly spend limit in the Anthropic Console; the limit is what caps the bill.
3. **Worker**: Actions → Worker → Run workflow. The run's summary shows the Worker's address, `https://jaysonsays.<subdomain>.workers.dev`, which should match `ENDPOINT` in `index.html`.

After that, `.github/workflows/worker.yml` redeploys the Worker whenever `worker/`, `sim.js` or `reviews.js` changes on `main`, and uploads the key each time, so to change the key, update the secret and run the workflow again. Without the key the Worker answers `503 not_configured` and the page points visitors to their own key. Claude's web search is on for every Anthropic organization unless an administrator has turned it off (Console → Settings → Capabilities); if it is off, every question fails with a 400 saying so.

To deploy by hand instead: `cd worker && npm install && npx wrangler login && npx wrangler secret put ANTHROPIC_API_KEY && npx wrangler deploy`.

## Testing

```sh
cd worker && npm ci && cd ..
node tools/test-engine.mjs                     # the engine against the real SDK, API mocked
python3 -m http.server 8765 --bind 127.0.0.1   # then, in another shell:
node tools/test-page.cjs                       # the page in Chromium, Worker mocked
```

To try the Worker itself, put `ANTHROPIC_API_KEY=...` in `worker/.dev.vars` (git-ignored) and run `npx wrangler dev` in `worker/`; it accepts requests only with `Origin: https://wentaoz.com`.

## Cost

Each question is a short Claude Opus 5.5 conversation: usually one turn to look the producer up and one to answer. The cached part (the prompt and the tools, about 13,000 tokens) costs about US$0.07 to write for the first question in five minutes and about half a cent to read for later ones; a lookup's rows add a few thousand input tokens. Measured on the live site: 2015 Realm The Absurd, which he has scored three times, cost US$0.11 with the cache cold; a prediction for 2021 Ridge Monte Bello, with one search for other critics' scores (US$0.01 a search plus the results as input tokens), cost US$0.07 with the cache warm. Expect about US$0.05–0.15 a question. (With the whole table in the prompt, as at first, the prompt was 76,505 tokens and a question cost about US$0.40.) `SIM_MODEL` in `sim.js` picks the model; Claude Sonnet 5.5 costs about half as much (change `PRICE` in `index.html` to match).

## Disclaimer

This is a toy and has nothing to do with 杰神 himself. His scores and articles are his; predicted scores and notes are simulations inferred from what he has published, and the page says so wherever it shows one.
