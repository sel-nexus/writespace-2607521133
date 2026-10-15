/** Present one labelled dashboard count without inventing trends or extra metrics. */
import PropTypes from 'prop-types';

/**
 * Pair an exact metric label with its numeric value or an unavailable marker.
 * @param {object} props - Metric presentation.
 * @param {string} props.label - Source-defined label.
 * @param {number|string} props.value - Count or diagnostic placeholder.
 * @returns {React.JSX.Element} Accessible definition pair.
 */
export default function StatCard({ label, value }) {
  return (
    <div className="rounded-xl border border-stone-300 bg-white p-6">
      <dt className="text-sm font-semibold text-stone-600">
        {label}
      </dt>
      <dd className="mt-3 text-4xl font-semibold tabular-nums text-stone-900">
        {value}
      </dd>
    </div>
  );
}

StatCard.propTypes = {
  label: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
};
