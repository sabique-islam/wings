import { useEffect, useState } from "react";
import { Download } from "@/lib/icons";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  IMAGE_LIGHTBOX_CLOSE_EVENT,
  IMAGE_LIGHTBOX_OPEN_EVENT,
  downloadLightboxImage,
  parseLightboxPayload,
  requestCloseImageLightbox,
  type ImageLightboxPayload,
} from "@/lib/imageLightbox";

export function ImageLightboxHost() {
  const [image, setImage] = useState<ImageLightboxPayload | null>(null);

  useEffect(() => {
    const onOpen = (event: Event) => {
      const next = parseLightboxPayload((event as CustomEvent).detail);
      if (next) setImage(next);
    };
    const onClose = () => setImage(null);
    window.addEventListener(IMAGE_LIGHTBOX_OPEN_EVENT, onOpen);
    window.addEventListener(IMAGE_LIGHTBOX_CLOSE_EVENT, onClose);
    return () => {
      window.removeEventListener(IMAGE_LIGHTBOX_OPEN_EVENT, onOpen);
      window.removeEventListener(IMAGE_LIGHTBOX_CLOSE_EVENT, onClose);
    };
  }, []);

  const open = Boolean(image);
  const title = image?.caption.trim() || image?.alt.trim() || "Image";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setImage(null);
          requestCloseImageLightbox();
        }
      }}
    >
      <DialogContent
        className="image-lightbox-modal max-w-[min(96vw,72rem)] w-full gap-3 border-border bg-background/95 p-4 sm:p-6"
        data-testid="image-lightbox"
      >
        <DialogTitle className="truncate pr-8 text-sm font-medium">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Full-size preview. The page is not edited from this view.
        </DialogDescription>
        {image ? (
          <>
            <img
              className="image-lightbox-photo mx-auto max-h-[75vh] w-auto max-w-full object-contain"
              src={image.src}
              alt={image.alt || image.caption || ""}
              data-testid="image-lightbox-image"
            />
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-mono text-ink-1 hover:bg-accent/50"
                data-testid="image-lightbox-download"
                onClick={() => downloadLightboxImage(image.src, image.caption || image.alt)}
              >
                <Download className="h-3.5 w-3.5" />
                download
              </button>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
