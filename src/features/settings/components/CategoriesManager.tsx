"use client";

import { useId, useMemo, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  Button,
  Card,
  CategoryPicker,
  Dialog,
  EmptyState,
  Field,
  FormError,
  IconButton,
  Input,
  Pill,
  PlusIcon,
} from "@/components/ui";
import { buildCategoryTree, categoryPath, type CategoryNode, type CategoryRecord } from "@/lib/domain/categories";
import { formatCount } from "@/lib/format";
import { createCategoryAction, setCategoryArchivedAction, updateCategoryAction } from "../actions";
import { NAME_MAX_LENGTH } from "../schemas";
import { isHiddenFromPickers, moveTargets } from "../tree";
import { useActionForm } from "./useActionForm";

type OpenDialog = { kind: "add"; parentId: string } | { kind: "edit"; id: string } | null;

export interface CategoriesManagerProps {
  /** Every category, archived ones included. */
  categories: readonly CategoryRecord[];
  /** Items directly in each category, keyed by category id. */
  itemCounts: Readonly<Record<string, number>>;
}

/** The category tree with add, rename, move, archive and unarchive. */
export function CategoriesManager({ categories, itemCounts }: CategoriesManagerProps) {
  const [dialog, setDialog] = useState<OpenDialog>(null);
  const tree = useMemo(() => buildCategoryTree(categories), [categories]);
  const byId = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const close = () => setDialog(null);
  const editing = dialog?.kind === "edit" ? (byId.get(dialog.id) ?? null) : null;

  return (
    <>
      <PageHeader
        title="Categories"
        breadcrumbs={[{ label: "Settings", href: "/settings" }, { label: "Categories" }]}
        description="Group inventory any way you like. Categories can nest as deep as you need."
        actions={
          <Button variant="primary" icon={<PlusIcon size={18} />} onClick={() => setDialog({ kind: "add", parentId: "" })}>
            Add category
          </Button>
        }
      />

      <Card padding="none">
        {tree.length === 0 ? (
          <EmptyState
            title="No categories yet"
            description="Every item needs a category. Add your first one to get started."
            action={
              <Button variant="primary" onClick={() => setDialog({ kind: "add", parentId: "" })}>
                Add category
              </Button>
            }
          />
        ) : (
          <CategoryList
            nodes={tree}
            byId={byId}
            itemCounts={itemCounts}
            onAddChild={(id) => setDialog({ kind: "add", parentId: id })}
            onEdit={(id) => setDialog({ kind: "edit", id })}
            nested={false}
          />
        )}
      </Card>

      <p className="text-ink-muted">
        Archived categories stay on the items that already use them, but no longer appear when you pick a category. Archiving a
        category also hides everything under it.
      </p>

      <Dialog open={dialog?.kind === "add"} onClose={close} title="Add category">
        {dialog?.kind === "add" ? (
          <AddCategoryForm key={dialog.parentId} categories={categories} parentId={dialog.parentId} onDone={close} />
        ) : null}
      </Dialog>

      <Dialog open={editing !== null} onClose={close} title="Edit category">
        {editing ? <EditCategoryForm key={editing.id} category={editing} categories={categories} onDone={close} /> : null}
      </Dialog>
    </>
  );
}

interface CategoryListProps {
  nodes: readonly CategoryNode[];
  byId: ReadonlyMap<string, CategoryRecord>;
  itemCounts: Readonly<Record<string, number>>;
  onAddChild: (id: string) => void;
  onEdit: (id: string) => void;
  nested: boolean;
}

function CategoryList({ nodes, nested, ...rest }: CategoryListProps) {
  return (
    <ul className={nested ? "ml-4 border-l border-border sm:ml-6" : undefined}>
      {nodes.map((node) => (
        <CategoryRow key={node.id} node={node} {...rest} />
      ))}
    </ul>
  );
}

