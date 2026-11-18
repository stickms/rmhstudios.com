import {
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ImagePlus,
  X,
} from 'lucide-react';
import { IconButton } from '@/components/ui/icon-button';
import {
  AIImageButton,
  type AiImageGenerate,
} from '@/components/feed/AIImageButton';
import type { AssistRewrite } from '@/components/feed/ComposeAssist';
import { toast } from '@/lib/toast';
import { serverError } from '@/lib/http';
import {
  AI_IMAGE_TIMEOUT_MS,
  AI_TIMEOUT_MS,
  api,
} from '@/lib/contract/client';
import { uploadImagesApi } from '@/lib/media/upload.contract';
import {
  adminEmailAiImage,
  adminEmailAiRewrite,
} from '@/lib/admin/email.contract';
import { MAX_EMAIL_IMAGES } from '@/lib/email/campaign-limits';

/**
 * The compose box's AI tools (`ComposeAssist`, `AIGenerateButton`,
 * `AIImageButton`) are used as they are in the email composer. Only where the
 * requests go differs: an email is longer than the 1,000 characters the feed's
 * rewrite takes, and the feed's image route is gated by membership tier, so
 * these two point the same components at the admin email routes.
 */
export function emailRewrite(
  subject: string,
): AssistRewrite {
  return async (
    text,
    action,
  ) =>
    (
      await api(
        adminEmailAiRewrite,
        {
          body: {
            text,
            action,
            ...(subject.trim()
              ? {
                  subject:
                    subject.trim(),
                }
              : {}),
          },
          timeoutMs:
            AI_TIMEOUT_MS,
        },
      )
    )
      .text;
}

/** The image generator for the email composer; the draft is the subject and body together. */
export const emailImage: AiImageGenerate =
  async (
    draft,
  ) =>
    (
      await api(
        adminEmailAiImage,
        {
          body: {
            body: draft,
          },
          timeoutMs:
            AI_IMAGE_TIMEOUT_MS,
        },
      )
    )
      .url;

/**
 * Pictures under the message: the compose box's AI image button, an upload
 * button, and the strip of what is attached. Both kinds are stored as site
 * images, the only kind an email accepts.
 */
export function EmailImages({
  subject,
  body,
  images,
  onImages,
  leading,
}: {
  subject: string;
  body: string;
  images: string[];
  onImages: (
    next:
      | string[]
      | ((
          prev: string[],
        ) => string[]),
  ) => void;
  /** Tools drawn first in the row (the compose box's AI draft button). */
  leading?: ReactNode;
}) {
  const {
    t,
  } =
    useTranslation(
      'admin',
    );
  const inputRef =
    useRef<HTMLInputElement>(
      null,
    );
  const [
    uploading,
    setUploading,
  ] =
    useState(
      false,
    );
  const full =
    images.length >=
    MAX_EMAIL_IMAGES;

  async function upload(
    files: FileList | null,
  ) {
    if (
      !files ||
      files.length ===
        0
    )
      return;
    const form =
      new FormData();
    Array.from(
      files,
    )
      .slice(
        0,
        MAX_EMAIL_IMAGES -
          images.length,
      )
      .forEach(
        (
          f,
        ) =>
          form.append(
            'images',
            f,
          ),
      );
    setUploading(
      true,
    );
    try {
      const {
        urls,
      } =
        await api(
          uploadImagesApi,
          {
            body: form,
          },
        );
      onImages(
        (
          prev,
        ) =>
          [
            ...prev,
            ...urls,
          ].slice(
            0,
            MAX_EMAIL_IMAGES,
          ),
      );
    } catch (e) {
      toast.error(
        serverError(
          e,
        ) ||
          t(
            'email-image-upload-failed',
            {
              defaultValue:
                'Upload failed',
            },
          ),
      );
    } finally {
      setUploading(
        false,
      );
      if (
        inputRef.current
      )
        inputRef.current.value =
          '';
    }
  }

  return (
    <div className="space-y-3">
      {images.length >
      0 ? (
        <ul className="grid grid-cols-2 gap-2">
          {images.map(
            (
              url,
            ) => (
              <li
                key={
                  url
                }
                className="relative"
              >
                <img
                  src={
                    url
                  }
                  alt=""
                  loading="lazy"
                  className="aspect-video w-full rounded-site border border-site-border bg-site-bg-subtle object-cover"
                />
                <IconButton
                  icon={
                    X
                  }
                  size="icon-xs"
                  variant="default"
                  className="absolute right-2 top-2"
                  label={t(
                    'email-image-remove',
                    {
                      defaultValue:
                        'Remove picture',
                    },
                  )}
                  onClick={() =>
                    onImages(
                      (
                        prev,
                      ) =>
                        prev.filter(
                          (
                            u,
                          ) =>
                            u !==
                            url,
                        ),
                    )
                  }
                />
              </li>
            ),
          )}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-1">
        {
          leading
        }
        <IconButton
          icon={
            ImagePlus
          }
          label={t(
            'email-image-upload',
            {
              defaultValue:
                'Add a picture',
            },
          )}
          loading={
            uploading
          }
          disabled={
            full ||
            uploading
          }
          onClick={() =>
            inputRef.current?.click()
          }
        />
        <AIImageButton
          draft={`${subject.trim()}\n\n${body.trim()}`
            .trim()
            .slice(
              0,
              1_000,
            )}
          disabled={
            full
          }
          generate={
            emailImage
          }
          onGenerated={(
            url,
          ) =>
            onImages(
              (
                prev,
              ) =>
                [
                  ...prev,
                  url,
                ].slice(
                  0,
                  MAX_EMAIL_IMAGES,
                ),
            )
          }
        />
        <span className="t-meta">
          {t(
            'email-image-count',
            {
              n: images.length,
              max: MAX_EMAIL_IMAGES,
              defaultValue:
                '{{n}} of {{max}} pictures',
            },
          )}
        </span>
        <input
          ref={
            inputRef
          }
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(
            e,
          ) =>
            void upload(
              e
                .target
                .files,
            )
          }
        />
      </div>
    </div>
  );
}
