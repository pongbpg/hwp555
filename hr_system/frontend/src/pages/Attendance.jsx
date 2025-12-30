import React, { useState, useEffect } from 'react';
import { attendanceAPI, employeeAPI } from '../api';

export default function Attendance({ user }) {
  const canManageAll = user && ['owner', 'hr'].includes(user.role);
  
  const [leaves, setLeaves] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState('all'); // all, pending, approved, rejected
  const currentYear = new Date().getFullYear();

  const [formData, setFormData] = useState({
    employeeId: canManageAll ? '' : (user?.id || ''),
    date: new Date().toISOString().split('T')[0],
    endDate: '',
    leaveType: 'annual',
    isHalfDay: false,
    halfDayPeriod: 'morning',
    reason: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [leavesRes, balanceRes, employeeRes] = await Promise.all([
        attendanceAPI.getAll({ year: currentYear }),
        attendanceAPI.getBalance(currentYear),
        canManageAll ? employeeAPI.getAll() : Promise.resolve({ data: [] }),
      ]);
      setLeaves(leavesRes.data);
      setBalance(balanceRes.data);
      setEmployees(employeeRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const submitData = {
        ...formData,
        employeeId: canManageAll ? formData.employeeId : user.id,
        endDate: formData.endDate || undefined,
      };
      
      // Remove endDate if it's a half-day leave
      if (formData.isHalfDay) {
        delete submitData.endDate;
      }

      await attendanceAPI.create(submitData);
      setFormData({
        employeeId: canManageAll ? '' : (user?.id || ''),
        date: new Date().toISOString().split('T')[0],
        endDate: '',
        leaveType: 'annual',
        isHalfDay: false,
        halfDayPeriod: 'morning',
        reason: '',
      });
      setShowForm(false);
      fetchData();
    } catch (error) {
      console.error('Error creating leave:', error);
      alert(error.response?.data?.error || 'Error creating leave request');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      await attendanceAPI.updateStatus(id, status);
      fetchData();
    } catch (error) {
      console.error('Error updating status:', error);
      alert(error.response?.data?.error || 'Error updating status');
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('ต้องการลบคำขอลานี้?')) {
      try {
        await attendanceAPI.delete(id);
        fetchData();
      } catch (error) {
        console.error('Error deleting leave:', error);
        alert(error.response?.data?.error || 'Error deleting leave');
      }
    }
  };

  const canModify = (leave) => {
    if (canManageAll) return true;
    return leave.employeeId?._id === user?.id && leave.status === 'pending';
  };

  const getLeaveTypeLabel = (type) => {
    switch (type) {
      case 'annual': return 'พักร้อน';
      case 'sick': return 'ลาป่วย';
      case 'personal': return 'ลากิจ';
      default: return type;
    }
  };

  const getLeaveTypeColor = (type) => {
    switch (type) {
      case 'annual': return 'bg-blue-100 text-blue-800';
      case 'sick': return 'bg-red-100 text-red-800';
      case 'personal': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'pending': return 'รออนุมัติ';
      case 'approved': return 'อนุมัติ';
      case 'rejected': return 'ไม่อนุมัติ';
      default: return status;
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const calculateLeaveDays = (leave) => {
    if (leave.isHalfDay) return 0.5;
    if (!leave.endDate) return 1;
    const start = new Date(leave.date);
    const end = new Date(leave.endDate);
    const diffTime = Math.abs(end - start);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  };

  const filteredLeaves = leaves.filter(leave => {
    if (filter === 'all') return true;
    return leave.status === filter;
  });

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">
            {canManageAll ? 'จัดการการลา' : 'การลาของฉัน'}
          </h1>
          <p className="text-gray-600 mt-1">ปี {currentYear}</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          {showForm ? '✕ ยกเลิก' : '+ ขอลา'}
        </button>
      </div>

      {/* Leave Balance Cards */}
      {balance && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-blue-600 font-semibold">ลาพักร้อน (Annual)</p>
                <p className="text-3xl font-bold text-blue-800 mt-2">
                  {balance.remaining?.annual ?? 0}
                  <span className="text-lg font-normal text-blue-600">/{balance.annual?.quota ?? 10}</span>
                </p>
              </div>
              <span className="text-3xl">🏖️</span>
            </div>
            <p className="text-sm text-blue-600 mt-2">ใช้ไป {balance.annual?.used ?? 0} วัน</p>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-red-600 font-semibold">ลาป่วย (Sick)</p>
                <p className="text-3xl font-bold text-red-800 mt-2">
                  {balance.remaining?.sick ?? 0}
                  <span className="text-lg font-normal text-red-600">/{balance.sick?.quota ?? 30}</span>
                </p>
              </div>
              <span className="text-3xl">🏥</span>
            </div>
            <p className="text-sm text-red-600 mt-2">ใช้ไป {balance.sick?.used ?? 0} วัน</p>
          </div>

          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-purple-600 font-semibold">ลากิจ (Personal)</p>
                <p className="text-3xl font-bold text-purple-800 mt-2">
                  {balance.remaining?.personal ?? 0}
                  <span className="text-lg font-normal text-purple-600">/{balance.personal?.quota ?? 5}</span>
                </p>
              </div>
              <span className="text-3xl">📋</span>
            </div>
            <p className="text-sm text-purple-600 mt-2">ใช้ไป {balance.personal?.used ?? 0} วัน</p>
          </div>
        </div>
      )}

      {/* Leave Request Form */}
      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">ขอลา</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {canManageAll && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">พนักงาน</label>
                  <select
                    value={formData.employeeId}
                    onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500"
                    required
                  >
                    <option value="">เลือกพนักงาน</option>
                    {employees.map((emp) => (
                      <option key={emp._id} value={emp._id}>
                        {emp.firstName} {emp.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทการลา</label>
                <select
                  value={formData.leaveType}
                  onChange={(e) => setFormData({ 
                    ...formData, 
                    leaveType: e.target.value,
                    isHalfDay: e.target.value === 'annual' ? false : formData.isHalfDay 
                  })}
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="annual">🏖️ ลาพักร้อน (Annual)</option>
                  <option value="sick">🏥 ลาป่วย (Sick)</option>
                  <option value="personal">📋 ลากิจ (Personal)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">วันที่เริ่มลา</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500"
                  required
                />
              </div>

              {!formData.isHalfDay && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่สิ้นสุด (ถ้าลาหลายวัน)</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    min={formData.date}
                    className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Half Day Option - Only for Sick and Personal */}
            {['sick', 'personal'].includes(formData.leaveType) && (
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.isHalfDay}
                    onChange={(e) => setFormData({ 
                      ...formData, 
                      isHalfDay: e.target.checked,
                      endDate: e.target.checked ? '' : formData.endDate 
                    })}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700">ลาครึ่งวัน</span>
                </label>

                {formData.isHalfDay && (
                  <select
                    value={formData.halfDayPeriod}
                    onChange={(e) => setFormData({ ...formData, halfDayPeriod: e.target.value })}
                    className="border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="morning">ครึ่งเช้า</option>
                    <option value="afternoon">ครึ่งบ่าย</option>
                  </select>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เหตุผล</label>
              <textarea
                value={formData.reason}
                onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-2 focus:ring-blue-500"
                rows="3"
                placeholder="กรุณาระบุเหตุผลการลา..."
                required
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-green-600 text-white rounded-lg px-4 py-3 hover:bg-green-700 disabled:opacity-50 font-semibold"
            >
              {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอลา'}
            </button>
          </form>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {['all', 'pending', 'approved', 'rejected'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              filter === status 
                ? 'bg-blue-600 text-white' 
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {status === 'all' ? 'ทั้งหมด' : getStatusLabel(status)}
            <span className="ml-2 px-2 py-0.5 bg-white/20 rounded-full text-sm">
              {status === 'all' ? leaves.length : leaves.filter(l => l.status === status).length}
            </span>
          </button>
        ))}
      </div>

      {/* Leave Records Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              {canManageAll && <th className="px-4 py-3 text-left font-semibold">พนักงาน</th>}
              <th className="px-4 py-3 text-left font-semibold">ประเภท</th>
              <th className="px-4 py-3 text-left font-semibold">วันที่</th>
              <th className="px-4 py-3 text-left font-semibold">จำนวนวัน</th>
              <th className="px-4 py-3 text-left font-semibold">เหตุผล</th>
              <th className="px-4 py-3 text-left font-semibold">สถานะ</th>
              <th className="px-4 py-3 text-left font-semibold">การจัดการ</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeaves.length === 0 ? (
              <tr>
                <td colSpan={canManageAll ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                  ไม่มีข้อมูลการลา
                </td>
              </tr>
            ) : (
              filteredLeaves.map((leave) => (
                <tr key={leave._id} className="border-b hover:bg-gray-50">
                  {canManageAll && (
                    <td className="px-4 py-3">
                      {leave.employeeId?.firstName} {leave.employeeId?.lastName}
                    </td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getLeaveTypeColor(leave.leaveType)}`}>
                      {getLeaveTypeLabel(leave.leaveType)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      {new Date(leave.date).toLocaleDateString('th-TH')}
                      {leave.endDate && leave.endDate !== leave.date && (
                        <span className="text-gray-500"> - {new Date(leave.endDate).toLocaleDateString('th-TH')}</span>
                      )}
                      {leave.isHalfDay && (
                        <span className="text-xs text-gray-500 ml-1">
                          ({leave.halfDayPeriod === 'morning' ? 'ครึ่งเช้า' : 'ครึ่งบ่าย'})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-semibold">
                    {calculateLeaveDays(leave)} วัน
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate" title={leave.reason}>
                    {leave.reason}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(leave.status)}`}>
                      {getStatusLabel(leave.status)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {canManageAll && leave.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleStatusChange(leave._id, 'approved')}
                            className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold hover:bg-green-200"
                          >
                            อนุมัติ
                          </button>
                          <button
                            onClick={() => handleStatusChange(leave._id, 'rejected')}
                            className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold hover:bg-red-200"
                          >
                            ไม่อนุมัติ
                          </button>
                        </>
                      )}
                      {canModify(leave) && (
                        <button
                          onClick={() => handleDelete(leave._id)}
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-semibold hover:bg-gray-200"
                        >
                          ลบ
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
