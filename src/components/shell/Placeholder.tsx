import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader, type Breadcrumb } from "./PageHeader";

/** A stand-in page from the foundation. The owning feature replaces the whole page with the real screen. */
export function Placeholder({
  title,
  owner,
  breadcrumbs,
  detail,
}: {
  title: string;
  owner: string;
  breadcrumbs?: readonly Breadcrumb[];
  detail?: string;
}) {
  return (
    <>
      <PageHeader title={title} {...(breadcrumbs ? { breadcrumbs } : {})} />
      <Card>
        <EmptyState
          title="This screen is not built yet"
          description={detail ?? `It belongs to the ${owner} feature. See docs/ARCHITECTURE.md.`}
        />
      </Card>
    </>
  );
}
