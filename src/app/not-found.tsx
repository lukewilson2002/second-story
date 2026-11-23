import { ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <EmptyState
        title="Page not found"
        description="That page does not exist, or the thing it showed was deleted."
        action={
          <ButtonLink href="/" variant="primary">
            Back to the dashboard
          </ButtonLink>
        }
      />
    </main>
  );
}
