"use client";

import Image from "next/image";
import { useRef, type ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon, IconButton, PlusIcon, TrashIcon, buttonClasses } from "@/components/ui";

export interface PhotoTile {
  id: string;
  /** A square image URL, or null if it cannot be shown (Cloudinary is not set up). */
  url: string | null;
}

export interface PhotoGridProps {
  photos: readonly PhotoTile[];
  /** Disables every control while a change is being saved. */
  busy: boolean;
  onMove: (id: string, delta: -1 | 1) => void;
  onDelete: (id: string) => void;
}

/** The photo tiles with their move and delete buttons. The first tile is marked as the thumbnail. */
export function PhotoGrid({ photos, busy, onMove, onDelete }: PhotoGridProps) {
  if (photos.length === 0) return null;
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
      {photos.map((photo, index) => (
        <li key={photo.id} className="flex flex-col overflow-hidden rounded-control border border-border bg-ground">
          <div className="relative aspect-square">
            {photo.url ? (
              <Image src={photo.url} alt={`Photo ${index + 1}`} fill unoptimized sizes="200px" className="object-cover" />
            ) : (
              <span className="flex size-full items-center justify-center px-2 text-center text-[13px] text-ink-muted">
                Photo {index + 1} cannot be shown
              </span>
            )}
            {index === 0 ? (
              <span className="absolute top-1.5 left-1.5 rounded-pill bg-surface px-2 py-0.5 text-[12px] font-semibold text-ink">
                Thumbnail
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between bg-surface">
            <IconButton aria-label={`Move photo ${index + 1} earlier`} disabled={busy || index === 0} onClick={() => onMove(photo.id, -1)}>
              <ChevronLeftIcon size={18} />
            </IconButton>
            <IconButton
              aria-label={`Move photo ${index + 1} later`}
              disabled={busy || index === photos.length - 1}
              onClick={() => onMove(photo.id, 1)}
            >
              <ChevronRightIcon size={18} />
            </IconButton>
            <IconButton aria-label={`Delete photo ${index + 1}`} disabled={busy} onClick={() => onDelete(photo.id)}>
              <TrashIcon size={18} />
            </IconButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

/**
 * The "Add photos" control: a real file input inside a label that looks like a button.
 * The input is cleared after each pick, so choosing the same file twice still fires.
 */
export function PhotoPickerButton({
  disabled,
  uploading,
  onFiles,
}: {
  disabled: boolean;
  uploading: boolean;
  onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <label
      className={buttonClasses(
        "secondary",
        "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary has-disabled:cursor-not-allowed has-disabled:opacity-55",
      )}
    >
      <PlusIcon size={16} />
      {uploading ? "Uploading…" : "Add photos"}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={disabled}
        className="visually-hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          if (inputRef.current) inputRef.current.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
    </label>
  );
}

/** Shown in place of the upload control when the Cloudinary variables are missing. */
export function PhotosNotConfigured({ children }: { children?: ReactNode }) {
  return (
    <div className="rounded-control border border-dashed border-border-input bg-ground px-4 py-3">
      <p className="font-semibold">Photo uploads are not set up</p>
      <p className="mt-1 text-ink-muted">
        Photos are stored on Cloudinary. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET for the app, then
        reload this page. Everything else works without them.
      </p>
      {children}
    </div>
  );
}