function CategoryRow({ node, ...rest }: Omit<CategoryListProps, "nodes" | "nested"> & { node: CategoryNode }) {
  const { byId, itemCounts, onAddChild, onEdit } = rest;
  const count = itemCounts[node.id] ?? 0;
  const hiddenByParent = !node.archived && isHiddenFromPickers(node.id, byId);
  return (
    <li className="border-b border-border last:border-b-0">
      <div className="flex min-h-14 items-center gap-2 py-1.5 pr-2 pl-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={node.archived || hiddenByParent ? "font-medium text-ink-muted" : "font-medium"}>{node.name}</span>
          {node.archived ? <Pill>Archived</Pill> : null}
          {hiddenByParent ? <Pill>Hidden by archived parent</Pill> : null}
          {count > 0 ? (
            <span className="text-[13px] text-ink-muted">
              {formatCount(count)} {count === 1 ? "item" : "items"}
            </span>
          ) : null}
        </div>
        {node.archived ? null : (
          <IconButton aria-label={`Add a subcategory under ${node.path.join(" › ")}`} onClick={() => onAddChild(node.id)}>
            <PlusIcon size={18} />
          </IconButton>
        )}
        <Button aria-label={`Edit ${node.path.join(" › ")}`} onClick={() => onEdit(node.id)}>
          Edit
        </Button>
      </div>
      {node.children.length > 0 ? <CategoryList nodes={node.children} nested {...rest} /> : null}
    </li>
  );
}

function AddCategoryForm({
  categories,
  parentId,
  onDone,
}: {
  categories: readonly CategoryRecord[];
  parentId: string;
  onDone: () => void;
}) {
  const form = useActionForm(createCategoryAction, onDone);
  return (
    <form onSubmit={form.onSubmit} className="flex flex-col gap-4 pb-2">
      <FormError message={form.formError} />
      <Field label="Name" error={form.fieldErrors.name}>
        <Input name="name" required maxLength={NAME_MAX_LENGTH} autoComplete="off" autoFocus />
      </Field>
      <Field label="Parent category" error={form.fieldErrors.parentId} hint="Names must be unique within a parent.">
        <CategoryPicker name="parentId" categories={categories} defaultValue={parentId} emptyLabel="Top level (no parent)" />
      </Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={form.pending}>
          {form.pending ? "Adding…" : "Add category"}
        </Button>
      </div>
    </form>
  );
}

function EditCategoryForm({
  category,
  categories,
  onDone,
}: {
  category: CategoryRecord;
  categories: readonly CategoryRecord[];
  onDone: () => void;
}) {
  const form = useActionForm(updateCategoryAction, onDone);
  const archive = useActionForm(setCategoryArchivedAction, onDone);
  const archiveHintId = useId();
  // A category cannot move under itself or its own subcategories, so those are not offered.
  const parents = useMemo(() => moveTargets(categories, category.id), [categories, category.id]);
  const byId = useMemo(() => new Map(categories.map((entry) => [entry.id, entry])), [categories]);
  const busy = form.pending || archive.pending;

  return (
    <div className="flex flex-col gap-5 pb-2">
      <form onSubmit={form.onSubmit} className="flex flex-col gap-4">
        <input type="hidden" name="id" value={category.id} />
        <FormError message={form.formError} />
        <Field label="Name" error={form.fieldErrors.name}>
          <Input name="name" required maxLength={NAME_MAX_LENGTH} autoComplete="off" defaultValue={category.name} />
        </Field>
        <Field
          label="Parent category"
          error={form.fieldErrors.parentId}
          hint="Moving a category takes its subcategories and items with it."
        >
          <CategoryPicker
            name="parentId"
            categories={parents}
            defaultValue={category.parentId ?? ""}
            emptyLabel="Top level (no parent)"
          />
        </Field>
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onDone}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {form.pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>

      <div className="flex flex-col gap-2.5 border-t border-border pt-4">
        <FormError message={archive.formError} />
        <p id={archiveHintId} className="text-ink-muted">
          {category.archived
            ? `Unarchiving puts ${categoryPath(category.id, byId)} back in the category pickers.`
            : "Archiving removes this category, and everything under it, from the category pickers. Items that use it keep it."}
        </p>
        <div>
          <Button
            aria-describedby={archiveHintId}
            disabled={busy}
            onClick={() => archive.submit({ id: category.id, archived: category.archived ? "false" : "true" })}
          >
            {category.archived ? "Unarchive category" : "Archive category"}
          </Button>
        </div>
      </div>
    </div>
  );
}
