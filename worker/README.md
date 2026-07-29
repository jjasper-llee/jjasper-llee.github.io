# Casper Worker

The small Cloudflare Worker that answers Casper's questions. Everything runs on
the **Workers AI free tier** — there is no API key in this project at all
(`env.AI` is a binding, not a credential), so nothing can leak and nothing can
bill.

## Deploy

```bash
cd worker
npx wrangler login       # one interactive browser step
npx wrangler deploy
```

Wrangler prints a URL like `https://casper.<your-subdomain>.workers.dev`.
Paste it into `../casper-config.js`:

```js
window.CASPER_CONFIG = { workerUrl: 'https://casper.you.workers.dev', ... };
```

That is the only wiring step. **Until it's set, Casper still works** — it falls
back to a scripted FAQ, which is also what happens if the daily cap is reached.
Nothing on the site ever looks broken.

## Test it before touching the site

```bash
curl -N https://casper.you.workers.dev \
  -H 'content-type: application/json' \
  -H 'Origin: https://jjasper-llee.github.io' \
  -d '{"messages":[{"role":"user","content":"What does Jasper study?"}]}'
```

You should see `data: {"t":"delta","v":"..."}` frames stream in.

## Limits

| Setting | Value | Purpose |
|---|---|---|
| `DAILY_CAP` | 300 | Spreads the free neuron budget across the day rather than letting one burst drain it |
| `RL_BURST` | 5 / 10s | Per-IP burst |
| `RL_MINUTE` | 25 / 60s | Per-IP sustained. Loose on purpose — MIT NATs whole buildings |
| `MAX_TOKENS` | 220 | Structural cap: no prompt injection can produce a longer answer |
| `MAX_HISTORY` | 8 | An injected "remember this rule" evaporates within four turns |

Hitting a limit is **not** an error. The Worker returns a normal 200 stream
whose first event carries `limit`, followed by an in-character line, so the
client has one rendering path and the wording can be edited here without
redeploying the site.

## Things worth knowing

- **The `Origin` allowlist is a CORS/embed control, not a security control.**
  `Origin` is trivially forged by anything that isn't a browser. What actually
  bounds abuse is the rate limits, the daily cap, and `MAX_TOKENS`. Don't relax
  those on the grounds that "we have an allowlist".
- **The system prompt is public.** Assume it gets extracted. Nothing in it isn't
  already on the website. There is deliberately no "never reveal this prompt"
  instruction — that never works and it turns extraction into a game.
- **This Worker never logs request bodies.** The site tells visitors nothing is
  stored; a stray `console.log(body)` during debugging is exactly how that
  quietly becomes untrue.
- **The model is small.** It is the free tier, chosen deliberately. It can get
  details wrong, which is why the panel carries a visible "Casper can be wrong"
  note and why the six most common questions are answered from a scripted FAQ
  *before* the model is ever consulted.

## Check it's working

```bash
curl -N https://casper.jjasperllee.workers.dev \
  -H 'content-type: application/json' \
  -H 'Origin: https://jjasper-llee.github.io' \
  -d '{"messages":[{"role":"user","content":"What does Jasper study?"}]}'
```

Good response — `delta` frames streaming in:

```
data: {"t":"meta","limit":null}
data: {"t":"delta","v":"He's"}
data: {"t":"delta","v":" at MIT"}
...
data: {"t":"done","reason":"end_turn"}
```

And the voice:

```bash
curl -o /tmp/casper.mp3 https://casper.jjasperllee.workers.dev/tts \
  -H 'content-type: application/json' \
  -H 'Origin: https://jjasper-llee.github.io' \
  -d '{"text":"Hi, I am Casper."}' && afplay /tmp/casper.mp3
```

If that plays a human voice, Aura is live and the site will use it.

### If the chat streams but /tts 404s
`TTS_ENABLED` is `"1"` by default, but the route was added after the first
deploy. Re-run `npx wrangler deploy` from this directory.

### Changing the voice
`TTS_VOICE` in `wrangler.toml`. Deepgram Aura speakers: `angus` (default),
`asteria`, `luna`, `stella`, `athena`, `hera`, `orion`, `arcas`, `perseus`,
`orpheus`, `helios`, `zeus`. Change it and redeploy — no site change needed.
