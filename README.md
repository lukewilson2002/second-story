# Second Story

Second Story is a web app for running a small resale business. It tracks what you bought, what is listed, what sold, and the profit on each sale after fees, shipping and commission. It also looks up market prices (PriceCharting for games, eBay sold listings for everything else) so you can price an item before buying or listing it.

It works on a phone and on a desktop. One owner logs in with an email and password. Nothing is posted to or synced from the marketplaces: listings and sales are recorded by hand.

- What it does and why: [docs/design.md](docs/design.md)
- How the code is laid out: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)

## Run it on your computer

You need Node.js 22 or newer and pnpm. No Docker and no database server: local runs use PGlite, a Postgres that runs inside the app and keeps its data in `.pglite/dev`.

```sh
pnpm install
pnpm db:reset        # creates the local database with the starter categories and marketplaces
pnpm db:seed:demo    # optional: demo items, listings, fee rules and sales
pnpm dev             # http://localhost:3000
```

Log in with `OWNER_EMAIL` and `DEV_OWNER_PASSWORD` from `.env.development`. Those values are for local use only and protect nothing.

Photos and the eBay lookup need real keys. Put them in `.env.local`, which is never committed:

```
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
RAPIDAPI_KEY=
```

Without them the app still runs. The photo section and the eBay panel each say they are not set up.

Checks:

```sh
pnpm typecheck
pnpm lint
pnpm test                        # unit tests, in-memory database
pnpm build
E2E_PORT=3100 pnpm test:e2e      # browser tests on a production build, desktop and phone, offline
```

`E2E_REAL_SERVICES=1 E2E_PORT=3151 pnpm test:e2e` runs the few tests that call the real Cloudinary, RapidAPI and PriceCharting with the keys from `.env.local`. The first run of a day spends one of the 50 monthly eBay requests.

## Put it online (Vercel and Neon)

Work through these in order. Steps 1 to 4 need no deployment yet.

### 1. Create the Neon database

