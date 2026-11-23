import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/lib/auth/password";

/** Reads a line from the terminal without showing what is typed. Falls back to plain input when piped. */
function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    stdout.write(prompt);
    if (!stdin.isTTY) {
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => (data += chunk));
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      stdin.on("error", reject);
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (key: string) => {
      for (const char of key) {
        if (char === "\r" || char === "\n" || char === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else value += char;
      }
    };
    stdin.on("data", onData);
  });
}

async function main(): Promise<void> {
  const password = await readHidden("Password: ");
  if (password.length < 10) {
    console.error("Use at least 10 characters.");
    process.exit(1);
  }
  const hash = await hashPassword(password);
  console.log("\nSet this in your environment (Vercel, or .env.local for a private local override):\n");
  console.log(`OWNER_PASSWORD_HASH=${hash}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
