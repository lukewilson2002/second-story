# Second Story: Architecture

This is the working agreement for everyone building on the foundation. `docs/design.md` says what to build. This file says where it goes and which shared pieces to use.

## 1. Stack, as installed

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, Server Components, Server Actions |
| Language | TypeScript, `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` |
| Styles | Tailwind CSS 4, tokens in `src/app/globals.css` |
| Database | Kysely 0.29. Production: Neon through `DATABASE_URL`. Local and tests: PGlite, an in-process Postgres |
| Validation | Zod 4 |
| Tables, charts | TanStack Table 9 (wrapped by `DataTable`), Recharts 3 |
| Auth | Single owner from env vars, scrypt password hash, `jose` JWT in an httpOnly cookie |
| Tests | Vitest 5 (unit, with an in-memory database), Playwright (desktop and phone projects) |
| Other | cheerio, papaparse, @zxing/browser |

Every dependency the app needs is already installed. Do not add, remove or upgrade packages.

Next.js 16 differs from older versions. Its docs ship in `node_modules/next/dist/docs/`. Three things matter here:

- Middleware is called Proxy. The file is `src/proxy.ts`.
- `params`, `searchParams` and `cookies()` are async. Await them.
- `cacheComponents` is off on purpose (the scaffold turns it on). Every signed-in page is dynamic, so pages just `await` their data. Do not add `"use cache"`.

## 2. Commands

| Command | What it does |
| --- | --- |
| `pnpm dev` | Dev server on port 3000, local database at `.pglite/dev` |
| `PORT=3201 pnpm dev:isolated` | A second dev server with its own database, build folder and demo data. Use this when other agents share the checkout |
| `pnpm typecheck` | `next typegen`, then `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm test` | Vitest, once. `pnpm test:watch` to watch |
| `pnpm test:e2e` | Playwright. Builds and boots its own server on a fresh, demo-seeded database |
| `pnpm build` | Production build |
| `pnpm db:migrate` | Run pending migrations (local, or `DATABASE_URL` if set) |
| `pnpm db:seed` | Migrations, then owner, starter categories, starter marketplaces. Idempotent. With `DATABASE_URL` set it needs `OWNER_EMAIL` on the command line |
| `pnpm db:seed:demo` | Demo items, listings, fee rules and sales. Local only, needs an empty inventory |
| `pnpm db:reset` | Delete the local database, migrate and seed. Local only |
| `pnpm db:codegen` | Regenerate `src/lib/db/types.ts` from the migrations |
| `pnpm hash-password` | Prompt for a password and print `OWNER_PASSWORD_HASH=...` |

First run: `pnpm install`, `pnpm db:reset`, `pnpm db:seed:demo`, `pnpm dev`. The dev login is `OWNER_EMAIL` and `DEV_OWNER_PASSWORD` in `.env.development`.

### Working alongside other agents

PGlite allows one process per data directory, and `next dev` allows one server per build folder. A lock file guards each data directory: once a process has run its first query, any other process that opens the same directory is refused with a clear error. A dev server only takes the lock on its first database query, so do not rely on it. Never run `pnpm db:*` against a directory a server is using. So:

- Run your own server with `PORT=<your port> pnpm dev:isolated`. It creates `.pglite/dev-<port>` and `.next-dev-<port>`, all gitignored.
- Run Playwright with your own port: `E2E_PORT=<your port> pnpm test:e2e`. Add `E2E_DEV=1` to skip the production build while writing tests.
- To run only your tests: `E2E_PORT=3105 pnpm test:e2e e2e/inventory`.
- `E2E_REAL_SERVICES=1 pnpm test:e2e` runs only `e2e/live`, against the real Cloudinary, RapidAPI and PriceCharting, with the keys from `.env.local`. A default run leaves those specs out. See section 13.
- Vitest needs nothing. Each `createTestDb()` is its own in-memory database.

## 3. Environment

`.env.example` lists every variable. `.env.development` and `.env.test` are committed and hold dev-only login values. `.env.local` is gitignored and holds the owner's real Cloudinary and RapidAPI keys.

