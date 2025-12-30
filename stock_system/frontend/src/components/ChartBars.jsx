export default function ChartBars({ title, items, labelKey, valueKey, secondaryValueKey, maxBars = 10 }) {
  const sliced = (items || []).slice(0, maxBars);
  const maxVal = Math.max(...sliced.map((it) => Number(it[valueKey]) || 0), 1);

  return (
    <div className="mt-4">
      <h3 className="text-lg font-semibold text-gray-700 mb-3">{title}</h3>
      <div className="space-y-2">
        {sliced.map((it, idx) => {
          const val = Number(it[valueKey]) || 0;
          const pct = Math.round((val / maxVal) * 100);
          const days = secondaryValueKey ? Number(it[secondaryValueKey]) || 0 : null;
          const barColor =
            days != null
              ? days < 7
                ? 'bg-red-500'
                : days < 14
                ? 'bg-yellow-500'
                : 'bg-green-500'
              : 'bg-blue-500';

          return (
            <div key={idx}>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-gray-700 truncate max-w-xs">{it[labelKey]}</span>
                <span className="text-gray-500 text-xs whitespace-nowrap">
                  {val}
                  {days != null && ` • ${days} วัน`}
                </span>
              </div>
              <div className="bg-gray-200 rounded-full h-4 overflow-hidden">
                <div className={`h-4 rounded-full ${barColor}`} style={{ width: `${pct}%` }} title={`${val}`} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
