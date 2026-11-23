"use client";

import { useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardTitle,
  CategoryPicker,
  CloseIcon,
  Dialog,
  EmptyState,
  Field,
  FormError,
  IconButton,
  Input,
  ItemStatusPill,
  ItemThumbnail,
  ListingStatusPill,
  MoneyInput,
  PercentInput,
  Pill,
  PlusIcon,
  SegmentedControl,
  Select,
  Sheet,
  StatTile,
  Stepper,
  Tabs,
  Tag,
  Textarea,
} from "@/components/ui";
import type { CategoryRecord } from "@/lib/domain/categories";
import { formatBps, formatCents } from "@/lib/format";

export function KitchenSink({ categories }: { categories: CategoryRecord[] }) {
  const [status, setStatus] = useState<"all" | "in_stock" | "listed" | "sold_out">("all");
  const [quantity, setQuantity] = useState(1);
  const [cents, setCents] = useState<number | null>(4499);
  const [bps, setBps] = useState<number | null>(2000);
  const [category, setCategory] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="UI primitives"
        breadcrumbs={[{ label: "Dev", href: "/dev/ui" }, { label: "Primitives" }]}
        description="Every shared component from src/components/ui."
        actions={
          <>
            <ButtonLink href="/dev/table">Table demo</ButtonLink>
            <Button variant="primary">Publish</Button>
          </>
        }
      />

      <Card className="flex flex-col gap-4">
        <CardTitle>Buttons</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary">Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button disabled>Disabled</Button>
          <Button icon={<PlusIcon size={16} />}>With icon</Button>
          <IconButton aria-label="Remove example">
            <CloseIcon size={18} />
          </IconButton>
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Form controls</CardTitle>
        <FormError message="Check the highlighted fields." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Title">
            <Input name="title" defaultValue="Zelda Ocarina of Time N64" />
          </Field>
          <Field label="Storage location" optional hint="Bin or shelf">
            <Input name="location" placeholder="Shelf A1" />
          </Field>
          <Field label="Condition" error="Pick a condition">
            <Select name="condition" defaultValue="">
              <option value="">Choose</option>
              <option>Like new</option>
              <option>Good</option>
            </Select>
          </Field>
          <Field label="Category">
            <CategoryPicker
              name="category"
              categories={categories}
              value={category}
              onValueChange={setCategory}
              emptyLabel="Choose a category"
            />
          </Field>
          <Field label="Asking price" hint={`Value in cents: ${cents ?? "none"} (${cents === null ? "–" : formatCents(cents)})`}>
            <MoneyInput name="price" defaultValueCents={4499} onValueChange={setCents} />
          </Field>
          <Field label="Share of profit" hint={`Value in basis points: ${bps ?? "none"} (${bps === null ? "–" : formatBps(bps)})`}>
            <PercentInput name="commission" defaultValueBps={2000} onValueChange={setBps} />
          </Field>
          <Field label="Notes" optional className="sm:col-span-2">
            <Textarea name="notes" />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <SegmentedControl
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "All" },
              { value: "in_stock", label: "In stock" },
              { value: "listed", label: "Listed" },
              { value: "sold_out", label: "Sold out" },
            ]}
          />
          <Stepper label="Quantity of example item" value={quantity} onChange={setQuantity} max={5} />
          <span data-testid="stepper-value">Quantity: {quantity}</span>
        </div>
        <Tabs
          label="Listing status"
          items={[
            { href: "/dev/ui", label: "Active", count: 58, current: true },
            { href: "/dev/ui?tab=sold", label: "Sold", count: 31, current: false },
            { href: "/dev/ui?tab=ended", label: "Ended", current: false },
          ]}
        />
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle>Pills, tags and badges</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <ItemStatusPill status="in_stock" />
          <ItemStatusPill status="listed" />
          <ItemStatusPill status="sold_out" />
          <ListingStatusPill status="draft" />
          <ListingStatusPill status="active" />
          <ListingStatusPill status="sold" />
          <ListingStatusPill status="ended" />
          <Pill tone="lilac">Month to date</Pill>
          <Pill tone="peach">Peach</Pill>
          <Pill tone="pink">Pink</Pill>
          <Pill tone="butter">Butter</Pill>
          <Tag>eBay</Tag>
          <Tag>Mercari</Tag>
          <Badge tone="sky">23</Badge>
          <Badge tone="peach">3</Badge>
          <Badge tone="butter">7</Badge>
          <Badge tone="pink">2</Badge>
          <Badge tone="lilac">$48.20</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ItemThumbnail categoryName="N64" toneKey="games" />
          <ItemThumbnail categoryName="Blu-ray" toneKey="movie" />
          <ItemThumbnail categoryName="Clothing" />
          <ItemThumbnail categoryName="Book" />
          <ItemThumbnail categoryName="VHS" toneKey="movie" />
        </div>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <StatTile tone="lilac" label="Profit" value="$612" detail="47.6% margin" />
        <StatTile tone="mint" label="Sales" value="31" detail="$1,286 revenue" />
        <StatTile tone="sky" label="In stock" value="142" detail="units, $1,864 cost" />
        <StatTile tone="peach" label="Active listings" value="58" detail="$3,412 asking" />
        <StatTile tone="pink" label="Avg days to sell" value="19" detail="from listed to sold" />
      </div>

      <Card className="flex flex-col gap-4">
        <CardTitle>Dialog and sheet</CardTitle>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
        </div>
        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Add stock"
          description="Records another purchase for this item."
          footer={
            <>
              <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Save
              </Button>
            </>
          }
        >
          <Field label="Unit cost">
            <MoneyInput name="unitCost" />
          </Field>
        </Dialog>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Add from inventory">
          <p>Sheet body</p>
        </Sheet>
      </Card>

      <Card>
        <EmptyState
          title="No listings yet"
          description="Pick items from your inventory to make the first one."
          action={<Button variant="primary">New listing</Button>}
        />
      </Card>
    </>
  );
}