- Never print, log, copy or commit values from `.env.local`.
- Read secrets through `src/lib/env.ts`: `authEnv()`, `cloudinaryEnv()`, `hasCloudinaryEnv()`, `rapidApiEnv()`, `hasRapidApiEnv()`. They validate on first use, so the build needs no secrets.
- The Playwright server blanks the Cloudinary and RapidAPI variables unless `E2E_REAL_SERVICES` is set, so a default e2e run cannot spend real quota. Features must show a sensible "not set up" state when `hasCloudinaryEnv()` or `hasRapidApiEnv()` is false, and tests should stub the network.

## 4. Route map and ownership

Each feature owns its route folders under `src/app` and its folder under `src/features`. It may create, edit and delete files there, and nowhere else.

| Feature | Routes | Owns in `src/app` | Owns in `src/features` |
| --- | --- | --- | --- |
| inventory | `/inventory`, `/inventory/new` (`?title=&identifier=&identifierType=`), `/inventory/[id]`, `/inventory/import`, `POST /api/cloudinary/sign` | `(app)/inventory/**`, `api/cloudinary/**` | `inventory/` (including photo UI) |
| listings-sales | `/listings`, `/listings/new` (`?items=id,id`), `/listings/[id]`, `/sales`, `/sales/new` (`?listing=id`), `GET /sales/export` | `(app)/listings/**`, `(app)/sales/**` | `listings/`, `sales/` |
| dashboard | `/`, `/scan` | `(app)/page.tsx`, `(app)/scan/**` | `dashboard/`, `quick-actions/` |
| lookup | `/lookup` (`?q=`), `/api/lookup/**` | `(app)/lookup/**`, `api/lookup/**` | `lookup/` |
| settings | `/settings`, `/settings/categories`, `/settings/marketplaces` (with fee rules), `/settings/commission` | `(app)/settings/**` | `settings/` |

Notes:

- `/sales/export` is a Route Handler (`route.ts`), not a page.
- `/scan` reads a barcode and redirects to `/inventory/new?identifier=...&identifierType=...`. `guessIdentifierType()` in `src/lib/schemas` picks the type.
- A lookup result starts "Add item" by linking to `/inventory/new?title=...&identifier=...&identifierType=...`. Lookups are never saved to items.
- Every route already has a placeholder. Replace the placeholder file, keep the path.
- E2e tests go in `e2e/<feature>/*.spec.ts`. Unit tests sit next to the code as `*.test.ts`.

### Shared files nobody edits

