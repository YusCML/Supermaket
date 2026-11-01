// ui/image-picker.tsx: the product photo box in Inventory's Add and Edit forms.
//
// Replaces the browser's own file box, which looks different everywhere and
// can't be undone: once a file was picked there was no way to take it back,
// and after saving it still showed the old file name.
//
// What it shows:
//   - a preview of the photo: the newly chosen file, else the product's
//     current photo (Edit form), else an empty picture icon;
//   - the file name and size (or what's there now);
//   - "Choose photo" / "Change photo", which opens the computer's file
//     window (the real <input type="file"> is hidden and opened by a label);
//   - "Remove", which takes back a chosen photo, or (Edit form, when
//     `onRemoveCurrent` is given) removes the product's current photo.
//
// The parent keeps the chosen File in its own state (`file` / `onFileChange`),
// exactly like before, so saving works the same way. Checking the file type
// and size still happens on save (imageFileSchema in lib/validation.ts).
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { ImageIcon, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImagePickerProps {
  // Ties it to its <label htmlFor="…"> (the Field around it).
  id: string;
  // The newly chosen photo, or null for none.
  file: File | null;
  // Called with the chosen file, or with null when it's removed.
  onFileChange: (file: File | null) => void;
  // The product's photo as it is now (Edit form), shown while no new file
  // is chosen. Leave out (or null) when there is none.
  currentUrl?: string | null;
  // Edit form only: removes the CURRENT photo (the parent remembers that and
  // saves the product without a picture). Shows a "Remove" button for it.
  onRemoveCurrent?: () => void;
  // Error wiring from invalidProps() (ui/field.tsx).
  'aria-invalid'?: ComponentProps<'input'>['aria-invalid'];
  'aria-describedby'?: string;
}

// File size in words: "245 KB", "1.2 MB".
const sizeText = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function ImagePicker({ id, file, onFileChange, currentUrl, onRemoveCurrent, ...aria }: ImagePickerProps) {
  // The hidden file box, so its value can be cleared (see clearInput).
  const inputRef = useRef<HTMLInputElement>(null);
  // A temporary web address for previewing the chosen file in an <img>.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Make the preview address when a file is chosen, and throw it away when
  // the file changes or the box goes away (URL.revokeObjectURL frees the
  // memory the browser keeps for it). With no file, there's no preview.
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // When the parent clears the file (e.g. after saving), empty the hidden
  // box too, so picking the same file again still counts as a change.
  useEffect(() => {
    if (!file && inputRef.current) inputRef.current.value = '';
  }, [file]);

  // What the preview shows: the chosen file, else the current photo.
  const shownUrl = previewUrl ?? currentUrl ?? null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-gray-300 bg-white p-2.5 shadow-2xs">
      {/* Preview */}
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-subtle">
        {shownUrl ? (
          <img src={shownUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          <ImageIcon className="size-5 text-ink-subtle" aria-hidden="true" />
        )}
      </span>

      {/* What's there, in words */}
      <span className="min-w-0 flex-1 text-sm">
        {file ? (
          <>
            <span className="block truncate font-medium text-ink" title={file.name}>
              {file.name}
            </span>
            <span className="block text-xs text-ink-muted">{sizeText(file.size)} · new photo</span>
          </>
        ) : currentUrl ? (
          <span className="block text-ink-muted">Current photo</span>
        ) : (
          <span className="block text-ink-subtle">No photo yet</span>
        )}
      </span>

      {/* Buttons. The label IS the "Choose photo" button: clicking a label
          tied to a file box opens the file window. sr-only hides the real
          box but keeps it usable by keyboard and screen readers. */}
      <div className="flex shrink-0 items-center gap-1.5">
        <input
          ref={inputRef}
          id={id}
          type="file"
          accept="image/*"
          className="peer sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          {...aria}
        />
        <label
          htmlFor={id}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-subtle peer-focus-visible:ring-2 peer-focus-visible:ring-brand/40"
        >
          <Upload className="size-3.5" aria-hidden="true" />
          {file || currentUrl ? 'Change photo' : 'Choose photo'}
        </label>
        {/* Remove: takes back a newly chosen photo; in the Edit form, with
            no new photo chosen, removes the current one. */}
        {(file || (currentUrl && onRemoveCurrent)) && (
          <button
            type="button"
            onClick={() => (file ? onFileChange(null) : onRemoveCurrent?.())}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-semibold text-ink-muted transition-colors',
              'hover:bg-danger/10 hover:text-danger-strong'
            )}
            aria-label={file ? 'Remove the chosen photo' : 'Remove the current photo'}
          >
            <X className="size-3.5" aria-hidden="true" />
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
