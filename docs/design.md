# Second Story: Design Doc

Status: draft, 2026-11-23

## 1. Overview

Second Story is a responsive web app for running a small resale operation. It tracks what was bought, what is listed, what sold, and how much profit each sale made after fees, shipping, and commission. It also looks up market prices so items can be priced before buying or listing.

### Goals

- Add inventory fast, including from a phone.
- Track listings across marketplaces, with one listing covering one or more inventory items.
- Show the minimum price that still makes a profit, before listing.
- Calculate profit automatically when a listing sells.
- Look up comparable prices (PriceCharting for games, eBay sold listings for everything else).
- Show the health of the business on a dashboard.

### Non-goals (v1)

- Publishing listings to marketplaces or syncing orders from them. Listings are recorded by hand.
- Buying shipping labels.
- Bookkeeping or tax filing. Export covers that.
- Returns and refunds.
- Overhead expenses (supplies, mileage, subscriptions).
- Tracking items that leave stock without a sale. Quantity is edited by hand.
- Price history per item.
- Native mobile apps.

## 2. Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js (App Router), React Server Components | Server Actions for mutations, Route Handlers for external lookups |
| Language | TypeScript, `strict: true` | Also `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` |
| Database | Neon Postgres | One branch per environment; preview branches for PRs |
| Data access | Kysely | Kysely is a typed query builder, not an ORM. Types are generated from the schema (`kysely-codegen`). Migrations use Kysely's migrator. Connects through Neon's serverless driver. |
| Validation | Zod | One schema per form, shared by client and Server Action |
| Files | Cloudinary | Signed direct uploads from the browser. The DB stores `public_id` and dimensions only. |
| UI | Tailwind, a headless table library, a chart library | Specific libraries to be chosen at build time |
| Hosting | Vercel | Preview deployments per PR, each paired with a Neon preview branch. Secrets (database URL, Cloudinary, RapidAPI) live in Vercel environment variables. |

Money is stored as integer cents. Percentages are stored as basis points (1250 = 12.5%). No floats touch money.

## 3. Data model

```
category ──< category (parent_id)
category ──< inventory_item ──< item_identifier
                    │──────────< item_photo
                    │──────────< purchase
                    └──< listing_item >── listing ──< sale
                                            └──< listing_marketplace >── marketplace ──< fee_rule
sale >── marketplace
```

Every table also carries `user_id`. It is left out of the tables below for brevity.

### category

Self-referential tree, any depth. Seeded with Book, Movie (DVD, Blu-ray, VHS), Clothing. Users add, rename, move, and archive categories.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| parent_id | uuid null | Null for top level |
| name | text | Unique within a parent |
| archived_at | timestamptz null | Archived categories stay on old items but leave pickers |

### inventory_item

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| title | text | Short name shown in tables |
| description | text null | |
| category_id | uuid | |
| condition | text null | Free text |
| quantity_on_hand | int | Incremented by each purchase, decremented when a sale is recorded. Editable by hand for corrections. |
| storage_location | text null | Bin or shelf |
| notes | text null | |
| created_at, updated_at | timestamptz | |

Status is derived, not stored: `in stock` (on hand, not listed), `listed`, `sold out`.

### purchase

Stock can grow over time, so each buy is its own row. Creating an item records its first purchase. "Add stock" on an existing item records another, with its own date and cost.

| Column | Type | Notes |
| --- | --- | --- |
| item_id | uuid | |
| purchased_at | date | |
| quantity | int | |
| unit_cost_cents | int | Cost per unit for this purchase |
| source | text null | Where it was bought (thrift store, estate sale) |

A lot of different items bought for one price is split evenly across the items, one purchase row each. If the split leaves a remainder, the extra cents go to the first item.

An item's unit cost is the weighted average across its purchases: total cost ÷ total quantity. The inventory table shows that average, plus first and last purchase dates.

### item_identifier

Identifiers are optional, since many items have no barcode. An item can have several.

| Column | Type | Notes |
| --- | --- | --- |
| item_id | uuid | |
| type | enum | `upc`, `ean`, `isbn10`, `isbn13`, `asin`, `sku`, `other` |
| value | text | Normalized (digits only for UPC, EAN, ISBN). Indexed for lookup. |

### item_photo

