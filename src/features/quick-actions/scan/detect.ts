/**
 * Reads retail barcodes from a playing <video>.
 * The browser's own BarcodeDetector is used where it exists (Chrome on Android, Safari behind a flag).
 * Everywhere else @zxing/browser decodes frames in JavaScript. It is loaded on demand, so it costs nothing on browsers that do not need it.
 */

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats(): Promise<string[]>;
}

/** UPC and EAN cover retail products. A book's barcode is an EAN-13 that starts 978 or 979, which is its ISBN-13. */
const NATIVE_FORMATS = ["ean_13", "upc_a", "ean_8", "upc_e"] as const;

const NATIVE_SCAN_INTERVAL_MS = 200;

async function createNativeDetector(): Promise<BarcodeDetectorLike | null> {
  const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
  if (!Detector) return null;
  try {
    const supported = await Detector.getSupportedFormats();
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    // Some desktop browsers expose the class but support no formats, or only QR codes.
    if (!formats.includes("ean_13")) return null;
    return new Detector({ formats });
  } catch {
    return null;
  }
}

export type DetectionEngine = "native" | "zxing";

export interface Detection {
  engine: DetectionEngine;
  /** Stops reading frames. It does not stop the camera. */
  stop: () => void;
}

/**
 * Starts reading barcodes from the video and calls `onCode` with each value read.
 * `onCode` can be called more than once, and with the same value. The caller decides when to stop.
 */
export async function startDetection(video: HTMLVideoElement, onCode: (value: string) => void): Promise<Detection> {
  const native = await createNativeDetector();
  if (native) {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      // Below HAVE_CURRENT_DATA there is no frame to read yet, and detect() would throw.
      if (video.readyState >= 2) {
        try {
          const codes = await native.detect(video);
          const value = codes[0]?.rawValue;
          if (value && !stopped) onCode(value);
        } catch {
          // A single frame that fails to decode is not worth stopping for.
        }
      }
      if (!stopped) timer = setTimeout(tick, NATIVE_SCAN_INTERVAL_MS);
    };
    void tick();
    return {
      engine: "native",
      stop: () => {
        stopped = true;
        clearTimeout(timer);
      },
    };
  }

  const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
    import("@zxing/browser"),
    import("@zxing/library"),
  ]);
  const hints = new Map<number, unknown>([
    [DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.EAN_8, BarcodeFormat.UPC_E]],
  ]);
  const reader = new BrowserMultiFormatReader(hints);
  const controls = await reader.decodeFromVideoElement(video, (result) => {
    if (result) onCode(result.getText());
  });
  return { engine: "zxing", stop: () => controls.stop() };
}
