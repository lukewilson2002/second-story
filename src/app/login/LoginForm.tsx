"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, FormError } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { login, type LoginState } from "@/lib/auth/actions";

const INITIAL: LoginState = { error: null, email: "" };

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(login, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <FormError message={state.error} />
      <Field label="Email">
        <Input type="email" name="email" autoComplete="username" required defaultValue={state.email} />
      </Field>
      <Field label="Password">
        <Input type="password" name="password" autoComplete="current-password" required />
      </Field>
      <Button type="submit" variant="primary" disabled={pending} className="mt-1 w-full">
        {pending ? "Logging in…" : "Log in"}
      </Button>
    </form>
  );
}
