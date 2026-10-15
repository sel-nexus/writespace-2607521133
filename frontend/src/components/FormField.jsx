/** Provide a controlled, labelled input with associated inline feedback. */
import PropTypes from 'prop-types';

/**
 * Associate a stable label, optional hint and error with a controlled input.
 * @param {object} props - Input presentation and controlled value contract.
 * @param {string} props.id - Stable unique input ID, also used as its name.
 * @param {string} props.label - Visible accessible name.
 * @param {string} props.value - Current exact value; never trimmed here.
 * @param {(event:React.ChangeEvent<HTMLInputElement>) => void} props.onChange - Caller-owned state update.
 * @param {'text'|'password'} [props.type] - Native input type.
 * @param {string} props.autoComplete - Browser autocomplete purpose.
 * @param {boolean} [props.required] - Whether the field is required.
 * @param {string} [props.error] - Inline validation feedback.
 * @param {string} [props.hint] - Optional field instructions.
 * @returns {React.JSX.Element} Input and accessible feedback, without paste restrictions.
 */
export default function FormField({
  id, label, value, onChange, type = 'text', autoComplete, required = true, error = '', hint = '',
}) {
  const description = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-semibold text-stone-900">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-1 text-violet-800">
            *
          </span>
        )}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        aria-required={required}
        aria-invalid={Boolean(error)}
        aria-describedby={description}
        className={[
          'min-h-12 w-full min-w-0 rounded-lg border bg-white px-3 py-3 text-base text-stone-900',
          'focus:outline-none focus:ring-2 focus:ring-violet-700 focus:ring-offset-2',
          error ? 'border-red-700' : 'border-stone-400',
        ].join(' ')}
      />
      {hint && (
        <p id={`${id}-hint`} className="mt-2 text-xs leading-relaxed text-stone-600">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
    </div>
  );
}

FormField.propTypes = {
  id: PropTypes.string.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  type: PropTypes.oneOf(['text', 'password']),
  autoComplete: PropTypes.string.isRequired,
  required: PropTypes.bool,
  error: PropTypes.string,
  hint: PropTypes.string,
};