1. Sign in at [neon.com](https://neon.com) and create a project. Any region close to you is fine.
2. Open **Connect** on the project dashboard and copy two connection strings:
   - the **pooled** one (its host contains `-pooler`). This goes into Vercel.
   - the **direct** one (pooling switched off). This is for step 4.
3. Both must be `*.neon.tech` hosts. The app uses Neon's serverless driver for those and the plain `pg` driver for any other Postgres host.

### 2. Make the password hash and the session secret

```sh
pnpm hash-password         # asks for a password of 10 characters or more, prints OWNER_PASSWORD_HASH=scrypt:...
openssl rand -base64 48    # prints a session secret
```

Keep both for the next step. The password itself is stored nowhere, only its hash. Do not reuse the values in `.env.development`: they are public.

### 3. Create the Vercel project and set its environment variables

1. Push this repository to GitHub, then in Vercel choose **Add New → Project** and import it. The defaults are right: Next.js, pnpm, no build settings to change.
2. Before the first deploy, add these under **Settings → Environment Variables**, for the Production environment:

| Variable | Required | Where it comes from |
| --- | --- | --- |
| `OWNER_EMAIL` | yes | The email you will log in with. |
| `OWNER_PASSWORD_HASH` | yes | The `scrypt:...` value from `pnpm hash-password`. Paste only the value, without `OWNER_PASSWORD_HASH=`. |
| `SESSION_SECRET` | yes | The output of `openssl rand -base64 48`. At least 32 characters. |
| `DATABASE_URL` | yes | The pooled connection string from Neon. |
| `NEXT_PUBLIC_APP_TIME_ZONE` | recommended | Your time zone as an IANA name, for example `America/Chicago`. It decides what "today" and "this month" mean. Without it the app uses UTC. |
| `CLOUDINARY_CLOUD_NAME` | for photos | Cloudinary console → **Settings → API Keys**. The cloud name is at the top. |
| `CLOUDINARY_API_KEY` | for photos | The same page, the key's **API Key** column. |
| `CLOUDINARY_API_SECRET` | for photos | The same row, **API Secret**. Reveal it and copy the whole value. |
| `RAPIDAPI_KEY` | for eBay lookup | [rapidapi.com](https://rapidapi.com), subscribe to "eBay Average Selling Price" (the free plan has 50 requests a month), then copy `X-RapidAPI-Key` from the API's page. |

Do not set `ENABLE_DEV_ROUTES`, `PGLITE_DATA_DIR` or `SESSION_COOKIE_SECURE` on Vercel. `.env.example` describes every variable the code reads.

`NEXT_PUBLIC_APP_TIME_ZONE` is built into the browser code. If you change it later, redeploy.

### 4. Create the tables in Neon

From this folder on your computer, with the **direct** connection string from step 1 and the same email as `OWNER_EMAIL` in Vercel:

```sh
DATABASE_URL='postgresql://...neon.tech/neondb?sslmode=require' OWNER_EMAIL='you@example.com' pnpm db:seed
```

This one command runs the migrations, then creates your user row, the starter categories (Book, Movie with DVD, Blu-ray and VHS, Clothing) and the starter marketplaces (eBay, Mercari, Facebook Marketplace, Vinted). It is safe to run again: it changes nothing that already exists.

- Pass `DATABASE_URL` on the command line as shown. Do not save the production value in `.env.local`, or `pnpm dev` would write to the real database.
- `pnpm db:migrate` with the same `DATABASE_URL` runs only the migrations. Use it after pulling a version that adds one.
- `pnpm db:reset` and `pnpm db:seed:demo` refuse to run when `DATABASE_URL` is set.

### 5. Deploy

Deploy from the Vercel dashboard, or push to the production branch. The app does not create tables on its own in production, so step 4 must be done first.

### 6. Log in for the first time

Open the site and log in with `OWNER_EMAIL` and the password you typed into `pnpm hash-password`. You stay logged in for 30 days on that browser.

- To change the password, run `pnpm hash-password` again, replace `OWNER_PASSWORD_HASH` in Vercel and redeploy.
- To log out every browser at once, replace `SESSION_SECRET` in Vercel and redeploy.

### 7. Enter your fee rules

The app ships with no fee rates, because they change and differ by category. Until you enter them, every fee is $0.00 and every minimum price is too low.

1. Go to **Settings → Marketplaces and fee rules**.
2. For each marketplace you sell on, add a default rule: the percent, whether it applies to shipping, the fixed fee per order, and the payment processing percent and fixed fee if they are billed separately.
3. Add a rule for a category where its rate differs. The most specific rule up the category tree wins.
4. Set the friend's cut under **Settings → Default commission**, if there is one. Commission is a share of profit, so a sale at a loss pays none.
5. Adjust **Settings → Categories** to match what you sell.

Changing a fee rule later does not change sales already recorded. Each sale keeps the fee, cost and commission it was saved with.

### 8. Check the live services

- **Photos:** open an item and upload a photo. If the app says Cloudinary refused the upload, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` do not belong together or the secret is incomplete.
- **Lookup:** open **Price lookup** and search for a game. PriceCharting needs no key. The eBay panel shows how many requests are left this month. Results are kept for 24 hours, so repeating a search is free.
- **Scanning:** open **Scan barcode** on your phone and allow the camera. The site must be on https, which Vercel provides.

## Good to know

- **Import:** Inventory → Import CSV reads a CSV of your existing stock and lets you match its columns by hand. Rows with a quantity of 0 are skipped.
- **Export:** Sales → Export CSV downloads every sale with its fees, costs, commission and profit.
- **Backups:** the data lives in Neon. Neon keeps a restore history whose length depends on your plan.
- **Preview deployments:** the checklist sets variables for Production only. If you want Vercel preview deployments to work, give the Preview environment its own Neon branch and its own `DATABASE_URL`, or previews will fail to start. Never point them at the production database.
- **Login attempts are not rate limited.** A wrong attempt takes about half a second. Use a long password.
