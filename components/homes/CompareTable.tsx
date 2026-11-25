/**
 * Saved listings side by side (s12 10): a real `<table>`, one column per listing and one row per fact, with the row
 * names as row headers and the listing as the column header. Columns are divided by a 1px rule (Steel section 5), no
 * boxes. On a phone the table scrolls inside its own region, with the row names pinned at the start.
 *
 * Every cell arrives as data (`lib/homes/compare.ts`); the words, the money and the dates are made here, in the
 * reader's language. A listing that is no longer on the market keeps its column, marked "No longer listed".
 */
import { Link } from '@tanstack/react-router';
import { Check, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Button } from '@/components/ui/button';
import { formatDistance, type DistanceUnit } from '@/lib/homes/distance';
import type { CompareCell, CompareRowKey, ComparisonModel } from '@/lib/homes/compare';
import type { Listing, PropertyType } from '@/lib/homes/types';

interface CompareTableProps {
  model: ComparisonModel;
  unit: DistanceUnit;
  /** The label of the place distances are measured to (shown in the distance row's name). */
  placeLabel?: string;
  /** Take a listing out of the comparison. */
  onRemove?: (id: string) => void;
}

const RULE = 'border-s border-site-border';
const CELL = 'px-3 py-2.5 align-top';

function money(value: number, locale: string, fractionDigits: number): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch {
    return `$${value.toFixed(fractionDigits)}`;
  }
}

function plain(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value);
  } catch {
    return String(value);
  }
}

function percent(value: number, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      maximumFractionDigits: 1,
      signDisplay: 'exceptZero',
    }).format(value / 100);
  } catch {
    return `${value}%`;
  }
}

function day(iso: string, locale: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(at);
  } catch {
    return iso.slice(0, 10);
  }
}

function typeName(t: TFunction, type: PropertyType): string {
  switch (type) {
    case 'APARTMENT':
      return t('type-apartment', { defaultValue: 'Apartment' });
    case 'HOUSE':
      return t('type-house', { defaultValue: 'House' });
    case 'CONDO':
      return t('type-condo', { defaultValue: 'Condo' });
    case 'TOWNHOUSE':
      return t('type-townhouse', { defaultValue: 'Townhouse' });
    case 'ROOM':
      return t('type-room', { defaultValue: 'Room' });
    case 'OTHER':
      return t('type-other', { defaultValue: 'Other' });
  }
}

function rowName(t: TFunction, key: CompareRowKey, placeLabel: string | undefined): string {
  switch (key) {
    case 'price':
      return t('row-price', { defaultValue: 'Price' });
    case 'perSqft':
      return t('row-per-sqft', { defaultValue: 'Per square foot' });
    case 'lastChange':
      return t('row-last-change', { defaultValue: 'Last price change' });
    case 'beds':
      return t('row-beds', { defaultValue: 'Bedrooms' });
    case 'baths':
      return t('row-baths', { defaultValue: 'Bathrooms' });
    case 'sqft':
      return t('row-sqft', { defaultValue: 'Square feet' });
    case 'type':
      return t('row-type', { defaultValue: 'Type' });
    case 'pets':
      return t('row-pets', { defaultValue: 'Pets allowed' });
    case 'available':
      return t('row-available', { defaultValue: 'Available from' });
    case 'distance':
      return placeLabel
        ? t('row-distance-to', { defaultValue: 'Distance to {{place}}, straight line', place: placeLabel })
        : t('row-distance', { defaultValue: 'Distance, straight line' });
    case 'afford':
      return t('row-afford', { defaultValue: 'Against your budget' });
    case 'note':
      return t('row-note', { defaultValue: 'Your note' });
  }
}

function Cell({
  rowKey,
  cell,
  listing,
  unit,
  locale,
  t,
}: {
  rowKey: CompareRowKey;
  cell: CompareCell;
  listing: Listing;
  unit: DistanceUnit;
  locale: string;
  t: TFunction;
}) {
  switch (cell.kind) {
    case 'none':
      return (
        <>
          <span aria-hidden>{'—'}</span>
          <span className="sr-only">{t('cell-none', { defaultValue: 'Not given' })}</span>
        </>
      );
    case 'money': {
      // A price per square foot is always shown to the cent; a price is whole currency units.
      const perSqft = rowKey === 'perSqft';
      return (
        <>
          <span className="whitespace-nowrap">{money(cell.value, locale, perSqft ? 2 : 0)}</span>
          {!perSqft && listing.listingType === 'RENT' && (
            <span className="t-meta ms-1 whitespace-nowrap">{t('cell-per-month', { defaultValue: 'a month' })}</span>
          )}
        </>
      );
    }
    case 'number':
      return <span className="whitespace-nowrap">{plain(cell.value, locale)}</span>;
    case 'type':
      return <span>{typeName(t, cell.value)}</span>;
    case 'yesno':
      return <span>{cell.value ? t('cell-yes', { defaultValue: 'Yes' }) : t('cell-no', { defaultValue: 'No' })}</span>;
    case 'date':
      return <time dateTime={cell.iso}>{day(cell.iso, locale)}</time>;
    case 'change':
      return (
        <>
          <span className="whitespace-nowrap">
            {money(cell.change.oldPrice, locale, 0)} {'→'} {money(cell.change.newPrice, locale, 0)}
          </span>{' '}
          <span className="t-meta whitespace-nowrap">{percent(cell.change.percent, locale)}</span>
          <br />
          <time className="t-meta" dateTime={cell.change.changedAt}>
            {day(cell.change.changedAt, locale)}
          </time>
        </>
      );
    case 'distance':
      return <span className="whitespace-nowrap">{formatDistance(cell.km, unit)}</span>;
    case 'afford':
      return (
        <>
          <span>
            {cell.affordable
              ? t('cell-within-budget', { defaultValue: 'Within your budget' })
              : t('cell-over-budget', {
                  defaultValue: '{{amount}} over your budget',
                  amount: money(cell.overBy, locale, 0),
                })}
          </span>
          <br />
          <span className="t-meta">
            {t('cell-monthly-cost', {
              defaultValue: '{{amount}} a month',
              amount: money(cell.monthlyCost, locale, 0),
            })}
          </span>
        </>
      );
    case 'text':
      return (
        <p dir="auto" className="whitespace-pre-wrap break-words">
          {cell.value}
        </p>
      );
  }
}