`package.json`, lockfile, configs, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(app)/layout.tsx`, `src/app/(app)/error.tsx`, `src/app/login/**`, `src/app/(app)/dev/**`, `src/proxy.ts`, `src/components/**`, `src/lib/**`, `scripts/**`, `e2e/*.ts` at the top level, `docs/**`.

The one exception is `src/features/quick-actions/QuickActions.tsx`, a placeholder the dashboard feature replaces.

If a shared piece is missing or wrong, do not patch it locally and do not edit it. Report it to the orchestrator. Until it is fixed, put what you need in your own feature folder.

### Cross-feature links

Features link to each other by URL only. Do not import from another feature's folder.

| From | To |
| --- | --- |
| Inventory bulk action "create listing" | `/listings/new?items=<id>,<id>` |
| Item detail "price lookup" | `/lookup?q=<title or identifier>` |
| Lookup result "add to inventory" | `/inventory/new?title=&identifier=&identifierType=` |
| Quick actions | `/inventory/new`, `/scan`, `/listings/new`, `/sales/new`, `/lookup` |
| Dashboard needs-attention rows | `/inventory?status=in_stock`, `/listings?filter=below-minimum`, `/listings?filter=stale`, `/listings?filter=still-up`, `/sales?filter=commission-owed` |
| Listing form "Edit fee rules" | `/settings/marketplaces` |

The inventory, listings and sales pages should honour those query parameters.

## 5. Conventions

### Database and user

```ts
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";

export default async function Page() {
  const userId = await requireUser();
  const items = await getDb().selectFrom("inventory_item").selectAll().where("user_id", "=", userId).execute();
}
```

- `requireUser()` returns the user id, or redirects to `/login`. Call it at the top of every page, Server Action and data function. The proxy only checks the cookie signature.
- In a Route Handler use `getUserId()` and return a 401, as the placeholder handlers do.
- Every query filters by `user_id`. Every insert sets `user_id`.
- `getDb()` is the one handle per process. Helpers that only run queries take `DbOrTrx`, so they work inside a transaction.
- Inside `db.transaction().execute(async (trx) => ...)` use only `trx`. The local database has one connection, so a query on `getDb()` inside the callback waits forever.
- Table and column names are snake_case (`src/lib/db/types.ts`, generated). Records passed around the app are camelCase (`CategoryRecord`, `FeeRuleRecord`).
- The schema is fixed. Features do not add migrations.

Driver behaviour, the same locally and on Neon:

- `date` columns (`purchased_at`, `sold_at`, `commission_paid_at`) are `"YYYY-MM-DD"` strings.
- `timestamptz` columns are `Date` objects.
- `bigint` results (`count`, `sum` of integers) are numbers. Type them: `eb.fn.countAll<number>()`, `eb.fn.sum<number>(...)`.
- `numeric` results (`avg`, division) are strings. Do not use them for money. Sum in SQL and divide with `src/lib/calc`.
- For `jsonb` (`price_lookup_cache.payload`) insert `JSON.stringify(value)`. Reads come back parsed.

### Money, percentages, dates

- Money is integer cents. Percentages are basis points. No floats touch money, in code or in SQL.
- All money math goes through `src/lib/calc`. Do not re-derive a formula in a component.
- Format and parse with `src/lib/format`: `formatCents`, `parseDollarsToCents`, `formatBps`, `parsePercentToBps`, `formatDate`, `formatShortDate`, `formatMonth`, `todayIsoDate`, `daysBetween`, `addDays`, `formatCount`.
- "Today" is `todayIsoDate()`, which uses `NEXT_PUBLIC_APP_TIME_ZONE` (default UTC).

### Server Actions

Put actions in `src/features/<feature>/actions.ts` with `"use server"` at the top. One Zod schema per form, in the feature folder, built from `src/lib/schemas`, used by both the client form and the action.

```ts
"use server";

import { revalidatePath } from "next/cache";
import { actionError, actionOk, formDataToObject, validationError, type ActionResult } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { DomainError } from "@/lib/domain";
import { addStockSchema } from "./schemas";

export async function addStock(_previous: ActionResult<{ id: string }> | null, formData: FormData): Promise<ActionResult<{ id: string }>> {
  const userId = await requireUser();
  const parsed = addStockSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) return validationError(parsed.error);
  try {
    const id = await doTheWork(getDb(), userId, parsed.data);
    revalidatePath("/inventory");
    return actionOk({ id });
  } catch (error) {
    if (error instanceof DomainError) return actionError(error.message);
    throw error;
  }
}
```

- Return `ActionResult<T>`. Expected problems (validation, a broken business rule) come back as `{ ok: false, error, fieldErrors }`. Unexpected ones throw and reach `(app)/error.tsx`.
- Call `redirect()` outside the `try`, because it works by throwing.
- After a write, `revalidatePath` every page that shows the data. A sale changes `/`, `/inventory`, `/listings` and `/sales`.
- In the form use `useActionState`, show `state.error` in `<FormError>` and pass `state.fieldErrors?.name` to `<Field error>`.
- Inventory and settings forms submit from `onSubmit` through a small hook instead (`inventory/use-form-action.ts`, `settings/components/useActionForm.ts`). React clears uncontrolled fields after a form action, even on a validation error. Listings and sales use `useActionState` with controlled fields.
- Money fields post text. Parse with `dollarsFieldSchema` or `optionalDollarsFieldSchema`. Percent fields use `percentFieldSchema` or `optionalPercentFieldSchema`.

### Components

- Server Components by default. Add `"use client"` only where there is state or an event handler.
- Do not pass functions from a Server Component to a Client Component. `DataTable` columns hold functions, so the component that defines them is a Client Component that receives plain rows.
- Use the primitives in `src/components/ui`. Use the tokens. Do not hard-code hex colours.
- Every interactive control is at least 44px tall, a real `<button>`, `<a>` or labelled input, with 4.5:1 text contrast. The boards draw a few 36 to 40px controls (Add stock, segmented buttons, pagination). They are 44px here.
- Screens that are not on the boards are built from the same tokens and patterns.
- Comments explain why, a constraint or a gotcha. Do not restate the code.

## 6. Design tokens

Defined once in `src/app/globals.css` under `@theme`.

| Kind | Class names |
| --- | --- |
| Colours | `ground`, `surface`, `sidebar`, `ink`, `ink-secondary`, `ink-muted`, `border`, `border-input`, `primary`, `primary-hover`, `primary-text`, `lilac`, `mint`, `sky`, `peach`, `pink`, `butter`, `profit` (use as `bg-lilac`, `text-ink-muted`, `border-border`) |
| From the boards | `lilac-ink`, `sky-ink`, `profit-strong`, `neutral`, `track`, `peach-border`, `dashed` |
| Errors | `danger`, `danger-tint` (not on the boards) |
| Chart series | `chart-violet`, `chart-green`, `chart-orange`, `chart-blue`, `chart-bar`, `age-fresh`, `age-mid`, `age-old`. In Recharts props use `var(--color-chart-violet)` |
| Radius | `rounded-card` (16px), `rounded-control` (10px), `rounded-inner` (8px), `rounded-pill` |
| Shadows | `shadow-menu`, `shadow-fab` |
| Fonts | `font-sans` (Inter, the default), `font-display` (Outfit) |
| Type | `text-h1` (Outfit 30/700), `text-h2` (Outfit 17/600), `text-eyebrow`, `text-stat` (Outfit 34/700, tabular) |
| Numbers | `tabular-nums` for numerals, `num` for tabular and right-aligned |
| Other | `visually-hidden` |

Body text is Inter 14px, set on `body`.

## 7. Layout shell

`src/app/(app)/layout.tsx` wraps every signed-in page in `AppShell`.

- From 768px: lilac sidebar, the current section as a white pill, Log out at the bottom.
- Below 768px: a lilac top bar (brand, Price lookup, Settings, Log out) and a four-item bottom nav (Home, Inventory, Listings, Sales).
- `<main>` is a flex column with a 20px gap and the page padding. A page returns a fragment: `<PageHeader ... />` then its cards.
- The shell positions the quick-actions slot: bottom right on desktop, above the bottom nav on a phone. `QuickActions` renders the menu and the round button with no positioning of its own.
- On the phone home screen the board continues the lilac header with the month's profit. The dashboard can do that with a first block of `-mx-4 -mt-4 rounded-b-3xl bg-lilac px-4 pb-[18px]`, which joins the shell's top bar.

`PageHeader` (`src/components/shell`): `title`, `breadcrumbs?`, `description?`, `actions?`, `children?` (controls under the title, like the month switcher).

## 8. Shared UI primitives

Import from `@/components/ui`. Each file has doc comments with the details. `/dev/ui` and `/dev/table` render them all (dev and e2e only).

| Component | Notes |
| --- | --- |
| `Button`, `ButtonLink`, `IconButton`, `buttonClasses` | Variants `primary`, `secondary`, `ghost`, `danger`. `Button` defaults to `type="button"`. `IconButton` needs `aria-label` |
| `Field`, `FormError`, `useFieldControl` | `Field` wires label, hint and error to the one control inside it. `error` takes a string or `string[]` |
| `Input`, `Select`, `Textarea` | 44px controls. Inside a `Field` they pick up id and error state |
| `MoneyInput` | Types dollars, `onValueChange(cents \| null)`, `defaultValueCents`. Posts its text under `name` |
| `PercentInput` | Types a percentage, `onValueChange(bps \| null)`, `defaultValueBps` |
| `CategoryPicker` | A select of the category tree, archived categories left out. `categories`, `value` or `defaultValue`, `onValueChange`, `emptyLabel` |
| `Card`, `CardTitle`, `StatTile` | `Card padding="none"` for tables. `StatTile` is the pastel KPI tile |
| `Pill`, `ItemStatusPill`, `ListingStatusPill`, `Tag`, `Badge` | Status pills, marketplace tags, count badges |
| `SegmentedControl` | Controlled, one pressed button, for filters |
| `Tabs` | Link tabs, the current one marked with `current` |
| `Dialog`, `Sheet` | Native `<dialog>`. Controlled with `open` and `onClose`. Bottom sheet on a phone |
| `Stepper` | Quantity stepper with `min`, `max`, optional hidden `name` |
| `EmptyState` | Title, description, action |
| `DataTable` | See below |
| `ItemThumbnail`, `thumbnailTone` | Photo, or a pastel square with a category code |
| Icons | `PlusIcon`, `CloseIcon`, `CheckIcon`, `SearchIcon`, `BarcodeIcon`, `TagIcon`, chevrons and more. All decorative |

`cloudinaryImageUrl(publicId, { width, height })` in `src/lib/cloudinary.ts` (server only) builds the thumbnail URL for `ItemThumbnail`.

### DataTable

```tsx
"use client";
const columns: DataTableColumn<Row>[] = [
  { id: "title", header: "Item", sortValue: (r) => r.title, cell: (r) => <b>{r.title}</b> },
  { id: "qty", header: "Qty", numeric: true, sortValue: (r) => r.quantity, cell: (r) => r.quantity },
];

<Card padding="none">
  <DataTable caption="Inventory" columns={columns} rows={rows} getRowId={(r) => r.id}
    minWidth={880} fillHeight noun={["item", "items"]} empty={<EmptyState title="No items" />} />
</Card>
```

- Sorting: a column sorts if it has `sortValue`. Nulls sort last.
- `numeric` right-aligns and uses tabular numerals.
- `minWidth`: narrower than this the table scrolls sideways inside its card.
- `fillHeight`: rows per page follow the window height, so nothing is left blank below and the page does not scroll. Use it when the table is the last thing on the page.
- Selection: `selectable`, `selectedIds` (a `Set`), `onSelectedIdsChange`, `getRowLabel`.
- Filtering and search are yours: filter the array and pass the result as `rows`.
- Define `columns` at module scope or in `useMemo`.

## 9. Calculation module: `src/lib/calc`

Pure functions, integer cents and basis points, rounding half up to the cent.

```ts
interface FeeTerms { percentBps; appliesToShipping; fixedCents; paymentPercentBps; paymentFixedCents }
const NO_FEES: FeeTerms

marketplaceFeeCents({ priceCents, shippingChargedCents, rule }): number
profitBeforeCommissionCents({ priceCents, shippingChargedCents, shippingCostCents, marketplaceFeeCents, additionalFeesCents, costOfGoodsCents }): number
commissionCents(profitBeforeCommission, commissionBps): number
profitCents(profitBeforeCommission, commissionBps): number
saleBreakdown({ priceCents, shippingChargedCents, shippingCostCents, additionalFeesCents, costOfGoodsCents, commissionBps, rule, marketplaceFeeOverrideCents? })
  : { totalPaidCents, marketplaceFeeCents, profitBeforeCommissionCents, commissionCents, profitCents, marginBps }
marginBps(profit, revenueCents): number | null
minimumPriceToBreakEvenCents({ costOfGoodsCents, shippingCostCents, shippingChargedCents, rule }): number | null
minimumPriceForTargetProfitCents({ ...same, targetProfitCents, commissionBps }): number | null
splitLotEvenly(totalCents, count): number[]
weightedAverageUnitCostCents(purchases: { quantity, unitCostCents }[]): number
averageUnitCostCents(totalCostCents, totalQuantity): number
percentOfCents(cents, bps), divRoundHalfUp(n, d), divCeil(n, d), totalFeePercentBps(rule), totalFixedFeeCents(rule)
```

Decisions baked in:

- The fee percent is marketplace percent plus payment percent, applied to one base and rounded once. If `appliesToShipping` is false, the base is the item price alone.
- Minimum prices use the design doc's closed form, rounded up. At that price profit is never below the target. Because fees round to the cent, a price one cent lower can occasionally reach it too.
- If `appliesToShipping` is false the break-even price is `(C + Sa + F − Sc) / (1 − f)`.
- A minimum price is `null` if the fee percent is 100% or more, or commission is 100% with a target above zero. It is never below 0.
- Margin is profit over everything the buyer paid (item price plus shipping charged), matching "Margin on total paid" on the listing board.
- `splitLotEvenly` splits across items. If an item in the lot has quantity above 1, its share may not divide evenly into a unit cost. That is the inventory feature's call to make.
- The numbers on the New listing board are test fixtures: $44.99 asking, $5.00 shipping charged, $5.60 shipping cost, $18.00 cost, 20% commission, eBay 13% + $0.40 gives fee $6.90, minimum $22.59, profit $15.59.

## 10. Domain helpers: `src/lib/domain`

```ts
// categories
loadCategories(db, userId): Promise<CategoryRecord[]>            // { id, parentId, name, archived }
categoriesById(categories): Map<string, CategoryRecord>
buildCategoryTree(categories, { includeArchived? }): CategoryNode[]   // adds depth, path, children
flattenCategoryTree(tree): CategoryNode[]
categoryAncestorIds(categoryId, byId): string[]                  // self first, top level last
categoryPath(categoryId, byId): string                           // "Movie › DVD"
topLevelCategoryId(categoryId, byId): string
categoryWithDescendantIds(categoryId, categories): string[]      // for filtering by a parent category
categoryCode(name): string                                       // "BK", "DVD"

// fees
loadFeeRules(db, userId): Promise<FeeRuleRecord[]>               // FeeTerms + id, marketplaceId, categoryId
resolveFeeRule(rules, marketplaceId, categoryId, byId): FeeRuleRecord | null
resolveFeeTerms(rules, marketplaceId, categoryId, byId): FeeTerms     // NO_FEES when no rule

// items
summarizePurchases(purchases): PurchaseSummary                   // { avgUnitCostCents, totalQuantity, totalCostCents, firstPurchasedAt, lastPurchasedAt }
loadPurchaseSummaries(db, userId, itemIds?): Promise<Map<string, PurchaseSummary>>
purchaseSummaryFor(summaries, itemId): PurchaseSummary
deriveItemStatus({ quantityOnHand, inActiveListing }): "in_stock" | "listed" | "sold_out"
loadActivelyListedItemIds(db, userId): Promise<Set<string>>

// listings
projectListingMarketplace({ listing, marketplaceAskingPriceCents, unitCostCents, rule })
  : { askingPriceCents, minimumPriceCents, aboveMinimumCents, belowMinimum, atAsking: SaleBreakdown }
loadListingCosts(db, userId, listingIds?): Promise<Map<string, ListingCost>>   // { unitCostCents, feeCategoryId, items[] }
listingCostFor(costs, listingId): ListingCost
loadListingSoldQuantities(db, userId, listingIds?): Promise<Map<string, number>>
STALE_LISTING_DAYS                                               // 60: the dashboard count and the listings filter both use it

// sales
previewSale(db, userId, input): Promise<SalePreview>
recordSale(db, userId, input): Promise<RecordedSale>
saleRowProfit(saleRow): { revenueCents, profitBeforeCommissionCents, profitCents }
class DomainError { code; message }
```

Rules these encode:

- **Item status.** Nothing on hand is `sold_out`. Otherwise, in at least one `active` listing is `listed`. Otherwise `in_stock`. Draft, sold and ended listings do not count.
- **Fee rule choice.** Walk up from the category to the top level and take the first rule for that marketplace, then the marketplace default (`category_id` null), then no fees.
- **A listing's fee category** is the category of its first item (`listing_item.position`, a column the foundation added for ordering).
- **A listing's unit cost** is each item's average unit cost times its `quantity_per_unit`.
- **`listing.quantity` is the total put up for sale** and does not change when a sale is recorded. Units left are `quantity` minus `loadListingSoldQuantities`.
- **Average unit cost** is over every purchase the item has ever had: total cost divided by total quantity.

`recordSale` input (`recordSaleInputSchema` in `src/lib/schemas`): `listingId`, `marketplaceId`, `soldAt`, `quantity` (default 1), `salePriceCents` (total for the sale), `shippingChargedCents?` (default: the listing's value times quantity), `shippingCostCents`, `additionalFeesCents`, `marketplaceFeeCents?` (overrides the rule).

In one transaction it snapshots cost of goods, fee and commission on the sale row, takes `quantity_per_unit × quantity` off each item, and, if the listing's quantity is used up, sets the listing to `sold` and its row for the selling marketplace to `ended`. Rows for other marketplaces stay `active`: those are the dashboard's "sold, still up elsewhere". It throws `DomainError` with codes `not_found`, `listing_not_active`, `not_on_marketplace`, `not_enough_listing_quantity`, `not_enough_stock`, `invalid`. `previewSale` does the same checks and math without writing, for prefilling the fee on the mark-sold form.

Only an `active` listing can be sold, and only on a marketplace where its row is still `active`. A row that was taken down gives `not_on_marketplace`. All marking sold goes through `recordSale`.

## 11. Shared schemas and helpers: `src/lib`

- `schemas`: `uuidSchema`, `centsSchema`, `bpsSchema`, `quantitySchema`, `isoDateSchema`, `requiredTextSchema`, `optionalTextSchema`, `dollarsFieldSchema`, `optionalDollarsFieldSchema`, `percentFieldSchema`, `optionalPercentFieldSchema`, `quantityFieldSchema`, `identifierTypeSchema`, `IDENTIFIER_TYPES`, `IDENTIFIER_TYPE_LABELS`, `normalizeIdentifier`, `guessIdentifierType`, `identifierInputSchema`, `listingStatusSchema`, `itemStatusSchema`, `ITEM_STATUS_LABELS`, `feeRuleInputSchema`, `recordSaleInputSchema`.
- `action`: `ActionResult`, `actionOk`, `actionError`, `validationError`, `formDataToObject`.
- `auth`: `requireUser`, `getUserId`. `auth/actions`: `login`, `logout`. `auth/redirect`: `safeNextPath`, which decides where login may send the browser.
- `db`: `getDb`, `Db`, `DbOrTrx`, `DB`. `db/seed`: `seedBase`. `db/testing`: `createTestDb`.
- `cn`: `cn(...classes)`.

Identifiers are stored normalized. Always pass values through `normalizeIdentifier(type, value)` before saving or searching.

## 12. Data model additions

Section 3 of the design doc is implemented in `src/lib/db/migrations/0001_init.ts`, with `user_id` on every table. Added on top:

- `app_user (id, email, created_at)`, `user_settings (user_id, default_commission_bps, default_commission_payee, updated_at)`.
- `price_lookup_cache (user_id, source, normalized_query, payload jsonb, fetched_at)`, unique on `(user_id, source, normalized_query)`. A row older than 24 hours is stale: refetch and upsert.
- `listing_item.position` and `created_at` on most tables.
- Enums: `identifier_type`, `listing_status`, `listing_marketplace_status`.
- Unique rules: category name within a parent (case-insensitive, top level included), marketplace name per user (case-insensitive), one fee rule per marketplace and category (one default per marketplace), one row per listing and marketplace, one row per listing and item, one identifier of a type and value per item.
- Deleting is restricted where history depends on it: a category with items or children, an item in a listing, a listing with sales, a marketplace with listings or sales. Archive those instead (`archived_at`).
- Checks: money and quantities are never negative, basis points stay within 0 to 10000.

## 13. Testing

Unit tests with a database:

```ts
import { createTestDb, type TestDb } from "@/lib/db/testing";

let t: TestDb;
beforeAll(async () => { t = await createTestDb(); });
afterAll(async () => { await t.close(); });
// t.db is a migrated in-memory database. t.userId has the starter categories and marketplaces.
```

Write data functions as `fn(db, userId, ...)` so tests can pass `t.db`. Keep `requireUser()` and `getDb()` in the page or action that calls them.

Playwright:

- The `desktop` (1360 × 900) and `phone` (390 × 844) projects both start signed in, from `e2e/auth.setup.ts`.
- The database is the demo seed (`src/lib/db/demo-seed.ts`), rebuilt at the start of every run. Dates are relative to today.
- One worker, one shared database. A test that writes should create what it needs and not depend on exact counts from the seed.
- `e2e/helpers.ts` has `logIn(page)` and `ownerCredentials()` for tests that start signed out.
- `e2e/helpers.ts` also has `findSmallControls(page)` (controls under 44px) and `collectPageErrors(page)` (uncaught and console errors).
- `e2e/sweep.spec.ts` opens every route and one detail page of each kind and checks for errors, sideways scroll and undersized controls. Add new routes to its list.
- `e2e/cross-feature.spec.ts` checks that the dashboard's needs-attention counts match the filtered pages, and that prefill links between features work.
- Stub `/api/lookup` in any test that opens `/lookup?q=`. PriceCharting needs no key, so an unstubbed search reaches the live site.

Before handing work back, run `pnpm typecheck`, `pnpm lint`, `pnpm test` and your e2e tests. The first three cover the whole tree, so another agent's unfinished work can turn them red. Check whether a failure is in your files before chasing it.

The top-level specs (`e2e/login.spec.ts`, `e2e/shell.spec.ts`, `e2e/primitives.spec.ts`) check only the shell, login and primitives. They do not depend on any page's heading or content, so replacing a placeholder should not break them.
- `e2e/journey.spec.ts` follows one item from purchase to sale. Its expected figures are literals worked out by hand from the design doc's formulas. Do not replace them with calls into `src/lib/calc`.

Live services (`e2e/live`, the `live` project):

- Run with `E2E_REAL_SERVICES=1 E2E_PORT=<port> pnpm test:e2e`. Only the `live` project runs then, on a production build, one desktop viewport, with tracing off because a trace would record the upload signature.
- Its database is `.pglite/e2e-live-<port>` and is kept between runs. The 24-hour lookup cache then answers a repeat run, so only the first run of a day spends one of the 50 monthly eBay requests. Delete the folder to start clean.
- `live.spec.ts`: an eBay search and its cached repeat, a PriceCharting search, and a real Cloudinary upload that is deleted again and checked against Cloudinary's Admin API.
- `photos-stubbed.spec.ts`: the app's half of the photo flow with Cloudinary's hosts answered in the browser. It is in this project because the uploader only shows when the Cloudinary variables are set.
- Never print a key, a signature or the sign response from these specs. Compare booleans and counts.
- The lookup page searches every source for one query, so any unstubbed `/lookup?q=` with a new query spends an eBay request.

## 14. Production (Vercel and Neon)

`README.md` has the owner's hosting checklist. What the code does differently there:

- `DATABASE_URL` picks the driver. A `*.neon.tech` host uses the `Pool` from `@neondatabase/serverless` (WebSocket, so transactions and `FOR UPDATE` work). Any other host uses `pg`. Both go through Kysely's `PostgresDialect` with the same type parsers as PGlite.
- Neon's `Pool` needs a global `WebSocket`, which Node has from version 22. `package.json` sets `engines.node` to match.
- Migrations do not run on their own against `DATABASE_URL`. The owner runs `pnpm db:seed` (or `pnpm db:migrate`) with `DATABASE_URL` on the command line. Only the local PGlite database migrates itself on first use.
- If `VERCEL` is set and `DATABASE_URL` is not, `getDb()` throws. Nothing writes to the filesystem at runtime outside `src/lib/db/local.ts`, which only runs for PGlite.
- If `VERCEL` is set at build time, `next.config.ts` leaves PGlite out of the function file traces. It is about 20 MB and is never loaded there.
- The session cookie is `Secure` when `VERCEL` is set.
- `next.config.ts` sends `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and a `Referrer-Policy` on every response.
- The Neon path has never run a query from this repo. A connection attempt with made-up credentials reached Neon and was refused at the password check, which shows the driver, the WebSocket transport and the dialect are wired. Queries, transactions and the type parsers on Neon are unverified until the owner runs step 4 of the README.