| Column | Type | Notes |
| --- | --- | --- |
| item_id | uuid | |
| cloudinary_public_id | text | |
| width, height | int | |
| position | int | First photo is the thumbnail |

### marketplace and fee_rule

Marketplaces are user-editable rows. The list is seeded with eBay, Mercari, Facebook Marketplace, and Vinted, and can be added to, renamed, or archived in Settings. Fee rates change and vary by category, so rates are data, not code.

| fee_rule column | Type | Notes |
| --- | --- | --- |
| marketplace_id | uuid | |
| category_id | uuid null | Null means the marketplace default. The most specific match up the category tree wins. |
| percent_bps | int | |
| applies_to_shipping | bool | If true, the percent applies to item price plus shipping charged. Default true. Marketplaces differ. |
| fixed_cents | int | Per-order fee |
| payment_percent_bps, payment_fixed_cents | int | Payment processing, if billed separately |

### listing, listing_item, and listing_marketplace

A listing is one thing for sale. It can be up on several marketplaces at once.

| listing column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| title | text | |
| status | enum | `draft`, `active`, `sold`, `ended` |
| asking_price_cents | int | Per unit of the listing |
| quantity | int | Units for sale, default 1 |
| shipping_charged_cents | int | What the buyer pays per unit; 0 for free shipping |
| est_shipping_cost_cents | int | What it should cost to ship one unit |
| commission_bps | int null | Friend's cut |
| commission_payee | text null | |
| listed_at, ended_at | timestamptz null | |

`listing_item` joins a listing to inventory with `quantity_per_unit`. A bundle of three DVDs is one listing with three `listing_item` rows. Five copies of one book is one `listing_item` and `listing.quantity = 5`.

`listing_marketplace` has one row for each marketplace the listing is up on. A listing needs at least one before it can be published.

| listing_marketplace column | Type | Notes |
| --- | --- | --- |
| listing_id | uuid | |
| marketplace_id | uuid | Unique per listing |
| external_url | text null | Link to the live listing on this marketplace |
| asking_price_cents | int null | Override. If null, the listing's asking price applies. |
| status | enum | `active`, `ended`. Lets a listing come down from one marketplace and stay up on another. |
| listed_at, ended_at | timestamptz null | |

Fees differ by marketplace, so the minimum price and projected profit are calculated per `listing_marketplace` row.

If a sale uses up the listing's quantity, the listing becomes `sold`. Any other marketplace rows still `active` are flagged on the dashboard as "take this down".

### sale

A listing with `quantity > 1` can have several sales, so sales are their own table. Fee and cost values are snapshotted so later edits to fee rules or inventory cost don't rewrite history.

| Column | Type | Notes |
| --- | --- | --- |
| listing_id | uuid | |
| marketplace_id | uuid | Where it sold. Picks the fee rule. |
| sold_at | date | |
| quantity | int | |
| sale_price_cents | int | Total item price actually paid, across all units in the sale |
| shipping_charged_cents | int | Total for the sale |
| shipping_cost_cents | int | Actual label cost, total for the sale |
| marketplace_fee_cents | int | Prefilled from the fee rule, editable to match the real payout |
| additional_fees_cents | int | Promotions, ad fees |
| cost_of_goods_cents | int | Snapshot of each item's average unit cost × quantity at sale time |
| commission_cents | int | Snapshot |
| commission_paid_at | date null | Null while the friend is still owed |

## 4. Calculations

Let:

- `P` = item price, `Sc` = shipping charged to buyer, `Sa` = actual shipping cost
- `f` = fee percent (marketplace + payment), `F` = fixed fees
- `C` = cost of goods, `X` = additional fees, `c` = commission percent

**Marketplace fee** = `f × (P + Sc) + F`. If the fee rule does not apply to shipping, `Sc` drops out of the fee base.

**Profit before commission** = `P + Sc − fee − Sa − X − C`

**Commission** = `c × max(0, profit before commission)`. Commission is a share of profit.

**Profit** = profit before commission − commission

**Minimum price to break even** = `(C + Sa + F) / (1 − f) − Sc`, rounded up to the cent. Commission is zero at break-even, so it drops out.

**Minimum price for a target profit `T`** = `(C + Sa + F + T / (1 − c)) / (1 − f) − Sc`

Additional fees `X` are left out of the minimum price because promotions are only known at sale time.

