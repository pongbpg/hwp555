import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

const API_URL = import.meta.env.VITE_HR_API_BASE_URL || 'http://localhost:5000/api';

export default function Dashboard({ user }) {
  const canManage = ['owner', 'hr'].includes(user?.role);
  const canViewSalary = ['owner', 'accountant'].includes(user?.role);
  const canViewAllKpi = ['owner', 'hr'].includes(user?.role);

  const [employees, setEmployees] = useState([]);
  const [allKpis, setAllKpis] = useState([]);
  const [leaveSummary, setLeaveSummary] = useState(null);
  const [myLeaveBalance, setMyLeaveBalance] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [selectedEmployeeData, setSelectedEmployeeData] = useState(null);
  const [attendanceData, setAttendanceData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const currentYear = new Date().getFullYear();

  useEffect(() => {
    const fetchEmployees = async () => {
      try {
        const response = await fetch(`${API_URL}/employees`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setEmployees(data);
        }
      } catch (error) {
        console.error('Error fetching employees:', error);
      }
    };

    const fetchAllKpis = async () => {
      try {
        // If user can view all KPIs (HR/Owner), fetch all; otherwise fetch only own
        const canViewAll = ['owner', 'hr'].includes(user?.role);
        const endpoint = canViewAll ? `${API_URL}/kpi` : `${API_URL}/kpi/my`;
        const response = await fetch(endpoint, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          const aggregated = aggregateMonthlyKpis(data);
          setAllKpis(aggregated);
          calculateStats(aggregated);
        }
      } catch (error) {
        console.error('Error fetching KPIs:', error);
      }
    };

    const fetchLeaveSummary = async () => {
      try {
        const canViewAll = ['owner', 'hr'].includes(user?.role);
        if (canViewAll) {
          const response = await fetch(`${API_URL}/attendance/summary?year=${currentYear}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setLeaveSummary(data);
          }
        } else {
          const response = await fetch(`${API_URL}/attendance/balance?year=${currentYear}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            setMyLeaveBalance(data);
          }
        }
      } catch (error) {
        console.error('Error fetching leave summary:', error);
      }
    };

    fetchEmployees();
    fetchAllKpis();
    fetchLeaveSummary();
  }, []);

  const calculateStats = (kpis) => {
    if (!kpis || kpis.length === 0) {
      setStats(null);
      return;
    }

    // filter out invalid KPI entries
    const validKpis = kpis.filter(k => k && typeof k.score === 'number');
    if (validKpis.length === 0) {
      setStats(null);
      return;
    }

    const avgScore = (validKpis.reduce((sum, kpi) => sum + (kpi.score || 0), 0) / validKpis.length).toFixed(1);
    const avgProductivity = (validKpis.reduce((sum, kpi) => sum + (kpi.metrics?.productivity ?? 0), 0) / validKpis.length).toFixed(1);
    const avgQuality = (validKpis.reduce((sum, kpi) => sum + (kpi.metrics?.quality ?? 0), 0) / validKpis.length).toFixed(1);
    const avgTeamwork = (validKpis.reduce((sum, kpi) => sum + (kpi.metrics?.teamwork ?? 0), 0) / validKpis.length).toFixed(1);
    const avgPunctuality = (validKpis.reduce((sum, kpi) => sum + (kpi.metrics?.punctuality ?? 0), 0) / validKpis.length).toFixed(1);

    setStats({
      avgScore,
      avgProductivity,
      avgQuality,
      avgTeamwork,
      avgPunctuality,
      totalEmployees: new Set(validKpis.map(k => k?.employeeId?._id).filter(Boolean)).size
    });
  };

  // รวม KPI โดย employeeId + year + month (เฉลี่ยคะแนนและ metrics, เก็บ sourceCount)
  const aggregateMonthlyKpis = (kpis) => {
    if (!Array.isArray(kpis) || kpis.length === 0) return [];

    const monthMap = {
      jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
      jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };
    const monthNames = [ 'January','February','March','April','May','June','July','August','September','October','November','December' ];

    const monthToNumber = (m) => {
      if (m == null) return null;
      if (typeof m === 'number' && !Number.isNaN(m)) return m;
      if (typeof m === 'string') {
        const trimmed = m.trim();
        if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
        const key = trimmed.toLowerCase().slice(0,3);
        return monthMap[key] || null;
      }
      return null;
    };
    const numberToMonthLabel = (n) => {
      if (!n || typeof n !== 'number') return String(n ?? '');
      return monthNames[n-1] || String(n);
    };

    const groups = {};
    kpis.forEach(k => {
      if (!k) return;
      const empId = k.employeeId?._id || (typeof k.employeeId === 'string' ? k.employeeId : null);
      if (!empId || k.year == null) return;
      const monthNumber = monthToNumber(k.month);
      // use monthNumber in key when available to normalize different representations
      const keyMonthPart = monthNumber != null ? monthNumber : String(k.month);
      const key = `${empId}_${k.year}_${keyMonthPart}`;

      if (!groups[key]) {
        groups[key] = {
          employeeId: k.employeeId || { _id: empId },
          year: Number(k.year),
          monthNumber: monthNumber,
          monthLabel: monthNumber ? numberToMonthLabel(monthNumber) : (k.month != null ? String(k.month) : ''),
          scoreSum: 0,
          metricsSum: { productivity: 0, quality: 0, teamwork: 0, punctuality: 0 },
          comments: [],
          count: 0
        };
      }
      const g = groups[key];
      g.scoreSum += (typeof k.score === 'number' ? k.score : 0);
      g.metricsSum.productivity += (k.metrics?.productivity || 0);
      g.metricsSum.quality += (k.metrics?.quality || 0);
      g.metricsSum.teamwork += (k.metrics?.teamwork || 0);
      g.metricsSum.punctuality += (k.metrics?.punctuality || 0);
      if (k.comments) g.comments.push(k.comments);
      g.count += 1;
    });

    const aggregated = Object.values(groups).map(g => ({
      employeeId: g.employeeId,
      year: g.year,
      month: g.monthLabel,        // display label (e.g., "December")
      monthNumber: g.monthNumber, // numeric month for sorting
      score: +(g.scoreSum / g.count).toFixed(1),
      metrics: {
        productivity: +((g.metricsSum.productivity) / g.count).toFixed(1),
        quality: +((g.metricsSum.quality) / g.count).toFixed(1),
        teamwork: +((g.metricsSum.teamwork) / g.count).toFixed(1),
        punctuality: +((g.metricsSum.punctuality) / g.count).toFixed(1),
      },
      comments: g.comments.join(' | '),
      sourceCount: g.count
    }));

    // เรียงจากล่าสุดไปก่อน (year desc, monthNumber desc)
    aggregated.sort((a, b) => {
      if (b.year !== a.year) return b.year - a.year;
      const am = a.monthNumber ?? monthToNumber(a.month);
      const bm = b.monthNumber ?? monthToNumber(b.month);
      if ((bm || 0) !== (am || 0)) return (bm || 0) - (am || 0);
      return (a.employeeId?._id || '').localeCompare(b.employeeId?._id || '');
    });

    return aggregated;
  };

  const handleEmployeeSelect = async (employeeId) => {
    setSelectedEmployee(employeeId);
    setLoading(true);

    try {
      const [kpiRes, attRes] = await Promise.all([
        fetch(`${API_URL}/kpi/employee/${employeeId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }),
        fetch(`${API_URL}/attendance/employee/${employeeId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        })
      ]);

      if (kpiRes.ok) {
        const kpiData = await kpiRes.json();
        // aggregate multiple evaluators for same month/year
        const aggregated = aggregateMonthlyKpis(kpiData);
        setSelectedEmployeeData(aggregated);
      }

      if (attRes.ok) {
        const attData = await attRes.json();
        setAttendanceData(attData);
      }
    } catch (error) {
      console.error('Error fetching employee data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPerformanceColor = (score) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-blue-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPerformanceBg = (score) => {
    if (score >= 80) return 'bg-green-100';
    if (score >= 60) return 'bg-blue-100';
    if (score >= 40) return 'bg-yellow-100';
    return 'bg-red-100';
  };

  const getAttendanceStats = () => {
    if (!attendanceData || attendanceData.length === 0) return null;

    const present = attendanceData.filter(a => a.status === 'present').length;
    const absent = attendanceData.filter(a => a.status === 'absent').length;
    const late = attendanceData.filter(a => a.status === 'late').length;
    const leave = attendanceData.filter(a => a.status === 'leave').length;
    const total = attendanceData.length;
    const presentRate = ((present / total) * 100).toFixed(1);

    return { present, absent, late, leave, total, presentRate };
  };

  const renderScoreBar = (score, maxScore = 100) => {
    const percentage = (score / maxScore) * 100;
    return (
      <div className="w-full bg-gray-300 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all ${
            score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-blue-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${percentage}%` }}
        ></div>
      </div>
    );
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-800">HR Dashboard</h1>
        <p className="text-gray-600 mt-2">
          {user?.firstName} {user?.lastName} - <span className="font-semibold capitalize">{user?.role}</span>
        </p>
      </div>

      {/* Summary Statistics - Only for HR and Owner */}
      {canViewAllKpi && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-600 text-sm">Avg KPI Score</p>
            <p className={`text-3xl font-bold mt-2 ${getPerformanceColor(stats.avgScore)}`}>{stats.avgScore}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-600 text-sm">Avg Productivity</p>
            <p className={`text-3xl font-bold mt-2 ${getPerformanceColor(stats.avgProductivity)}`}>{stats.avgProductivity}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-600 text-sm">Avg Quality</p>
            <p className={`text-3xl font-bold mt-2 ${getPerformanceColor(stats.avgQuality)}`}>{stats.avgQuality}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-600 text-sm">Avg Teamwork</p>
            <p className={`text-3xl font-bold mt-2 ${getPerformanceColor(stats.avgTeamwork)}`}>{stats.avgTeamwork}</p>
          </div>
          <div className="bg-white rounded-lg shadow-md p-4">
            <p className="text-gray-600 text-sm">Employees with KPI</p>
            <p className="text-3xl font-bold mt-2 text-blue-600">{stats.totalEmployees}</p>
          </div>
        </div>
      )}

      {/* Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {canManage && (
          <Link to="/employees" className="bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
            <div className="text-3xl font-bold mb-2">👥</div>
            <h3 className="text-xl font-semibold">Employees</h3>
            <p className="text-blue-100 text-sm mt-2">Manage employee profiles</p>
          </Link>
        )}

        <Link to="/attendance" className="bg-gradient-to-br from-green-500 to-green-600 text-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
          <div className="text-3xl font-bold mb-2">📋</div>
          <h3 className="text-xl font-semibold">Attendance</h3>
          <p className="text-green-100 text-sm mt-2">Track attendance & leave</p>
        </Link>

        {canViewAllKpi && (
          <Link to="/kpi" className="bg-gradient-to-br from-purple-500 to-purple-600 text-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
            <div className="text-3xl font-bold mb-2">📊</div>
            <h3 className="text-xl font-semibold">KPI Scores</h3>
            <p className="text-purple-100 text-sm mt-2">Evaluate performance</p>
          </Link>
        )}

        {canViewSalary && (
          <Link to="/salary" className="bg-gradient-to-br from-orange-500 to-orange-600 text-white rounded-lg shadow-lg p-6 hover:shadow-xl transition cursor-pointer">
            <div className="text-3xl font-bold mb-2">💰</div>
            <h3 className="text-xl font-semibold">Salary</h3>
            <p className="text-orange-100 text-sm mt-2">Manage salary & payments</p>
          </Link>
        )}
      </div>

      {/* Performance Overview & Individual Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Employee Selection & Individual Performance */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">
            {canViewAllKpi ? 'Employee Performance Analysis' : 'My Performance'}
          </h2>

          {/* Employee Selector - Only for HR and Owner */}
          {canViewAllKpi && (
            <div className="mb-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">Select Employee</label>
              <select
                value={selectedEmployee || ''}
                onChange={(e) => handleEmployeeSelect(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">-- Choose an employee --</option>
                {employees.map(emp => (
                  <option key={emp._id} value={emp._id}>
                    {emp.firstName} {emp.lastName} - {emp.position}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Show own KPI for regular employees */}
          {!canViewAllKpi && allKpis.length > 0 && (
            <div className="space-y-6">
              {allKpis[0] && (
                <div className={`p-4 rounded-lg ${getPerformanceBg(allKpis[0].score)}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Latest KPI Score</h3>
                      <p className="text-sm text-gray-600">{allKpis[0].month} {allKpis[0].year}</p>
                    </div>
                    <div className={`text-4xl font-bold ${getPerformanceColor(allKpis[0].score)}`}>
                      {allKpis[0].score}
                    </div>
                  </div>
                  <div className="space-y-4 mt-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Productivity</span>
                        <span className="font-semibold">{allKpis[0].metrics?.productivity || 0}</span>
                      </div>
                      {renderScoreBar(allKpis[0].metrics?.productivity || 0)}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Quality</span>
                        <span className="font-semibold">{allKpis[0].metrics?.quality || 0}</span>
                      </div>
                      {renderScoreBar(allKpis[0].metrics?.quality || 0)}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Teamwork</span>
                        <span className="font-semibold">{allKpis[0].metrics?.teamwork || 0}</span>
                      </div>
                      {renderScoreBar(allKpis[0].metrics?.teamwork || 0)}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Punctuality</span>
                        <span className="font-semibold">{allKpis[0].metrics?.punctuality || 0}</span>
                      </div>
                      {renderScoreBar(allKpis[0].metrics?.punctuality || 0)}
                    </div>
                  </div>
                  {allKpis[0].comments && (
                    <div className="mt-4 pt-4 border-t border-gray-300">
                      <p className="text-sm text-gray-700"><strong>Comments:</strong> {allKpis[0].comments}</p>
                    </div>
                  )}
                </div>
              )}
              {allKpis.length > 1 && (
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">KPI History</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {allKpis.slice(1).map((kpi, idx) => (
                      <div key={idx} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{kpi.month} {kpi.year}</span>
                          <span className={`font-semibold ${getPerformanceColor(kpi.score)}`}>{kpi.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {!canViewAllKpi && allKpis.length === 0 && (
            <p className="text-gray-600 text-center py-8">No KPI data available for you yet</p>
          )}

          {/* Individual Employee Performance - Only for HR and Owner */}
          {canViewAllKpi && loading && <p className="text-gray-600">Loading...</p>}

          {canViewAllKpi && selectedEmployeeData && selectedEmployeeData.length > 0 && !loading && (
            <div className="space-y-6">
              {/* Latest KPI */}
              {selectedEmployeeData[0] && (
                <div className={`p-4 rounded-lg ${getPerformanceBg(selectedEmployeeData[0].score)}`}>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-800">Latest KPI Score</h3>
                      <p className="text-sm text-gray-600">{selectedEmployeeData[0].month} {selectedEmployeeData[0].year}</p>
                    </div>
                    <div className={`text-4xl font-bold ${getPerformanceColor(selectedEmployeeData[0].score)}`}>
                      {selectedEmployeeData[0].score}
                    </div>
                  </div>

                  {/* Metrics Breakdown */}
                  <div className="space-y-4 mt-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Productivity</span>
                        <span className="font-semibold">{selectedEmployeeData[0].metrics?.productivity || 0}</span>
                      </div>
                      {renderScoreBar(selectedEmployeeData[0].metrics?.productivity || 0)}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Quality</span>
                        <span className="font-semibold">{selectedEmployeeData[0].metrics?.quality || 0}</span>
                      </div>
                      {renderScoreBar(selectedEmployeeData[0].metrics?.quality || 0)}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Teamwork</span>
                        <span className="font-semibold">{selectedEmployeeData[0].metrics?.teamwork || 0}</span>
                      </div>
                      {renderScoreBar(selectedEmployeeData[0].metrics?.teamwork || 0)}
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-semibold">Punctuality</span>
                        <span className="font-semibold">{selectedEmployeeData[0].metrics?.punctuality || 0}</span>
                      </div>
                      {renderScoreBar(selectedEmployeeData[0].metrics?.punctuality || 0)}
                    </div>
                  </div>

                  {selectedEmployeeData[0].comments && (
                    <div className="mt-4 pt-4 border-t border-gray-300">
                      <p className="text-sm text-gray-700"><strong>Comments:</strong> {selectedEmployeeData[0].comments}</p>
                    </div>
                  )}
                </div>
              )}

              {/* KPI History */}
              {selectedEmployeeData.length > 1 && (
                <div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-3">KPI History</h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedEmployeeData.slice(1).map((kpi, idx) => (
                      <div key={idx} className="p-3 border border-gray-200 rounded-lg hover:bg-gray-50">
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{kpi.month} {kpi.year}</span>
                          <span className={`font-semibold ${getPerformanceColor(kpi.score)}`}>{kpi.score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {canViewAllKpi && selectedEmployee && selectedEmployeeData && selectedEmployeeData.length === 0 && !loading && (
            <p className="text-gray-600 text-center py-8">No KPI data available for this employee</p>
          )}

          {canViewAllKpi && !selectedEmployee && (
            <p className="text-gray-600 text-center py-8">Select an employee to view their performance data</p>
          )}
        </div>

        {/* All Employees Performance List - Only for HR and Owner */}
        {canViewAllKpi && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">All Employees</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {employees.map(emp => {
              const empLatestKpi = allKpis.find(k => k?.employeeId?._id === emp._id);
              return (
                <button
                  key={emp._id}
                  onClick={() => handleEmployeeSelect(emp._id)}
                  className={`w-full p-3 rounded-lg text-left transition-all ${
                    selectedEmployee === emp._id
                      ? 'bg-blue-500 text-white shadow-md'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold">{emp.firstName} {emp.lastName}</p>
                      <p className={`text-xs ${selectedEmployee === emp._id ? 'text-blue-100' : 'text-gray-600'}`}>
                        {emp.position}
                      </p>
                    </div>
                    {empLatestKpi && (
                      <span className={`font-bold text-lg ${selectedEmployee === emp._id ? 'text-white' : getPerformanceColor(empLatestKpi.score)}`}>
                        {empLatestKpi.score}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        )}
      </div>

      {/* Attendance Stats for Selected Employee - Only for HR and Owner */}
      {canViewAllKpi && selectedEmployee && attendanceData && attendanceData.length > 0 && (
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Attendance Summary</h2>
          {(() => {
            const stats = getAttendanceStats();
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="p-4 bg-green-100 rounded-lg">
                  <p className="text-gray-700 text-sm">Present</p>
                  <p className="text-2xl font-bold text-green-600">{stats.present}</p>
                </div>
                <div className="p-4 bg-red-100 rounded-lg">
                  <p className="text-gray-700 text-sm">Absent</p>
                  <p className="text-2xl font-bold text-red-600">{stats.absent}</p>
                </div>
                <div className="p-4 bg-yellow-100 rounded-lg">
                  <p className="text-gray-700 text-sm">Late</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.late}</p>
                </div>
                <div className="p-4 bg-blue-100 rounded-lg">
                  <p className="text-gray-700 text-sm">Leave</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.leave}</p>
                </div>
                <div className="p-4 bg-purple-100 rounded-lg">
                  <p className="text-gray-700 text-sm">Present Rate</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.presentRate}%</p>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Leave Summary Section - HR/Owner sees all employees, others see own balance */}
      {canManage && leaveSummary && leaveSummary.summaries && (
        <div className="bg-white rounded-lg shadow-md p-6 mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold text-gray-800">📊 สรุปการลาพนักงาน ปี {currentYear}</h2>
            <div className="text-sm text-gray-500">
              สิทธิ์: พักร้อน {leaveSummary.leaveQuota?.annual || 10} วัน | ป่วย {leaveSummary.leaveQuota?.sick || 30} วัน | กิจ {leaveSummary.leaveQuota?.personal || 5} วัน
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">พนักงาน</th>
                  <th className="px-4 py-3 text-center font-semibold">🏖️ พักร้อน</th>
                  <th className="px-4 py-3 text-center font-semibold">🏥 ลาป่วย</th>
                  <th className="px-4 py-3 text-center font-semibold">📋 ลากิจ</th>
                  <th className="px-4 py-3 text-center font-semibold">รวมใช้ไป</th>
                  <th className="px-4 py-3 text-center font-semibold">% ใช้สิทธิ์</th>
                </tr>
              </thead>
              <tbody>
                {leaveSummary.summaries.map((emp, idx) => (
                  <tr key={emp.employee._id} className={`border-b hover:bg-gray-50 ${idx === 0 && emp.totalUsed > 0 ? 'bg-red-50' : ''}`}>
                    <td className="px-4 py-3 font-medium">
                      {emp.employee.firstName} {emp.employee.lastName}
                      {idx === 0 && emp.totalUsed > 0 && <span className="ml-2 text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">ลาเยอะสุด</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${emp.annual.used > emp.annual.quota * 0.8 ? 'text-red-600' : 'text-blue-600'}`}>
                        {emp.annual.used}
                      </span>
                      <span className="text-gray-400">/{emp.annual.quota}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${emp.sick.used > emp.sick.quota * 0.8 ? 'text-red-600' : 'text-red-500'}`}>
                        {emp.sick.used}
                      </span>
                      <span className="text-gray-400">/{emp.sick.quota}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${emp.personal.used > emp.personal.quota * 0.8 ? 'text-red-600' : 'text-purple-600'}`}>
                        {emp.personal.used}
                      </span>
                      <span className="text-gray-400">/{emp.personal.quota}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">
                      {emp.totalUsed} วัน
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${parseFloat(emp.usagePercent) > 80 ? 'bg-red-500' : parseFloat(emp.usagePercent) > 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(parseFloat(emp.usagePercent), 100)}%` }}
                          ></div>
                        </div>
                        <span className={`font-semibold text-sm ${parseFloat(emp.usagePercent) > 80 ? 'text-red-600' : 'text-gray-600'}`}>
                          {emp.usagePercent}%
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {leaveSummary.summaries.length === 0 && (
            <p className="text-center text-gray-500 py-4">ยังไม่มีข้อมูลการลาในปีนี้</p>
          )}
        </div>
      )}

      {/* My Leave Balance - For regular employees */}
      {!canManage && myLeaveBalance && (
        <div className="bg-white rounded-lg shadow-md p-6 mt-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">📋 สิทธิ์วันลาของฉัน ปี {currentYear}</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-blue-600 font-semibold">ลาพักร้อน</p>
                  <p className="text-3xl font-bold text-blue-800 mt-2">
                    {myLeaveBalance.remaining?.annual ?? 0}
                    <span className="text-lg font-normal text-blue-600">/{myLeaveBalance.annual?.quota ?? 10}</span>
                  </p>
                </div>
                <span className="text-3xl">🏖️</span>
              </div>
              <p className="text-sm text-blue-600 mt-2">ใช้ไป {myLeaveBalance.annual?.used ?? 0} วัน</p>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-red-600 font-semibold">ลาป่วย</p>
                  <p className="text-3xl font-bold text-red-800 mt-2">
                    {myLeaveBalance.remaining?.sick ?? 0}
                    <span className="text-lg font-normal text-red-600">/{myLeaveBalance.sick?.quota ?? 30}</span>
                  </p>
                </div>
                <span className="text-3xl">🏥</span>
              </div>
              <p className="text-sm text-red-600 mt-2">ใช้ไป {myLeaveBalance.sick?.used ?? 0} วัน</p>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-purple-600 font-semibold">ลากิจ</p>
                  <p className="text-3xl font-bold text-purple-800 mt-2">
                    {myLeaveBalance.remaining?.personal ?? 0}
                    <span className="text-lg font-normal text-purple-600">/{myLeaveBalance.personal?.quota ?? 5}</span>
                  </p>
                </div>
                <span className="text-3xl">📋</span>
              </div>
              <p className="text-sm text-purple-600 mt-2">ใช้ไป {myLeaveBalance.personal?.used ?? 0} วัน</p>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md p-6 mt-8">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">System Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start">
            <span className="text-2xl mr-3">✓</span>
            <div>
              <h4 className="font-semibold text-gray-700">Employee Management</h4>
              <p className="text-gray-600 text-sm">Add, edit, and manage employee information</p>
            </div>
          </div>
          <div className="flex items-start">
            <span className="text-2xl mr-3">✓</span>
            <div>
              <h4 className="font-semibold text-gray-700">Leave Management</h4>
              <p className="text-gray-600 text-sm">Request and approve annual, sick, and personal leaves</p>
            </div>
          </div>
          <div className="flex items-start">
            <span className="text-2xl mr-3">✓</span>
            <div>
              <h4 className="font-semibold text-gray-700">KPI Evaluation</h4>
              <p className="text-gray-600 text-sm">Evaluate employee performance with multiple metrics</p>
            </div>
          </div>
          <div className="flex items-start">
            <span className="text-2xl mr-3">✓</span>
            <div>
              <h4 className="font-semibold text-gray-700">Salary Management</h4>
              <p className="text-gray-600 text-sm">Calculate and track salary payments</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
