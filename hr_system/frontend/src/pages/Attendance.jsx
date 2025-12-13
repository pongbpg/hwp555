import React, { useState, useEffect } from 'react';
import { attendanceAPI, employeeAPI } from '../api';

export default function Attendance() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    date: '',
    status: 'present',
    checkInTime: '',
    checkOutTime: '',
    leaveType: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [attendanceRes, employeeRes] = await Promise.all([
        attendanceAPI.getAll(),
        employeeAPI.getAll(),
      ]);
      setRecords(attendanceRes.data);
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
      await attendanceAPI.create(formData);
      setFormData({
        employeeId: '',
        date: '',
        status: 'present',
        checkInTime: '',
        checkOutTime: '',
        leaveType: '',
      });
      setShowForm(false);
      fetchData();
    } catch (error) {
      console.error('Error creating record:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await attendanceAPI.delete(id);
        fetchData();
      } catch (error) {
        console.error('Error deleting record:', error);
      }
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'present': return 'มีอยู่';
      case 'absent': return 'ขาด';
      case 'late': return 'สาย';
      case 'leave': return 'ลา';
      default: return status;
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Attendance</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add Record'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เลือกพนักงาน</label>
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
                required
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">สถานะ</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              >
                <option value="present">มีอยู่</option>
                <option value="absent">ขาด</option>
                <option value="late">สาย</option>
                <option value="leave">ลา</option>
              </select>
            </div>
            {formData.status === 'leave' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ประเภทการลา</label>
                <select
                  value={formData.leaveType}
                  onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
                  className="border border-gray-300 rounded px-3 py-2 w-full"
                  required={formData.status === 'leave'}
                >
                  <option value="">Select Leave Type</option>
                  <option value="annual">Annual</option>
                  <option value="sick">Sick</option>
                  <option value="personal">Personal</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเช็คอิน</label>
              <input
                type="time"
                placeholder="Check In"
                value={formData.checkInTime}
                onChange={(e) => setFormData({ ...formData, checkInTime: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">เวลาเช็คเอาท์</label>
              <input
                type="time"
                placeholder="Check Out"
                value={formData.checkOutTime}
                onChange={(e) => setFormData({ ...formData, checkOutTime: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 col-span-2 disabled:opacity-50"
            >
              {submitting ? 'กำลังบันทึก...' : 'Save Record'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">Employee</th>
              <th className="px-6 py-3 text-left font-semibold">Date</th>
              <th className="px-6 py-3 text-left font-semibold">Status</th>
              <th className="px-6 py-3 text-left font-semibold">Check In</th>
              <th className="px-6 py-3 text-left font-semibold">Check Out</th>
              <th className="px-6 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={record._id} className="border-b hover:bg-gray-50">
                <td className="px-6 py-4">
                  {record.employeeId?.firstName} {record.employeeId?.lastName}
                </td>
                <td className="px-6 py-4">{new Date(record.date).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                    record.status === 'present' ? 'bg-green-100 text-green-800' :
                    record.status === 'absent' ? 'bg-red-100 text-red-800' :
                    record.status === 'late' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {getStatusLabel(record.status)}
                  </span>
                </td>
                <td className="px-6 py-4">{record.checkInTime || '-'}</td>
                <td className="px-6 py-4">{record.checkOutTime || '-'}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleDelete(record._id)}
                    className="text-red-600 hover:text-red-800 font-semibold"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
