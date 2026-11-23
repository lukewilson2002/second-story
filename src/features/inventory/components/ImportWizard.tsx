"use client";

import Papa from "papaparse";
import { useMemo, useState } from "react";
import {
  Button,
  ButtonLink,
  Card,
  CardTitle,
  CategoryPicker,
  DataTable,
  Field,
  FormError,
  Input,
  Pill,
  SegmentedControl,
  Select,
  buttonClasses,
  type DataTableColumn,
} from "@/components/ui";
import { categoriesById, categoryPath, type CategoryRecord } from "@/lib/domain/categories";
import { formatCents, formatCount, formatDate } from "@/lib/format";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/schemas";
import { importBatchAction } from "../actions";
import {
  IMPORT_TARGETS,
  buildCategoryLookup,
  guessMapping,
  isBlankRow,
  isImportTarget,
  mapCsvRow,
  validateMapping,
  type ColumnMapping,
  type DateOrder,
  type MappedRow,
} from "../csv";
import { MAX_IMPORT_BATCH, type ImportRow } from "../schemas";

interface ParsedFile {
  name: string;
  /** Every non-blank row of the file, the header row included. */
  rows: string[][];
  columnCount: number;
}

interface PreviewRow {
  /** The row's line in the spreadsheet, counting the header, so it can be found again. */
  line: number;
  mapped: MappedRow;
}

type Progress =
  | { state: "idle" }
  | { state: "running"; done: number; total: number }
  | { state: "failed"; done: number; total: number; error: string }
  | { state: "finished"; created: number; restocked: number };

const GROUPS = ["Item", "Purchase", "Identifiers"] as const;

function columnLetter(index: number): string {
  let label = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) label = String.fromCharCode(65 + (n % 26)) + label;
  return label;
}

/**
 * CSV import in four steps on one page: choose a file, map its columns, check the preview, import.
 * The file is read in the browser. Only the mapped rows are sent to the server, in batches.
 * Each batch is saved whole or not at all. If one fails, the import stops and can carry on from that batch.
 */
