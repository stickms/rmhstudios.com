/**
 * RMH PMC layout shell — scopes the system under `.rmhp-root` and renders the
 * glass command capsule and the footer around the page.
 *
 * Motion is CSS (rmh-pmc.css); the only script on a page is the mercury
 * renderer behind <Mercury/>, which is idle at rest.
 */
import { Outlet } from '@tanstack/react-router';
import { CommandBar, SiteFooter } from './shared';

export default function RmhPmcLayout() {
  return (
    <div className="rmhp-root">
      <CommandBar />
      <main>
        <Outlet />
      </main>
      <SiteFooter />
    </div>
  );
}
