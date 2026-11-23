"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button, Card, CardTitle, Field, Input } from "@/components/ui";
import { IDENTIFIER_TYPE_LABELS } from "@/lib/schemas";
import { startDetection } from "./detect";
import { addItemHref, readIdentifier } from "./identifier";

type CameraState =
  | { status: "starting" }
  | { status: "scanning" }
  | { status: "found"; identifier: string }
  /** No camera, no camera API (an insecure page or an old browser), or the camera is in use. */
  | { status: "unavailable" }
  | { status: "denied" };

const CAMERA_MESSAGES: Record<"unavailable" | "denied", { title: string; detail: string }> = {
  unavailable: {
    title: "No camera to scan with",
    detail: "This device or browser has no camera the app can use. Type the number under the barcode instead.",
  },
  denied: {
    title: "Camera access is blocked",
    detail: "Allow the camera for this site in your browser settings and try again, or type the number under the barcode.",
  },
};

/**
 * Opens the back camera and reads a UPC, EAN or ISBN barcode.
 * If a code is read, the page moves to Add item with the identifier and its type filled in.
 * If there is no camera, or permission is denied, the manual field below does the same job. It is always shown.
 */
export function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [camera, setCamera] = useState<CameraState>({ status: "starting" });
  const [attempt, setAttempt] = useState(0);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let stopDetection: (() => void) | null = null;

    const release = () => {
      stopDetection?.();
      stopDetection = null;
      stream?.getTracks().forEach((track) => track.stop());
      stream = null;
    };

    const start = async () => {
      // `mediaDevices` is missing on pages that are not served over HTTPS or localhost.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCamera({ status: "unavailable" });
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      } catch (cause) {
        const denied = cause instanceof DOMException && (cause.name === "NotAllowedError" || cause.name === "SecurityError");
        if (!cancelled) setCamera({ status: denied ? "denied" : "unavailable" });
        return;
      }
      const video = videoRef.current;
      if (cancelled || !video) {
        release();
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
        const detection = await startDetection(video, (value) => {
          const scanned = readIdentifier(value);
          if (cancelled || !scanned) return;
          // The first good read wins. Later frames of the same barcode are ignored.
          cancelled = true;
          release();
          setCamera({ status: "found", identifier: scanned.identifier });
          router.replace(addItemHref(scanned));
        });
        if (cancelled) {
          detection.stop();
          return;
        }
        stopDetection = detection.stop;
        setCamera({ status: "scanning" });
      } catch {
        release();
        if (!cancelled) setCamera({ status: "unavailable" });
      }
    };

    void start();
    return () => {
      cancelled = true;
      release();
    };
  }, [attempt, router]);

  const guess = typed.trim() === "" ? null : readIdentifier(typed);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scanned = readIdentifier(typed);
    if (!scanned) {
      setError("Enter the number under the barcode.");
      return;
    }
    router.push(addItemHref(scanned));
  };

  const blocked = camera.status === "unavailable" || camera.status === "denied" ? CAMERA_MESSAGES[camera.status] : null;

  return (
    <div className="grid max-w-[880px] gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-start">
      <Card>
        <CardTitle className="mb-3">Camera</CardTitle>
        <div className="relative aspect-[4/3] overflow-hidden rounded-inner bg-ink">
          {/* Muted and inline, or iOS Safari opens the video full screen and refuses to autoplay it. */}
          <video ref={videoRef} muted playsInline aria-label="Camera preview" className="size-full object-cover" hidden={blocked !== null} />
          {blocked === null ? (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-[10%] top-1/2 h-[38%] -translate-y-1/2 rounded-inner border-2 border-white/90" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-2 bg-track p-6 text-center">
              <p className="text-h2">{blocked.title}</p>
              <p className="max-w-sm text-ink-muted">{blocked.detail}</p>
              <Button className="mt-2" onClick={() => { setCamera({ status: "starting" }); setAttempt((value) => value + 1); }}>
                Try the camera again
              </Button>
            </div>
          )}
        </div>
        <p role="status" className="mt-3 min-h-[20px] text-ink-muted">
          {camera.status === "starting" ? "Starting the camera…" : null}
          {camera.status === "scanning" ? "Hold the barcode inside the frame. It is read automatically." : null}
          {camera.status === "found" ? `Read ${camera.identifier}. Opening Add item…` : null}
        </p>
      </Card>

      <Card>
        <CardTitle className="mb-3">Type it instead</CardTitle>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
          <Field
            label="Barcode number"
            error={error}
            hint={guess ? `Looks like ${IDENTIFIER_TYPE_LABELS[guess.identifierType] === "Other" ? "a custom code" : IDENTIFIER_TYPE_LABELS[guess.identifierType]}.` : "The UPC, EAN or ISBN printed under the bars."}
          >
            <Input
              name="identifier"
              value={typed}
              onChange={(event) => {
                setTyped(event.target.value);
                setError(null);
              }}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={200}
            />
          </Field>
          <Button type="submit" variant="primary">
            Continue to Add item
          </Button>
        </form>
      </Card>
    </div>
  );
}