The listing form shows the minimum price live as cost, marketplace, and shipping change, and warns when the asking price is below it. All of this lives in one pure, unit-tested module.

## 5. Screens

**Home / dashboard.** A month switcher, KPI tiles, charts, and a "needs attention" list.

**Quick actions.** A round + button sits at the bottom right of every screen, above the bottom nav on a phone. It expands into a menu: Add item (the primary action, nearest the button), Scan barcode, New listing, Mark sold, Price lookup. Scan barcode opens the camera and starts Add item with the identifier filled in. Add item supports "save and add another". If the title or identifier matches an existing item, it offers to add stock to that item instead. Mark sold opens a search over active listings and asks only for price, date, shipping cost, and extra fees. If the listing is on several marketplaces, it also asks which one it sold on.

**Inventory.** Table with thumbnail, title, category, quantity, average unit cost, last purchase date, status, and days held. Sort, filter by category and status, search by title or identifier. On narrow screens the table scrolls sideways inside its card. Bulk actions: create listing from selection, change category. The table fills the height of the window: the number of rows per page adapts to the space, so no blank area is left below it.

**Item detail.** Fields, photos, identifiers, purchase history with an "Add stock" button, listing history, and a price lookup shortcut.

**Listings.** One row per listing. Table with title, marketplaces (as tags), asking price, minimum price, days listed, and status. Tabs for active, sold, ended.

**Listing detail / form.** Pick inventory items, one or more marketplaces, price, shipping, commission. Items in the listing can have their quantity changed or be removed. It stays one listing however many marketplaces are picked, and the form shows a minimum price for each. Each picked marketplace gets an optional link field on the form, which can also be filled in later. "Publish" marks the listing active in this app; it does not post anything to the marketplaces. A new marketplace can be added from the form. Both shipping fields are optional and default to 0; the real amounts are entered when the listing is marked sold. Shows fee estimate, minimum price, and projected profit.

**Sales.** Table of sales with profit and margin. CSV export.

**Price lookup.** Search by text or identifier. Shows PriceCharting and eBay sold results side by side. Can be run from an item, or standalone while out sourcing, with "add to inventory" from a result.

**Settings.** Categories tree, marketplaces and fee rules, default commission.

## 6. Dashboard

A month switcher sits under the page title: previous and next arrows around the month name. It always opens on the current month, and the next arrow stops there. Earlier months show a "Back to this month" link. The current month is labelled "Month to date" and earlier months "Full month".

Tiles: profit and margin for the selected month, sales and revenue for the selected month, units in stock and their cost, active listings and their total asking value, average days to sell.

Charts:

- Profit and revenue over time (week / month)
- Profit by marketplace
- Profit by category
- Inventory age buckets (0–30, 31–90, 90+ days)
- Spend vs. revenue over time

Needs attention: unlisted items, listings priced below minimum, stale listings, sold listings still up on another marketplace, unpaid commission.

## 7. Product search

Both sources are called from server-side Route Handlers. API keys never reach the browser. Results are cached in Postgres by normalized query for 24 hours. Lookups are not saved to items and no price history is kept.

**PriceCharting (games).** Fetch the search page and parse the result table for product, console, and loose / complete / new prices. Scraping breaks when markup changes and may be against their terms. PriceCharting also sells an API; check its price and terms before committing to scraping. The parser sits behind an interface so the source can be swapped.

**eBay sold listings (RapidAPI "eBay Average Selling Price").** Expected to take keywords and return sold items with summary prices. Needs a RapidAPI key. The request shape, response fields, quota, and pricing are unverified and need checking against the live API before building.

Each source implements the same `PriceSource` interface, so more can be added (books by ISBN, for example).

## 8. Auth

Single owner, behind a login. The friend who earns commission has no account. Every table still carries `user_id` so a second user can be added without a migration of the data model.

## 9. Milestones

1. **Foundation.** Next.js app, strict TS, Neon + Kysely + migrations, auth, layout shell.
2. **Inventory.** Categories, items, purchases, identifiers, Cloudinary photos, inventory table, CSV import of the existing spreadsheet.
3. **Listings and sales.** Marketplaces, fee rules, listings, calculation module, mark sold.
4. **Dashboard.** Tiles, charts, needs-attention list, month switcher, quick actions button.
5. **Price lookup.** PriceCharting and eBay sources, caching, save to item.
6. **Polish.** CSV export, phone-camera barcode scanning into the identifier field, mobile pass.

