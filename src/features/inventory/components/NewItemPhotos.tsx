"use client";

import { useState } from "react";
import { discardUploadedPhotoAction } from "../actions";
import { moveInList } from "../logic";
import { MAX_PHOTOS } from "../schemas";
import { UploadError, uploadPhoto, type UploadedPhoto } from "../upload-client";
import { PhotoGrid, PhotoPickerButton, PhotosNotConfigured } from "./PhotoGrid";

/**
 * Photos on the add item form. The item does not exist yet, so files are uploaded to Cloudinary straight away
 * and only their public ids and sizes are kept here. They post with the form as a JSON list under `name`
 * and get their rows when the item is saved.
 */
export function NewItemPhotos({ name, configured }: { name: string; configured: boolean }) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!configured) return <PhotosNotConfigured />;

  async function upload(files: File[]) {
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (files.length > room) setError(`An item can have up to ${MAX_PHOTOS} photos. The extra files were left out.`);
    setUploading(true);
    try {
      for (const file of files.slice(0, Math.max(0, room))) {
        const uploaded = await uploadPhoto(file);
        setPhotos((current) => [...current, uploaded]);
      }
    } catch (caught) {
      setError(caught instanceof UploadError ? caught.message : "The upload failed. Try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        type="hidden"
        name={name}
        value={JSON.stringify(photos.map(({ publicId, width, height }) => ({ publicId, width, height })))}
      />
      <PhotoGrid
        photos={photos.map((photo) => ({ id: photo.publicId, url: photo.previewUrl }))}
        busy={uploading}
        onMove={(id, delta) =>
          setPhotos((current) => {
            const order = moveInList(
              current.map((photo) => photo.publicId),
              id,
              delta,
            );
            return order.flatMap((publicId) => current.find((photo) => photo.publicId === publicId) ?? []);
          })
        }
        onDelete={(id) => {
          setPhotos((current) => current.filter((photo) => photo.publicId !== id));
          void discardUploadedPhotoAction(id);
        }}
      />
      {error ? (
        <p role="alert" className="text-[13px] font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <PhotoPickerButton disabled={uploading || photos.length >= MAX_PHOTOS} uploading={uploading} onFiles={(files) => void upload(files)} />
        <span className="text-ink-muted">The first photo is the thumbnail.</span>
      </div>
    </div>
  );
}
