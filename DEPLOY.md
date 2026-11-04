# Deploying Koorm

The storefront and the API are two separate deployments:

| Part | Lives at | How it ships |
| --- | --- | --- |
| Storefront (`client/client`) | https://koormcollection.com | Hostinger Git, from the `deploy` branch |
| API (`server/server`) | https://accessback.koormcollection.in | Node process, deployed separately |

`vite build` produces a folder of static files, so the storefront can sit on
ordinary shared hosting. The API is a long-running Node process and cannot —
Hostinger shared hosting has no Node runtime, so the API needs the VPS / Node
hosting it is already on.

---

## Storefront

### Why there is a `deploy` branch

Hostinger's Git integration **clones files and nothing else** — it never runs
`npm install` or `npm run build`. Pointing it at `main` would drop raw `.jsx`
into `public_html`, which a browser cannot execute.

So `deploy` is an orphan branch whose root *is* the built site:
`index.html`, `assets/`, `images/`, `.htaccess`. Hostinger clones it verbatim
into `public_html` and everything already sits where the web server expects it.

### One-time hPanel setup

In hPanel → **Websites → koormcollection.com → Advanced → Git**:

| Field | Value |
| --- | --- |
| Repository | `https://github.com/koormstore-spec/koorm_cloths.git` |
| Branch | `deploy` |
| Install path | `public_html` |

**`public_html` must be empty before the first clone or Hostinger refuses it.**
Download a backup of the current contents first, then clear the directory.

For pushes to deploy on their own, open the Git panel's **auto-deployment**
section, copy the webhook URL, and add it in GitHub → repo **Settings →
Webhooks → Add webhook** with content type `application/json`. Without the
webhook you press **Deploy** in hPanel after each release.

### Shipping a change

```bash
git add -A && git commit -m "..." && git push origin main   # source of truth
bash scripts/release.sh                                     # rebuild + push deploy
```

`scripts/release.sh` refuses to run on a dirty tree, rebuilds the client,
verifies `.htaccess` survived the build, and force-pushes `deploy`. Then let
the webhook fire or press Deploy in hPanel.

Verify with a hard reload, and confirm the bundle hash changed:

```bash
curl -s https://koormcollection.com | grep -o 'index-[A-Za-z0-9_-]*\.js'
```

### `.htaccess`

`client/client/public/.htaccess` is copied into `dist/` by every build. It
carries three things that matter:

- **SPA rewrite** — React Router owns the URL, so any path that is not a real
  file falls through to `index.html`. Without it, refreshing `/shop` returns 404.
- **Cache headers** — hashed assets are immutable and cached for a year;
  `index.html` is `no-cache`, otherwise browsers keep booting the old bundle.
- **Dotfile deny** — blocks `.env` / `.git` if either ever lands in the web root.

---

## API

Config lives in `server/server/.env`, modelled on `.env.example`. It is not in
git and must be set on the server. `config/cors.js` already allows
`koormcollection.com` and `www.koormcollection.com` plus any localhost port, so
a local frontend can run against production without a config change.

Health check — reports database, email and payment status:

```bash
curl -s https://accessback.koormcollection.in/api/health
```

### Razorpay

`/api/health` reports the active mode. While `RAZORPAY_KEY_ID` starts with
`rzp_test_`, checkout shows a test-mode notice and takes no real money. Going
live means swapping in the `rzp_live_` pair, creating a **live-mode** webhook
(its secret differs from the test one) at
`https://accessback.koormcollection.in/api/payments/webhook`, and restarting.

---

## Secrets

Never commit a real value to `.env.example`; it is a template and this repo is
public. The MySQL password that was committed in `4879c02` is still in this
repo's history — it is burned and must not be reused.
