import type { Page } from "@playwright/test";

/** The dev-only login from .env.test. */
export function ownerCredentials(): { email: string; password: string } {
  const email = process.env.OWNER_EMAIL;
  const password = process.env.DEV_OWNER_PASSWORD;
  if (!email || !password) throw new Error("OWNER_EMAIL and DEV_OWNER_PASSWORD must be set in .env.test");
  return { email, password };
}

/** Signs in through the login form. Most tests do not need this, because they start from the saved signed-in state. */
export async function logIn(page: Page): Promise<void> {
  const { email, password } = ownerCredentials();
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("/");
}

export interface SmallControl {
  text: string;
  height: number;
}

/** Visible links, buttons and fields inside `main` that are shorter than 44px. Checkboxes and radios are judged by their label, so they are left out. */
export async function findSmallControls(page: Page): Promise<SmallControl[]> {
  return page.evaluate(() => {
    const controls = document.querySelectorAll<HTMLElement>(
      "main a, main button, main input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]), main select, main textarea, main summary",
    );
    return [...controls]
      .filter((element) => element.getClientRects().length > 0 && !element.closest(".visually-hidden"))
      .map((element) => ({
        text: (element.textContent || element.getAttribute("aria-label") || element.getAttribute("name") || element.tagName).trim().slice(0, 40),
        height: Math.round(element.getBoundingClientRect().height * 10) / 10,
      }))
      .filter((control) => control.height < 43.5);
  });
}

/** Collects uncaught errors and console errors from the page, so a test can assert there were none. */
export function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  return errors;
}

export interface LowContrast {
  text: string;
  ratio: number;
  color: string;
  background: string;
}

/**
 * Visible text inside `main` whose contrast against the fill behind it is under 4.5:1.
 * The fill is found by walking up to the first ancestors with a background colour and blending them.
 * Disabled controls are left out, as WCAG does. Text over a background image is not judged.
 */
export async function findLowContrast(page: Page): Promise<LowContrast[]> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return [];
    // Painting the colour and reading the pixel back handles every CSS colour syntax.
    const toRgba = (css: string): [number, number, number, number] => {
      context.clearRect(0, 0, 1, 1);
      context.fillStyle = "#000";
      context.fillStyle = css;
      context.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
      return a === 0 ? [0, 0, 0, 0] : [r, g, b, a / 255];
    };
    const over = (top: [number, number, number, number], bottom: [number, number, number]): [number, number, number] => [
      top[0] * top[3] + bottom[0] * (1 - top[3]),
      top[1] * top[3] + bottom[1] * (1 - top[3]),
      top[2] * top[3] + bottom[2] * (1 - top[3]),
    ];
    const luminance = ([r, g, b]: [number, number, number]): number => {
      const channel = (value: number) => {
        const s = value / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };
    const backgroundOf = (element: Element): [number, number, number] | null => {
      const layers: [number, number, number, number][] = [];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.backgroundImage !== "none") return null;
        const layer = toRgba(style.backgroundColor);
        if (layer[3] > 0) layers.push(layer);
        if (layer[3] === 1) break;
      }
      let result: [number, number, number] = [255, 255, 255];
      for (const layer of layers.reverse()) result = over(layer, result);
      return result;
    };

    const found = new Map<string, { text: string; ratio: number; color: string; background: string }>();
    const walker = document.createTreeWalker(document.querySelector("main") ?? document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = (node.textContent ?? "").trim();
      const element = node.parentElement;
      if (!text || !element) continue;
      if (element.closest(".visually-hidden, [disabled], [aria-disabled=true], [aria-hidden=true], option, svg")) continue;
      if (element.getClientRects().length === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || Number(style.opacity) === 0) continue;
      const background = backgroundOf(element);
      if (!background) continue;
      const color = over(toRgba(style.color), background);
      const [light, dark] = [luminance(color), luminance(background)].sort((a, b) => b - a) as [number, number];
      const ratio = Math.round(((light + 0.05) / (dark + 0.05)) * 100) / 100;
      if (ratio >= 4.5) continue;
      const hex = (rgb: [number, number, number]) => `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, "0")).join("")}`;
      const key = `${hex(color)} on ${hex(background)}`;
      if (!found.has(key)) found.set(key, { text: text.slice(0, 40), ratio, color: hex(color), background: hex(background) });
    }
    return [...found.values()];
  });
}