## 10. Decisions

- One currency, USD.
- Single user. The friend has no login; commission is tracked with a paid date.
- Commission is a percent of profit.
- Listings are recorded by hand; nothing syncs with marketplaces.
- One listing can be up on several marketplaces at once. It is a single listing, not one per marketplace.
- Each purchase of an item is recorded with its own date, quantity, and cost. Unit cost is the weighted average.
- Lots bought for one price are split evenly.
- Marketplaces are an editable list seeded with eBay, Mercari, Facebook Marketplace, and Vinted.
- Fee rules are entered by the user; the app ships with no built-in rates.
- Sales tax collected by marketplaces is ignored.
- Photos attach to items only. No other attachments.
- Condition is free text.
- Barcode scanning is a convenience; identifiers are optional.
- PriceCharting is scraped, behind a swappable interface.
- Quick actions live in one + button: add item, scan barcode, new listing, mark sold, price lookup.

## 11. Open questions

1. What columns does the existing spreadsheet have, and does it include sold items or only current stock? This sets the CSV import mapping. Not known yet; the import step lets columns be mapped by hand until it is.
2. When an earlier month is selected on the dashboard, do In stock and Active listings show a snapshot from the end of that month, or always today's figures?
3. How does login work? A single email and password, or a passkey, would be enough for one user.

## 12. Visual design

The designed screens are on a Claude Design canvas: https://claude.ai/artifact/8gNECi55LFvM2T1D3hUj2P. The link is private to the owner. Designed so far: dashboard, inventory, new listing, and home on a phone. Not designed yet: add item form, item detail, listings table, mark sold, sales, price lookup, and settings. Build those from the same tokens and patterns.

The look is soft and pastel: a pale lilac ground, white cards, one violet for actions, and pastel fills that give tiles, tags, and charts their color.

### Color

| Token | Hex | Use |
| --- | --- | --- |
| ground | `#F8F6FC` | Page background |
| surface | `#FFFFFF` | Cards, inputs, tables |
| sidebar | `#EEE9FB` | Desktop sidebar, segmented control track |
| ink | `#2A2540` | Main text |
| ink-secondary | `#524C68` | Secondary text, text on pastel fills |
| ink-muted | `#635D7A` | Labels, table headers, helper text |
| border | `#E9E4F2` | Card and row borders |
| border-input | `#D3CCE3` | Inputs and outlined buttons |
| primary | `#6B5BD0` | + button, Publish, current-month bar. White text on it. |
| primary-text | `#5546B8` | Links, the active nav item |
| lilac | `#E6E0FA` | Profit tile, "Listed" pill, selected marketplace pill |
| mint | `#D5F2E3` | Sales tile, profit highlight |
| sky | `#D6ECFB` | In stock tile, "In stock" pill |
| peach | `#FFE3D3` | Active listings tile, minimum price card |
| pink | `#FCDDEA` | Avg days to sell tile |
| butter | `#FFF1C2` | Count badges |
| profit | `#136F4B` | Profit amounts |

Chart series use mid-tone versions of the pastels: `#8F7FE0`, `#5FC79A`, `#F29A6E`, `#6DB5EC`. Text on any fill must reach 4.5:1 contrast.

### Type

- Headings and large numbers: Outfit, weights 600 and 700.
- Everything else: Inter, 14px base, weights 400 to 600.
- Money and counts use tabular numerals and are right-aligned in tables.

### Shape and layout

- Cards have a 16px radius. Inputs and buttons have 10px. Pills and the + button are fully round.
- Every control is at least 44px tall.
- Desktop has a lilac sidebar with the active item as a white pill. A phone has a four-item bottom nav.
- Wide tables scroll sideways inside their card on narrow screens.
- Inventory thumbnails fall back to a pastel square with a short category code when an item has no photo.

### Patterns worth copying

- **Status pills:** In stock is sky, Listed is lilac, Sold out is grey.
- **Minimum price card:** one row per picked marketplace, with the minimum price and "Asking price: +$X", the amount above the minimum.
- **Marketplace picker:** multi-select pills, a dashed "New marketplace" pill, and an optional link field for each picked marketplace.
- **Listing items:** a quantity stepper and a remove button on each row.
- **Needs attention:** a pastel count badge, a label, and a chevron, each row a link.
