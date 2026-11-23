import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { CategoryRecord } from "@/lib/domain/categories";
import type { InventoryRow } from "../logic";

// The Server Actions pull in cookies and the database. These tests only check the markup.
vi.mock("../actions", () => ({
  addIdentifierAction: vi.fn(),
  addPhotoAction: vi.fn(),
  addStockAction: vi.fn(),
  changeCategoryAction: vi.fn(),
  checkDuplicatesAction: vi.fn(),
  correctQuantityAction: vi.fn(),
  createItemAction: vi.fn(),
  createLotAction: vi.fn(),
  deletePhotoAction: vi.fn(),
  discardUploadedPhotoAction: vi.fn(),
  importBatchAction: vi.fn(),
  removeIdentifierAction: vi.fn(),
  reorderPhotosAction: vi.fn(),
  updateItemAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

const { ImportWizard } = await import("./ImportWizard");
const { InventoryTable } = await import("./InventoryTable");
const { ItemDetailsForm } = await import("./ItemDetailsForm");
const { ItemIdentifiers } = await import("./ItemIdentifiers");
const { ItemPhotos } = await import("./ItemPhotos");
const { ItemStock } = await import("./ItemStock");
const { LotForm } = await import("./LotForm");
const { NewItemForm } = await import("./NewItemForm");

const BOOK = "11111111-1111-4111-8111-111111111111";
const MOVIE = "22222222-2222-4222-8222-222222222222";
const DVD = "33333333-3333-4333-8333-333333333333";
const categories: CategoryRecord[] = [
  { id: BOOK, parentId: null, name: "Book", archived: false },
  { id: MOVIE, parentId: null, name: "Movie", archived: false },
  { id: DVD, parentId: MOVIE, name: "DVD", archived: false },
];
const TODAY = "2026-11-23";

const rows: InventoryRow[] = [
  {
    id: "a1",
    title: "The Matrix",
    categoryId: DVD,
    categoryName: "DVD",
    categoryPath: "Movie › DVD",
    toneKey: MOVIE,
    quantity: 4,
    avgUnitCostCents: 75,
    lastPurchasedAt: "2026-09-20",
    status: "listed",
    daysHeld: 64,
    identifiers: ["085391737322"],
    thumbnailUrl: null,
  },
  {
    id: "b2",
    title: "Sapiens, paperback",
    categoryId: BOOK,
    categoryName: "Book",
    categoryPath: "Book",
    toneKey: BOOK,
    quantity: 0,
    avgUnitCostCents: 150,
    lastPurchasedAt: "2026-10-03",
    status: "sold_out",
    daysHeld: null,
    identifiers: [],
    thumbnailUrl: "https://res.cloudinary.com/demo/image/upload/c_fill,w_80,h_80/second-story/u/abc",
  },
];

describe("inventory screens render", () => {
  it("renders the table as on the board", () => {
    const html = renderToStaticMarkup(
      <InventoryTable rows={rows} categories={categories} today={TODAY} initialQuery="" initialStatus="all" initialCategoryId="" />,
    );
    for (const header of ["Item", "Category", "Qty", "Avg unit cost", "Last purchased", "Status", "Days held", "Stock"]) {
      expect(html).toContain(header);
    }
    expect(html).toContain('href="/inventory/a1"');
    expect(html).toContain("Movie › DVD");
    expect(html).toContain("$0.75");
    expect(html).toContain("Sep 20, 2026");
    expect(html).toContain("Listed");
    expect(html).toContain("Sold out");
    expect(html).toContain("DVD</span>");
    expect(html).toContain("Add stock to The Matrix");
    expect(html).toContain("Search by title, UPC or ISBN");
    expect(html).toContain("All categories");
  });

  it("applies the filters it is given from the URL", () => {
    const html = renderToStaticMarkup(
      <InventoryTable rows={rows} categories={categories} today={TODAY} initialQuery="" initialStatus="sold_out" initialCategoryId="" />,
    );
    expect(html).toContain("Sapiens, paperback");
    expect(html).not.toContain("The Matrix");
  });

  it("shows the empty states", () => {
    const empty = renderToStaticMarkup(
      <InventoryTable rows={[]} categories={categories} today={TODAY} initialQuery="" initialStatus="all" initialCategoryId="" />,
    );
    expect(empty).toContain("No inventory yet");
    const noMatch = renderToStaticMarkup(
      <InventoryTable rows={rows} categories={categories} today={TODAY} initialQuery="zzz" initialStatus="all" initialCategoryId="" />,
    );
    expect(noMatch).toContain("No items match");
  });

  it("renders the add item form with its prefill, duplicates and the photo state", () => {
    const html = renderToStaticMarkup(
      <NewItemForm
        categories={categories}
        today={TODAY}
        photosConfigured={false}
        prefill={{ title: "Dune", identifiers: [{ type: "isbn13", value: "9780441013593" }] }}
        initialDuplicates={[
          { id: "x9", title: "Dune, hardcover", quantityOnHand: 3, matchedOn: "identifier", identifier: { type: "isbn13", value: "9780441013593" } },
        ]}
      />,
    );
    expect(html).toContain('value="Dune"');
    expect(html).toContain('value="9780441013593"');
    expect(html).toContain("You may already have this");
    expect(html).toContain("Same ISBN-13 9780441013593, 3 on hand");
    expect(html).toContain("Add stock to this item");
    expect(html).toContain("Photo uploads are not set up");
    expect(html).toContain("Save and add another");
    expect(html).toContain(`value="${TODAY}"`);
  });

  it("offers the upload control when photos are configured", () => {
    const html = renderToStaticMarkup(
      <NewItemForm categories={categories} today={TODAY} photosConfigured prefill={{ title: "", identifiers: [] }} initialDuplicates={[]} />,
    );
    expect(html).toContain("Add photos");
    expect(html).not.toContain("Photo uploads are not set up");
    expect(html).not.toContain("You may already have this");
  });

  it("renders lot entry, the import start and the item page pieces", () => {
    expect(renderToStaticMarkup(<LotForm categories={categories} today={TODAY} />)).toContain("Save 2 items");
    expect(renderToStaticMarkup(<ImportWizard categories={categories} today={TODAY} />)).toContain("1. Choose a CSV file");
    expect(
      renderToStaticMarkup(
        <ItemDetailsForm
          categories={categories}
          item={{ id: "a1", title: "The Matrix", categoryId: DVD, condition: null, storageLocation: "Bin 3", description: null, notes: null }}
        />,
      ),
    ).toContain('value="Bin 3"');
    const identifiers = renderToStaticMarkup(
      <ItemIdentifiers itemId="a1" identifiers={[{ id: "i1", type: "upc", value: "085391737322" }]} />,
    );
    expect(identifiers).toContain('href="/lookup?q=085391737322"');
    const photos = renderToStaticMarkup(<ItemPhotos itemId="a1" configured={false} photos={[{ id: "p1", url: null }]} />);
    expect(photos).toContain("Photo uploads are not set up");
    expect(photos).toContain("Thumbnail");
    const stock = renderToStaticMarkup(
      <ItemStock
        item={{ id: "a1", title: "The Matrix", quantityOnHand: 4, avgUnitCostCents: 75 }}
        purchases={[{ id: "p1", purchasedAt: "2026-09-20", quantity: 4, unitCostCents: 75, source: "Goodwill" }]}
        today={TODAY}
      />,
    );
    expect(stock).toContain("$3.00");
    expect(stock).toContain("Correct quantity");
  });
});
