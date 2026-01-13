import { useEffect, useState } from 'react';
import moment from 'moment-timezone';

export default function DateRangeFilter({ dateFrom, setDateFrom, dateTo, setDateTo, useDateRange, setUseDateRange, onSearch }) {
  const [activeQuickSelect, setActiveQuickSelect] = useState(null);

  // Initialize default dates on first render (Bangkok timezone)
  useEffect(() => {
    if (!dateFrom || !dateTo) {
      const now = moment.tz('Asia/Bangkok');
      const today = now.format('YYYY-MM-DD');
      const firstDayOfMonth = now.clone().startOf('month').format('YYYY-MM-DD');
      
      if (!dateFrom) setDateFrom(firstDayOfMonth);
      if (!dateTo) setDateTo(today);
      if (!useDateRange) setUseDateRange(true);
    }
  }, []);

  const handleQuickSelect = (type) => {
    const now = moment.tz('Asia/Bangkok');
    let fromDate, toDate;

    switch (type) {
      case 'today':
        fromDate = now.format('YYYY-MM-DD');
        toDate = now.format('YYYY-MM-DD');
        break;
      case 'yesterday':
        const yesterday = now.clone().subtract(1, 'day');
        fromDate = yesterday.format('YYYY-MM-DD');
        toDate = yesterday.format('YYYY-MM-DD');
        break;
      case '7days':
        const sevenDaysAgo = now.clone().subtract(7, 'days');
        fromDate = sevenDaysAgo.format('YYYY-MM-DD');
        toDate = now.format('YYYY-MM-DD');
        break;
      case '14days':
        const fourteenDaysAgo = now.clone().subtract(14, 'days');
        fromDate = fourteenDaysAgo.format('YYYY-MM-DD');
        toDate = now.format('YYYY-MM-DD');
        break;
      case '30days':
        const thirtyDaysAgo = now.clone().subtract(30, 'days');
        fromDate = thirtyDaysAgo.format('YYYY-MM-DD');
        toDate = now.format('YYYY-MM-DD');
        break;
      case 'thisMonth':
        const firstOfMonth = now.clone().startOf('month');
        fromDate = firstOfMonth.format('YYYY-MM-DD');
        toDate = now.format('YYYY-MM-DD');
        break;
      case 'lastMonth':
        const firstOfLastMonth = now.clone().subtract(1, 'month').startOf('month');
        const lastOfLastMonth = now.clone().startOf('month').subtract(1, 'day');
        fromDate = firstOfLastMonth.format('YYYY-MM-DD');
        toDate = lastOfLastMonth.format('YYYY-MM-DD');
        break;
      default:
        return;
    }

    setDateFrom(fromDate);
    setDateTo(toDate);
    setUseDateRange(true);
    setActiveQuickSelect(type);
  };

  return (
    <div className="bg-white rounded-xl shadow p-6">
      <div className="flex flex-col gap-4">
        {/* Quick Select Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="text-sm font-medium text-gray-700 whitespace-nowrap">เลือกช่วงเวลาด่วน:</label>
          <button
            onClick={() => handleQuickSelect('today')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === 'today'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            วันนี้
          </button>
          <button
            onClick={() => handleQuickSelect('yesterday')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === 'yesterday'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            เมื่อวาน
          </button>
          <button
            onClick={() => handleQuickSelect('7days')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === '7days'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            7 วันที่ผ่านมา
          </button>
          <button
            onClick={() => handleQuickSelect('14days')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === '14days'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            14 วันที่ผ่านมา
          </button>
          <button
            onClick={() => handleQuickSelect('30days')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === '30days'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            30 วันที่ผ่านมา
          </button>
          <button
            onClick={() => handleQuickSelect('thisMonth')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === 'thisMonth'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            เดือนนี้
          </button>
          <button
            onClick={() => handleQuickSelect('lastMonth')}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
              activeQuickSelect === 'lastMonth'
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            เดือนที่แล้ว
          </button>
        </div>

        {/* Date Selection - Always Visible */}
        <div className="flex flex-col sm:flex-row items-center gap-3">
          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm text-gray-600 whitespace-nowrap">จาก:</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setActiveQuickSelect(null);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>
          
          <div className="flex items-center gap-2 flex-1">
            <label className="text-sm text-gray-600 whitespace-nowrap">ถึง:</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setActiveQuickSelect(null);
              }}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
            />
          </div>

          <button
            onClick={onSearch}
            className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition-colors font-medium text-sm whitespace-nowrap"
          >
            ✓ ค้นหา
          </button>
        </div>
        
        <p className="text-xs text-gray-500">
          📅 ข้อมูลระหว่างวันที่ {new Date(dateFrom).toLocaleDateString('th-TH')} ถึง {new Date(dateTo).toLocaleDateString('th-TH')}
        </p>
      </div>
    </div>
  );
}
