/**
 * The toolbar's Listen button (feature 12). Deliberately tiny: it renders
 * nothing until it has mounted and found speech synthesis (so the server HTML and
 * the first client render match, and a browser without a voice gets no dead
 * button), and loads the controller on the first press. The toolbar row keeps its
 * own minimum height, so the button arriving moves nothing.
 */

import {
  lazy,
  useEffect,
  useState,
  type RefObject,
} from 'react';
import { useTranslation } from 'react-i18next';
import { Headphones } from 'lucide-react';
import { ArrivalSuspense } from '@/components/ui/arrive';
import { Button } from '@/components/ui/button';

const ListenControls =
  lazy(
    () =>
      import('./ListenControls'),
  );

export function ListenButton({
  rootRef,
  resetKey,
}: {
  /** The element holding the text to read. */
  rootRef: RefObject<HTMLElement | null>;
  /** Changing it (another article, another page of a book) ends listening. */
  resetKey: string;
}) {
  const {
    t,
  } =
    useTranslation(
      'read-aloud',
    );
  const [
    supported,
    setSupported,
  ] =
    useState(
      false,
    );
  const [
    active,
    setActive,
  ] =
    useState(
      false,
    );
  useEffect(
    () =>
      setSupported(
        'speechSynthesis' in
          window,
      ),
    [],
  );
  useEffect(
    () =>
      setActive(
        false,
      ),
    [
      resetKey,
    ],
  );

  if (
    !supported
  )
    return null;
  const label =
    t(
      'listen',
      {
        defaultValue:
          'Listen',
      },
    );
  if (
    !active
  )
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          setActive(
            true,
          )
        }
      >
        <Headphones
          aria-hidden
        />
        {
          label
        }
      </Button>
    );
  return (
    <ArrivalSuspense
      wrap={false}
      fallback={
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled
        >
          <Headphones
            aria-hidden
          />
          {
            label
          }
        </Button>
      }
    >
      <ListenControls
        rootRef={
          rootRef
        }
        onClose={() =>
          setActive(
            false,
          )
        }
      />
    </ArrivalSuspense>
  );
}
