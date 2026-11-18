/**
 * A setting whose value is one of a few (Steel section 10, Settings): the name and one line at the start, a dropdown
 * at the end, on a rule. This is how a choice is set on every settings page; a radio list with a hover fill is not
 * (the fill ran edge to edge with no room for the text, and every page drew it a little differently).
 *
 * Pass `hint` for the line under the name; when the options each explain themselves, pass the selected option's
 * explanation, so the row always says what the current choice does.
 */

import { useId } from 'react';
import { Select } from '@/components/ui/select';

export interface SettingsSelectOption {
  value: string;
  label: string;
}

export function SettingsSelectRow({
  label,
  hint,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  hint?: React.ReactNode;
  value: string;
  options: readonly SettingsSelectOption[];
  onChange: (
    value: string,
  ) => void;
  disabled?: boolean;
}) {
  const labelId =
    useId();
  const hintId =
    useId();
  return (
    <div className="settings-row">
      <span className="settings-row__text">
        <span
          id={
            labelId
          }
          className="settings-row__name block"
        >
          {
            label
          }
        </span>
        {hint ? (
          <span
            id={
              hintId
            }
            className="settings-row__hint block"
          >
            {
              hint
            }
          </span>
        ) : null}
      </span>
      <Select
        value={
          value
        }
        onChange={(
          e,
        ) =>
          onChange(
            e
              .target
              .value,
          )
        }
        aria-labelledby={
          labelId
        }
        aria-describedby={
          hint
            ? hintId
            : undefined
        }
        disabled={
          disabled
        }
        controlSize="sm"
        containerClassName="w-36 shrink-0 sm:w-40"
      >
        {options.map(
          (
            o,
          ) => (
            <option
              key={
                o.value
              }
              value={
                o.value
              }
            >
              {
                o.label
              }
            </option>
          ),
        )}
      </Select>
    </div>
  );
}