export function CompareTable({ model, unit, placeLabel, onRemove }: CompareTableProps) {
  const { t, i18n } = useTranslation('homes-compare');
  const locale = i18n.language || 'en';
  const { columns, rows, amenities } = model;
  const span = columns.length + 1;

  return (
    <div
      role="region"
      tabIndex={0}
      aria-label={t('table-region', { defaultValue: 'Saved homes side by side' })}
      className="w-full overflow-x-auto overscroll-x-contain"
    >
      <table className="t-body w-full min-w-max border-collapse text-start">
        <caption className="sr-only">{t('table-caption', { defaultValue: 'Saved homes side by side' })}</caption>
        <thead>
          <tr className="border-b border-site-border">
            <th scope="col" className="sticky start-0 min-w-32 bg-site-bg px-3 py-2.5 text-start">
              <span className="sr-only">{t('col-fact', { defaultValue: 'Fact' })}</span>
            </th>
            {columns.map((c) => (
              <th key={c.id} scope="col" className={`${RULE} ${CELL} min-w-48 max-w-64 text-start font-normal`}>
                <div className="flex items-start justify-between gap-2">
                  <Link
                    to="/homes/listing/$id"
                    params={{ id: c.id }}
                    className="t-heading min-w-0 break-words underline"
                  >
                    <span dir="auto">{c.listing.title}</span>
                  </Link>
                  {onRemove && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={t('remove-column', {
                        defaultValue: 'Remove {{title}} from the comparison',
                        title: c.listing.title,
                      })}
                      onClick={() => onRemove(c.id)}
                    >
                      <X aria-hidden />
                    </Button>
                  )}
                </div>
                <p className="t-meta mt-0.5" dir="auto">
                  {[c.listing.city, c.listing.state].filter(Boolean).join(', ')}
                </p>
                {c.noLongerListed && (
                  <p className="t-label mt-1">{t('no-longer-listed', { defaultValue: 'No longer listed' })}</p>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-site-border">
              <th scope="row" className={`${CELL} t-label sticky start-0 min-w-32 max-w-40 bg-site-bg text-start`}>
                {rowName(t, row.key, placeLabel)}
              </th>
              {row.cells.map((cell, i) => {
                const column = columns[i];
                if (!column) return null;
                return (
                  <td key={column.id} className={`${RULE} ${CELL}`}>
                    <Cell rowKey={row.key} cell={cell} listing={column.listing} unit={unit} locale={locale} t={t} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {amenities.length > 0 && (
          <tbody>
            <tr className="border-b border-site-border">
              <th scope="colgroup" colSpan={span} className="t-heading sticky start-0 px-3 pb-2 pt-5 text-start">
                {t('amenities', { defaultValue: 'Amenities' })}
              </th>
            </tr>
            {amenities.map((a) => (
              <tr key={a.name} className="border-b border-site-border">
                <th
                  scope="row"
                  className={`${CELL} t-body sticky start-0 min-w-32 max-w-40 bg-site-bg text-start font-normal`}
                >
                  <span dir="auto">{a.name}</span>
                </th>
                {a.has.map((has, i) => {
                  const column = columns[i];
                  if (!column) return null;
                  return (
                    <td key={column.id} className={`${RULE} ${CELL}`}>
                      {has ? (
                        <>
                          <Check className="size-4" aria-hidden />
                          <span className="sr-only">{t('amenity-yes', { defaultValue: 'Has it' })}</span>
                        </>
                      ) : (
                        <>
                          <span aria-hidden>{'—'}</span>
                          <span className="sr-only">{t('amenity-no', { defaultValue: 'Does not have it' })}</span>
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        )}
      </table>
    </div>
  );
}
