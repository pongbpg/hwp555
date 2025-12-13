import React, { useState, useEffect } from 'react';
import { salaryAPI, employeeAPI } from '../api';

export default function Salary() {
  const [salaries, setSalaries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    month: '',
    year: new Date().getFullYear(),
    baseSalary: '',
    bonus: 0,
    allowance: 0,
    deductions: 0,
    notes: '',
  });

  const user = JSON.parse(localStorage.getItem('user'));
  const canManage = ['owner', 'admin', 'accountant'].includes(user?.role);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const salaryRes = await salaryAPI.getAll();
      setSalaries(salaryRes.data);
      
      if (canManage) {
        const employeeRes = await employeeAPI.getAll();
        setEmployees(employeeRes.data);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await salaryAPI.create(formData);
      setFormData({
        employeeId: '',
        month: '',
        year: new Date().getFullYear(),
        baseSalary: '',
        bonus: 0,
        allowance: 0,
        deductions: 0,
        notes: '',
      });
      setShowForm(false);
      fetchData();
    } catch (error) {
      console.error('Error creating salary:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await salaryAPI.delete(id);
        fetchData();
      } catch (error) {
        console.error('Error deleting salary:', error);
      }
    }
  };

  const handleStatusChange = async (id, status) => {
    try {
      const salary = salaries.find(s => s._id === id);
      await salaryAPI.update(id, { ...salary, status });
      fetchData();
    } catch (error) {
      console.error('Error updating salary:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">
          {canManage ? 'Salary Management' : 'My Salary'}
        </h1>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add Salary'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="employeeId" className="block text-sm font-medium text-gray-700 mb-1">พนักงาน</label>
              <select
                id="employeeId"
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
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
            <div>
              <label htmlFor="month" className="block text-sm font-medium text-gray-700 mb-1">เดือน</label>
              <select
                id="month"
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
                required
              >
                <option value="">เลือกเดือน</option>
                {['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={i} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="baseSalary" className="block text-sm font-medium text-gray-700 mb-1">เงินเดือนฐาน</label>
              <input
                id="baseSalary"
                type="number"
                placeholder="Base Salary"
                value={formData.baseSalary}
                onChange={(e) => setFormData({ ...formData, baseSalary: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
                required
              />
            </div>
            <div>
              <label htmlFor="bonus" className="block text-sm font-medium text-gray-700 mb-1">โบนัส</label>
              <input
                id="bonus"
                type="number"
                placeholder="Bonus"
                value={formData.bonus}
                onChange={(e) => setFormData({ ...formData, bonus: parseFloat(e.target.value) || 0 })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <div>
              <label htmlFor="allowance" className="block text-sm font-medium text-gray-700 mb-1">เบี้ยเลี้ยง</label>
              <input
                id="allowance"
                type="number"
                placeholder="Allowance"
                value={formData.allowance}
                onChange={(e) => setFormData({ ...formData, allowance: parseFloat(e.target.value) || 0 })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <div>
              <label htmlFor="deductions" className="block text-sm font-medium text-gray-700 mb-1">หักเงิน</label>
              <input
                id="deductions"
                type="number"
                placeholder="Deductions"
                value={formData.deductions}
                onChange={(e) => setFormData({ ...formData, deductions: parseFloat(e.target.value) || 0 })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <div className="col-span-2">
              <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">หมายเหตุ</label>
              <textarea
                id="notes"
                placeholder="Notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2 w-full"
              />
            </div>
            <button
              type="submit"
              className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 col-span-2"
            >
              Save Salary
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 border-b">
            <tr>
              {canManage && <th className="px-6 py-3 text-left font-semibold">Employee</th>}
              <th className="px-6 py-3 text-left font-semibold">Month</th>
              <th className="px-6 py-3 text-right font-semibold">Base</th>
              <th className="px-6 py-3 text-right font-semibold">Bonus</th>
              <th className="px-6 py-3 text-right font-semibold">Allowance</th>
              <th className="px-6 py-3 text-right font-semibold">Deductions</th>
              <th className="px-6 py-3 text-right font-semibold">Net Salary</th>
              <th className="px-6 py-3 text-left font-semibold">Status</th>
              {canManage && <th className="px-6 py-3 text-left font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {salaries.map((salary) => (
              <tr key={salary._id} className="border-b hover:bg-gray-50">
                {canManage && (
                  <td className="px-6 py-4">
                    {salary.employeeId?.firstName} {salary.employeeId?.lastName}
                  </td>
                )}
                <td className="px-6 py-4">{salary.month} {salary.year}</td>
                <td className="px-6 py-4 text-right">${salary.baseSalary.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">${salary.bonus.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">${salary.allowance.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">${salary.deductions.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-semibold">${salary.netSalary.toLocaleString()}</td>
                <td className="px-6 py-4">
                  {canManage ? (
                    <select
                      value={salary.status}
                      onChange={(e) => handleStatusChange(salary._id, e.target.value)}
                      className={`px-2 py-1 rounded text-sm font-semibold ${
                        salary.status === 'paid' ? 'bg-green-100 text-green-800' :
                        salary.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="paid">Paid</option>
                    </select>
                  ) : (
                    <span className={`px-2 py-1 rounded text-sm font-semibold ${
                      salary.status === 'paid' ? 'bg-green-100 text-green-800' :
                      salary.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                      {salary.status}
                    </span>
                  )}
                </td>
                {canManage && (
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleDelete(salary._id)}
                      className="text-red-600 hover:text-red-800 font-semibold"
                    >
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