export function ImportWizard({ categories, today }: { categories: readonly CategoryRecord[]; today: string }) {
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<ColumnMapping>([]);
  const [defaultCategoryId, setDefaultCategoryId] = useState("");
  const [defaultPurchasedAt, setDefaultPurchasedAt] = useState(today);
  const [dateOrder, setDateOrder] = useState<DateOrder>("mdy");
  const [mergeDuplicates, setMergeDuplicates] = useState(true);
  const [show, setShow] = useState<"all" | "problems">("all");
  const [progress, setProgress] = useState<Progress>({ state: "idle" });
  // Batches already saved. A retry after a failure starts from here, so no row is imported twice.
  const [savedRows, setSavedRows] = useState(0);
  const [totals, setTotals] = useState({ created: 0, restocked: 0 });

  const categoryLookup = useMemo(() => buildCategoryLookup(categories), [categories]);
  const byId = useMemo(() => categoriesById(categories), [categories]);

  const headers = useMemo(() => {
    if (!file) return [];
    const first = file.rows[0] ?? [];
    return Array.from({ length: file.columnCount }, (_, index) =>
      hasHeader && (first[index] ?? "").trim() !== "" ? (first[index] ?? "").trim() : `Column ${columnLetter(index)}`,
    );
  }, [file, hasHeader]);

  const dataRows = useMemo(() => (file ? file.rows.slice(hasHeader ? 1 : 0) : []), [file, hasHeader]);

  const mappingErrors = useMemo(() => (file ? validateMapping(mapping) : []), [file, mapping]);

  const preview = useMemo<PreviewRow[]>(() => {
    if (!file || mappingErrors.length > 0) return [];
    const options = {
      categoryLookup,
      defaultCategoryId: defaultCategoryId === "" ? null : defaultCategoryId,
      defaultPurchasedAt: /^\d{4}-\d{2}-\d{2}$/.test(defaultPurchasedAt) ? defaultPurchasedAt : today,
      dateOrder,
    };
    return dataRows.map((cells, index) => ({
      line: index + (hasHeader ? 2 : 1),
      mapped: mapCsvRow(cells, mapping, options),
    }));
  }, [file, mappingErrors, dataRows, mapping, categoryLookup, defaultCategoryId, defaultPurchasedAt, dateOrder, hasHeader, today]);

  const ready = useMemo(() => preview.flatMap((row) => (row.mapped.ok ? [row.mapped.row] : [])), [preview]);
  const problemCount = preview.length - ready.length;
  const shownRows = show === "problems" ? preview.filter((row) => !row.mapped.ok) : preview;
  const locked = progress.state === "running" || progress.state === "finished" || savedRows > 0;

  function resetImportState() {
    setProgress({ state: "idle" });
    setSavedRows(0);
    setTotals({ created: 0, restocked: 0 });
  }

  function readFile(picked: File) {
    setFileError(null);
    Papa.parse<string[]>(picked, {
      skipEmptyLines: "greedy",
      complete: (results) => {
        const rows = results.data.filter((row) => Array.isArray(row) && !isBlankRow(row));
        const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);
        if (rows.length === 0 || columnCount === 0) {
          setFile(null);
          setFileError(`"${picked.name}" has no rows.`);
          return;
        }
        const parsed = { name: picked.name, rows, columnCount };
        setFile(parsed);
        setHasHeader(true);
        setMapping(guessMapping(Array.from({ length: columnCount }, (_, index) => rows[0]?.[index] ?? "")));
        setShow("all");
        resetImportState();
      },
      error: () => {
        setFile(null);
        setFileError(`"${picked.name}" could not be read as a CSV file.`);
      },
    });
  }

  async function runImport(rows: readonly ImportRow[]) {
    let done = savedRows;
    let created = totals.created;
    let restocked = totals.restocked;
    setProgress({ state: "running", done, total: rows.length });
    while (done < rows.length) {
      const batch = rows.slice(done, done + MAX_IMPORT_BATCH);
      let result: Awaited<ReturnType<typeof importBatchAction>>;
      try {
        result = await importBatchAction({ rows: batch, mergeDuplicates });
      } catch {
        result = { ok: false, error: "The server could not be reached." };
      }
      if (!result.ok) {
        setProgress({ state: "failed", done, total: rows.length, error: result.error });
        return;
      }
      done += batch.length;
      created += result.data.created;
      restocked += result.data.restocked;
      setSavedRows(done);
      setTotals({ created, restocked });
      setProgress({ state: "running", done, total: rows.length });
    }
    setProgress({ state: "finished", created, restocked });
  }

  const columns = useMemo<DataTableColumn<PreviewRow>[]>(
    () => [
      { id: "line", header: "Row", numeric: true, sortValue: (row) => row.line, cell: (row) => row.line },
      {
        id: "status",
        header: "Status",
        sortValue: (row) => (row.mapped.ok ? 1 : 0),
        cell: (row) => (row.mapped.ok ? <Pill tone="mint">Ready</Pill> : <Pill tone="peach">Skipped</Pill>),
      },
      {
        id: "title",
        header: "Title",
        sortValue: (row) => (row.mapped.ok ? row.mapped.row.title : row.mapped.title),
        cell: (row) => <span className="font-semibold">{(row.mapped.ok ? row.mapped.row.title : row.mapped.title) || "–"}</span>,
      },
      {
        id: "category",
        header: "Category",
        nowrap: true,
        className: "text-ink-secondary",
        cell: (row) => (row.mapped.ok ? categoryPath(row.mapped.row.categoryId, byId) : "–"),
      },
      { id: "quantity", header: "Qty", numeric: true, cell: (row) => (row.mapped.ok ? formatCount(row.mapped.row.quantity) : "–") },
      {
        id: "cost",
        header: "Unit cost",
        numeric: true,
        cell: (row) => (row.mapped.ok ? formatCents(row.mapped.row.unitCostCents) : "–"),
      },
      {
        id: "purchased",
        header: "Purchased",
        nowrap: true,
        className: "text-ink-secondary",
        cell: (row) => (row.mapped.ok ? formatDate(row.mapped.row.purchasedAt) : "–"),
      },
      {
        id: "more",
        header: "Other fields",
        className: "text-ink-secondary",
        cell: (row) => {
          if (!row.mapped.ok) return "–";
          const item = row.mapped.row;
          const parts = [
            item.source ? `Source: ${item.source}` : null,
            item.condition ? `Condition: ${item.condition}` : null,
            item.storageLocation ? `Location: ${item.storageLocation}` : null,
            ...item.identifiers.map((identifier) => `${IDENTIFIER_TYPE_LABELS[identifier.type]} ${identifier.value}`),
            item.description ? "Description" : null,
            item.notes ? "Notes" : null,
          ].filter(Boolean);
          return parts.length > 0 ? parts.join(", ") : "–";
        },
      },
      {
        id: "messages",
        header: "Problems and notes",
        cell: (row) =>
          row.mapped.ok ? (
            <span className="text-ink-secondary">{row.mapped.notes.join(". ") || "–"}</span>
          ) : (
            <span className="font-medium text-danger">{row.mapped.errors.join(". ")}</span>
          ),
      },
    ],
    [byId],
  );

  return (
    <div className="flex flex-col gap-5">
      <Card className="flex flex-col gap-4">
        <CardTitle>1. Choose a CSV file</CardTitle>
        <p className="text-ink-muted">
          Export your spreadsheet as CSV. Each row becomes an item with its first purchase. The file is read in your browser
          and nothing is saved until you press Import.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <label
            className={buttonClasses(
              "secondary",
              "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary has-disabled:cursor-not-allowed has-disabled:opacity-55",
            )}
          >
            {file ? "Choose a different file" : "Choose file"}
            <input
              type="file"
              accept=".csv,text/csv,text/plain"
              className="visually-hidden"
              disabled={progress.state === "running"}
              onChange={(event) => {
                const picked = event.target.files?.[0];
                event.target.value = "";
                if (picked) readFile(picked);
              }}
            />
          </label>
          {file ? (
            <span role="status">
              <span className="font-semibold">{file.name}</span>, {formatCount(dataRows.length)} {dataRows.length === 1 ? "row" : "rows"},{" "}
              {formatCount(file.columnCount)} {file.columnCount === 1 ? "column" : "columns"}
            </span>
          ) : null}
        </div>
        <FormError message={fileError} />
        {file ? (
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="size-[18px] cursor-pointer accent-primary"
              checked={hasHeader}
              disabled={locked}
              onChange={(event) => setHasHeader(event.target.checked)}
            />
            The first row holds the column names
          </label>
        ) : null}
      </Card>

      {file ? (
        <Card className="flex flex-col gap-4">
          <CardTitle>2. Map the columns</CardTitle>
          <p className="text-ink-muted">
            Say what each column of your file holds. The guesses below come from the column names, so check them. Columns set
            to &ldquo;Do not import&rdquo; are ignored.
          </p>
          <div className="overflow-x-auto" role="region" aria-label="Column mapping table" tabIndex={0}>
            <table className="w-full min-w-[560px] border-collapse">
              <caption className="visually-hidden">Column mapping</caption>
              <thead>
                <tr className="text-left text-[12px] text-ink-muted">
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Column in your file
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Sample values
                  </th>
                  <th scope="col" className="py-2 pl-3 font-semibold">
                    Import as
                  </th>
                </tr>
              </thead>
              <tbody>
                {headers.map((header, index) => {
                  const samples = dataRows
                    .map((row) => (row[index] ?? "").trim())
                    .filter(Boolean)
                    .slice(0, 3);
                  return (
                    <tr key={index} className="border-t border-border">
                      <th scope="row" className="py-1.5 pr-3 text-left font-semibold">
                        {header}
                      </th>
                      <td className="max-w-[320px] truncate px-3 py-1.5 text-ink-secondary">
                        {samples.length > 0 ? samples.join(" · ") : "Empty"}
                      </td>
                      <td className="w-60 py-1.5 pl-3">
                        <Select
                          aria-label={`Import "${header}" as`}
                          value={mapping[index] ?? ""}
                          disabled={locked}
                          onChange={(event) => {
                            const value = event.target.value;
                            setMapping((current) =>
                              Array.from({ length: file.columnCount }, (_, column) =>
                                column === index ? (isImportTarget(value) ? value : null) : (current[column] ?? null),
                              ),
                            );
                          }}
                        >
                          <option value="">Do not import</option>
                          {GROUPS.map((group) => (
                            <optgroup key={group} label={group}>
                              {IMPORT_TARGETS.filter((target) => target.group === group).map((target) => (
                                <option key={target.value} value={target.value}>
                                  {target.label}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {mappingErrors.length > 0 ? (
            <ul role="alert" className="flex flex-col gap-1 rounded-control bg-danger-tint px-3 py-2.5 font-medium text-danger">
              {mappingErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          ) : null}

          <div className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field
              label="Default category"
              hint="Used for rows with no category, or one that does not match a category here. Categories are matched by name or by path, such as Movie › DVD."
            >
              <CategoryPicker
                categories={categories}
                value={defaultCategoryId}
                onValueChange={setDefaultCategoryId}
                emptyLabel="None: skip those rows"
                disabled={locked}
              />
            </Field>
            <Field label="Default purchase date" hint="Used for rows with no purchase date.">
              <Input
                type="date"
                value={defaultPurchasedAt}
                max={today}
                disabled={locked}
                onChange={(event) => setDefaultPurchasedAt(event.target.value)}
              />
            </Field>
            <Field label="Dates like 3/4/2026 mean" hint="Dates written as 2026-03-04 or Mar 4, 2026 are read either way.">
              <Select value={dateOrder} disabled={locked} onChange={(event) => setDateOrder(event.target.value === "dmy" ? "dmy" : "mdy")}>
                <option value="mdy">March 4 (month first)</option>
                <option value="dmy">April 3 (day first)</option>
              </Select>
            </Field>
          </div>
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              className="size-[18px] cursor-pointer accent-primary"
              checked={mergeDuplicates}
              disabled={locked}
              onChange={(event) => setMergeDuplicates(event.target.checked)}
            />
            If a row has the same title or identifier as an existing item, add stock to that item instead of creating a new one
          </label>
        </Card>
      ) : null}

      {file && mappingErrors.length === 0 ? (
        <>
          <Card padding="none">
            <div className="flex flex-col gap-3 p-5">
              <CardTitle>3. Check the preview</CardTitle>
              <div className="flex flex-wrap items-center gap-3">
                <p role="status">
                  <span className="font-semibold">{formatCount(ready.length)}</span> {ready.length === 1 ? "row is" : "rows are"} ready
                  to import.{" "}
                  {problemCount > 0 ? (
                    <>
                      <span className="font-semibold text-danger">{formatCount(problemCount)}</span>{" "}
                      {problemCount === 1 ? "row has a problem and will be skipped." : "rows have problems and will be skipped."}
                    </>
                  ) : null}
                </p>
                {problemCount > 0 ? (
                  <SegmentedControl
                    label="Rows to show"
                    value={show}
                    onChange={setShow}
                    options={[
                      { value: "all", label: "All rows" },
                      { value: "problems", label: "Problems only" },
                    ]}
                  />
                ) : null}
              </div>
            </div>
            <div className="border-t border-border">
              <DataTable
                caption="Import preview"
                columns={columns}
                rows={shownRows}
                getRowId={(row) => String(row.line)}
                minWidth={1100}
                pageSize={10}
                noun={["row", "rows"]}
              />
            </div>
          </Card>

          <Card className="flex flex-col gap-4">
            <CardTitle>4. Import</CardTitle>
            {progress.state === "finished" ? (
              <>
                <p role="status" className="rounded-control bg-mint px-3 py-2.5 font-medium text-profit-strong">
                  Import finished. {formatCount(progress.created)} {progress.created === 1 ? "item" : "items"} created
                  {progress.restocked > 0
                    ? `, and ${formatCount(progress.restocked)} ${progress.restocked === 1 ? "row" : "rows"} added as stock to existing items`
                    : ""}
                  .
                </p>
                <div className="flex flex-wrap gap-2">
                  <ButtonLink href="/inventory" variant="primary">
                    Go to inventory
                  </ButtonLink>
                  <Button
                    onClick={() => {
                      setFile(null);
                      resetImportState();
                    }}
                  >
                    Import another file
                  </Button>
                </div>
              </>
            ) : (
              <>
                {progress.state === "failed" ? (
                  <FormError
                    message={`The import stopped after ${formatCount(progress.done)} of ${formatCount(progress.total)} rows. ${progress.error} The rows already imported are saved. Press Continue import to carry on from where it stopped.`}
                  />
                ) : null}
                {progress.state === "running" ? (
                  <p role="status" className="font-medium">
                    Importing… {formatCount(progress.done)} of {formatCount(progress.total)} rows saved. Keep this page open.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    variant="primary"
                    disabled={ready.length === 0 || progress.state === "running"}
                    onClick={() => void runImport(ready)}
                  >
                    {progress.state === "failed"
                      ? "Continue import"
                      : `Import ${formatCount(ready.length)} ${ready.length === 1 ? "row" : "rows"}`}
                  </Button>
                  {progress.state === "idle" ? <ButtonLink href="/inventory">Cancel</ButtonLink> : null}
                </div>
              </>
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
