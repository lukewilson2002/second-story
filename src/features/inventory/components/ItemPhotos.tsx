"use client";

import { useState, useTransition } from "react";
import { addPhotoAction, deletePhotoAction, reorderPhotosAction } from "../actions";
import { moveInList } from "../logic";
import { MAX_PHOTOS } from "../schemas";
import { UploadError, uploadPhoto } from "../upload-client";
import { PhotoGrid, PhotoPickerButton, PhotosNotConfigured, type PhotoTile } from "./PhotoGrid";

/**
 * Photos of a saved item: upload, reorder and delete. The first photo is the thumbnail.
 * Each change is saved at once and the page reloads its data, so `photos` always comes from the server.
 */
export function ItemPhotos({ itemId, photos, configured }: { itemId: string; photos: readonly PhotoTile[]; configured: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const busy = uploading || saving;

  async function upload(files: File[]) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(`An item can have up to ${MAX_PHOTOS} photos. The extra files were left out.`);
    setUploading(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        const { publicId, width, height } = await uploadPhoto(file);
        const result = await addPhotoAction(itemId, { publicId, width, height });
        if (!result.ok) {
          setError(result.error);
          break;
        }
      }
    } catch (caught) {
      setError(caught instanceof UploadError ? caught.message : "The upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const save = (work: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startSaving(async () => {
      const result = await work();
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {photos.length === 0 && configured ? <p className="text-ink-muted">No photos yet.</p> : null}
      <PhotoGrid
        photos={photos}
        busy={busy}
        onMove={(id, delta) =>
          save(() =>
            reorderPhotosAction(
              itemId,
              moveInList(
                photos.map((photo) => photo.id),
                id,
                delta,
              ),
            ),
          )
        }
        onDelete={(id) => save(() => deletePhotoAction(itemId, id))}
      />
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      {configured ? (
        <div className="flex flex-wrap items-center gap-3">
          <PhotoPickerButton disabled={busy || photos.length >= MAX_PHOTOS} uploading={uploading} onFiles={(files) => void upload(files)} />
          {photos.length > 0 ? <span className="text-ink-muted">The first photo is the thumbnail.</span> : null}
        </div>
      ) : (
        <PhotosNotConfigured />
      )}
    </div>
  );
}
