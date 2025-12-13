import React, { useState, useEffect } from 'react';
import { kpiAPI, employeeAPI } from '../api';

export default function KPI() {
  const [kpis, setKpis] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    employeeId: '',
    month: '',
    year: new Date().getFullYear(),
    metrics: {
      productivity: 0,
      quality: 0,
      teamwork: 0,
      punctuality: 0,
    },
    comments: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [kpiRes, employeeRes] = await Promise.all([
        kpiAPI.getAll(),
        employeeAPI.getAll(),
      ]);
      setKpis(kpiRes.data);
      setEmployees(employeeRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await kpiAPI.create(formData);
      setFormData({
        employeeId: '',
        month: '',
        year: new Date().getFullYear(),
        metrics: {
          productivity: 0,
          quality: 0,
          teamwork: 0,
          punctuality: 0,
        },
        comments: '',
      });
      setShowForm(false);
      fetchData();
    } catch (error) {
      console.error('Error creating KPI:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await kpiAPI.delete(id);
        fetchData();
      } catch (error) {
        console.error('Error deleting KPI:', error);
      }
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">KPI Scores</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          {showForm ? 'Cancel' : 'Add KPI'}
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <select
                value={formData.employeeId}
                onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2"
                required
              >
                <option value="">Select Employee</option>
                {employees.map((emp) => (
                  <option key={emp._id} value={emp._id}>
                    {emp.firstName} {emp.lastName}
                  </option>
                ))}
              </select>
              <select
                value={formData.month}
                onChange={(e) => setFormData({ ...formData, month: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2"
                required
              >
                <option value="">Select Month</option>
                {['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December'].map((m, i) => (
                  <option key={i} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold mb-1">Productivity (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.metrics.productivity}
                  onChange={(e) => setFormData({
                    ...formData,
                    metrics: { ...formData.metrics, productivity: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Quality (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.metrics.quality}
                  onChange={(e) => setFormData({
                    ...formData,
                    metrics: { ...formData.metrics, quality: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Teamwork (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.metrics.teamwork}
                  onChange={(e) => setFormData({
                    ...formData,
                    metrics: { ...formData.metrics, teamwork: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1">Punctuality (0-100)</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={formData.metrics.punctuality}
                  onChange={(e) => setFormData({
                    ...formData,
                    metrics: { ...formData.metrics, punctuality: parseInt(e.target.value) || 0 }
                  })}
                  className="w-full border border-gray-300 rounded px-3 py-2"
                />
              </div>
            </div>

            <textarea
              placeholder="Comments"
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              className="w-full border border-gray-300 rounded px-3 py-2"
              rows="3"
            />

            <button
              type="submit"
              className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 w-full"
            >
              Save KPI
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">Employee</th>
              <th className="px-6 py-3 text-left font-semibold">Month</th>
              <th className="px-6 py-3 text-left font-semibold">Score</th>
              <th className="px-6 py-3 text-left font-semibold">Productivity</th>
              <th className="px-6 py-3 text-left font-semibold">Quality</th>
              <th className="px-6 py-3 text-left font-semibold">Teamwork</th>
              <th className="px-6 py-3 text-left font-semibold">Punctuality</th>
              <th className="px-6 py-3 text-left font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {kpis.map((kpi) => (
              <tr key={kpi._id} className="border-b hover:bg-gray-50">
                <td className="px-6 py-4">
                  {kpi.employeeId?.firstName} {kpi.employeeId?.lastName}
                </td>
                <td className="px-6 py-4">{kpi.month} {kpi.year}</td>
                <td className="px-6 py-4 font-semibold">{kpi.score.toFixed(1)}</td>
                <td className="px-6 py-4">{kpi.metrics.productivity}</td>
                <td className="px-6 py-4">{kpi.metrics.quality}</td>
                <td className="px-6 py-4">{kpi.metrics.teamwork}</td>
                <td className="px-6 py-4">{kpi.metrics.punctuality}</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => handleDelete(kpi._id)}
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
