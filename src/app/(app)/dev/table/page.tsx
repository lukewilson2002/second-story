import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { TableDemo } from "./TableDemo";

export const metadata: Metadata = { title: "Table demo" };

/** A DataTable in fill-height mode with 60 rows, for checking it by eye and in Playwright. Off unless ENABLE_DEV_ROUTES=1. */
export default async function Page() {
  if (process.env.ENABLE_DEV_ROUTES !== "1") notFound();
  await requireUser();
  return <TableDemo />;
}
