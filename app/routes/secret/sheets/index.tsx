/**
 * Sheets Page Route
 */

import { createFileRoute } from '@tanstack/react-router';
import SheetsApp from '@/components/rmh-sheets/SheetsApp';

export const Route = createFileRoute('/secret/sheets/')({
  component: SheetsPage,
});

function SheetsPage() {
  return <SheetsApp />;
}
