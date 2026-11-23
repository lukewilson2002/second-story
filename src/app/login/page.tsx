import type { Metadata } from "next";
import { LogoIcon } from "@/components/ui/icons";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams;
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-6">
        <div className="mb-5 flex items-center gap-2.5">
          <LogoIcon holeColor="var(--color-surface)" />
          <span className="font-display text-[19px] font-bold">Second Story</span>
        </div>
        <h1 className="mb-4 text-h1">Log in</h1>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </main>
  );
}
