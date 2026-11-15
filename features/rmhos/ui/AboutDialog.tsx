/** About: what rmhOS is built from, and where the files live. Facts: about-facts.ts. */
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  BUILD_SCRIPTS_URL,
  KERNEL_TARBALL_URL,
  KERNEL_VERSION,
  packagesUrl,
  V86_URL,
} from './about-facts';
import { resolveImageManifest } from '../engine/image-manifest';
import { CDN_BASE } from '@/lib/storage/asset';
import StoredCopies, { type StoredCopiesSource } from './StoredCopies';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  container: HTMLElement | null;
  session: StoredCopiesSource;
  /** The current archive could not be read (corrupt boot state): name its download that way. */
  currentDamaged: boolean;
  /** Another tab is running rmhOS for this account: stored copies can be downloaded, not removed. */
  readOnly?: boolean;
  /** A machine is up in this tab: deleting the files stops it. */
  machineUp?: boolean;
  /** The browser may delete the stored files (it said persistence is not granted). */
  evictionRisk?: boolean;
  /** Asks the browser to keep the files; call it from the click. */
  onKeep?: () => void;
}

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 text-(--app-accent) [overflow-wrap:anywhere]"
    >
      {children}
    </a>
  );
}

export default function AboutDialog({
  open,
  onOpenChange,
  container,
  session,
  currentDamaged,
  readOnly = false,
  machineUp = false,
  evictionRisk = false,
  onKeep,
}: Props) {
  const { t } = useTranslation('c-rmhos');
  const manifest = resolveImageManifest(CDN_BASE || undefined);
  const packages = manifest ? packagesUrl(manifest) : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent container={container} className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('about-title', { defaultValue: 'About rmhOS' })}</DialogTitle>
          <DialogDescription>
            {t('files-kept', { defaultValue: 'Files are kept in this browser on this device.' })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 text-sm">
          <p>
            {t('about-kernel', {
              defaultValue:
                'rmhOS is built on the Linux kernel, licensed under the GNU General Public License, version 2 (GPL-2.0).',
            })}
          </p>
          <ul className="flex flex-col gap-2 ps-5 list-disc">
            <li>
              {t('about-kernel-source', {
                defaultValue: 'Kernel source, version {{version}}:',
                version: KERNEL_VERSION,
              })}{' '}
              <ExternalLink href={KERNEL_TARBALL_URL}>
                {`linux-${KERNEL_VERSION}.tar.xz`}
              </ExternalLink>
            </li>
            <li>
              {t('about-build', {
                defaultValue:
                  'The kernel configuration and patches are in scripts/rmhos/ in the repository:',
              })}{' '}
              <ExternalLink href={BUILD_SCRIPTS_URL}>scripts/rmhos/</ExternalLink>
            </li>
            {packages && (
            <li>
              {t('about-userland', {
                defaultValue:
                  'The rest of the system is Alpine Linux packages. Every package, with its version, is listed in',
              })}{' '}
              <ExternalLink href={packages}>packages.txt</ExternalLink>
            </li>
            )}
            <li>
              {t('about-emulator', {
                defaultValue: 'The emulator is v86 (BSD-2-Clause):',
              })}{' '}
              <ExternalLink href={V86_URL}>v86</ExternalLink>
            </li>
            <li>
              {t('about-bios', {
                defaultValue: 'The PC firmware is SeaBIOS (GNU LGPL, version 3).',
              })}
            </li>
          </ul>
          {evictionRisk && (
            <div className="flex flex-col gap-2">
              <p className="text-(--app-warning)">
                {t('eviction-line', {
                  defaultValue:
                    'This browser may delete these files to free space. Download a backup to keep them.',
                })}
              </p>
              {onKeep && (
                <div>
                  <Button size="sm" onClick={onKeep}>
                    {t('keep-files', { defaultValue: 'Keep my files in this browser' })}
                  </Button>
                </div>
              )}
            </div>
          )}
          {open && (
            <StoredCopies
              session={session}
              container={container}
              currentDamaged={currentDamaged}
              readOnly={readOnly}
              machineUp={machineUp}
            />
          )}
          <p className="text-(--app-text-muted)">
            {t('about-saving', {
              defaultValue:
                'Saved reflects the last save. Files changed by programs running in the background are saved at the next autosave, every 5 minutes, or when you press Save.',
            })}
          </p>
          <p className="text-(--app-text-muted)">
            {t('about-keyboard', {
              defaultValue:
                'Keys go to rmhOS while its screen has focus. Press Ctrl+Alt+Shift+Escape, or click outside the screen, to use the page again.',
            })}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
