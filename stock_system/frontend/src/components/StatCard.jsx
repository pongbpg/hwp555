export default function StatCard({ title, value, subtitle, color = 'blue' }) {
  const colorClasses = {
    blue: 'text-blue-600',
    red: 'text-red-600',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    orange: 'text-orange-600',
    purple: 'text-purple-600',
    gray: 'text-gray-600',
  };
  const textColor = colorClasses[color] || colorClasses.blue;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
      <div className="text-sm text-gray-500 mb-1">{title}</div>
      <div className="flex items-baseline gap-2">
        <div className={`text-2xl font-bold ${textColor}`}>{value}</div>
        {subtitle && <div className="text-xs text-gray-400">{subtitle}</div>}
      </div>
    </div>
  );
}
