import React, { useState, useEffect } from 'react';
import { employeeAPI } from '../api';

export default function Employees() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    position: '',
    department: '',
    salary: '',
    hireDate: new Date().toISOString().split('T')[0],
    role: 'employee',
    password: 'password123',
  });

  const user = JSON.parse(localStorage.getItem('user'));
  const canManage = ['owner', 'admin', 'hr'].includes(user?.role);

  useEffect(() => {
    fetchEmployees();
  }, []);

  const fetchEmployees = async () => {
    try {
      const response = await employeeAPI.getAll();
      setEmployees(response.data);
    } catch (error) {
      console.error('Error fetching employees:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await employeeAPI.update(editingId, formData);
      } else {
        await employeeAPI.create(formData);
      }
      setFormData({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        position: '',
        department: '',
        salary: '',
        hireDate: new Date().toISOString().split('T')[0],
        role: 'employee',
        password: 'password123',
      });
      setShowForm(false);
      setEditingId(null);
      fetchEmployees();
    } catch (error) {
      console.error('Error saving employee:', error);
      alert(error.response?.data?.error || 'Error saving employee');
    }
  };

  const handleEdit = (employee) => {
    setFormData({
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      phone: employee.phone || '',
      position: employee.position,
      department: employee.department,
      salary: employee.salary,
      hireDate: employee.hireDate?.split('T')[0] || '',
      role: employee.role || 'employee',
    });
    setEditingId(employee._id);
    setShowForm(true);
  };

  const handleCancelEdit = () => {
    setFormData({
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      position: '',
      department: '',
      salary: '',
      hireDate: '',
      role: 'employee',
      password: 'password123',
    });
    setEditingId(null);
    setShowForm(false);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      try {
        await employeeAPI.delete(id);
        fetchEmployees();
      } catch (error) {
        console.error('Error deleting employee:', error);
      }
    }
  };

  if (loading) {
    return <div className="text-center py-8">Loading...</div>;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Employees</h1>
        {canManage && (
          <button
            onClick={() => {
              handleCancelEdit();
              setShowForm(!showForm);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            {showForm ? 'Cancel' : 'Add Employee'}
          </button>
        )}
      </div>

      {showForm && canManage && (
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-xl font-bold mb-4">{editingId ? 'Edit Employee' : 'Add New Employee'}</h2>
          <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="First Name"
              value={formData.firstName}
              onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
            />
            <input
              type="text"
              placeholder="Last Name"
              value={formData.lastName}
              onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
            />
            <input
              type="email"
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
              disabled={editingId}
            />
            <input
              type="text"
              placeholder="Phone"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
            />
            <input
              type="text"
              placeholder="Position"
              value={formData.position}
              onChange={(e) => setFormData({ ...formData, position: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
            />
            <input
              type="text"
              placeholder="Department"
              value={formData.department}
              onChange={(e) => setFormData({ ...formData, department: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
            />
            <input
              type="number"
              placeholder="Salary"
              value={formData.salary}
              onChange={(e) => setFormData({ ...formData, salary: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
            />
            <input
              type="date"
              value={formData.hireDate}
              onChange={(e) => setFormData({ ...formData, hireDate: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
              required
            />
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="border border-gray-300 rounded px-3 py-2"
            >
              <option value="employee">Employee</option>
              <option value="hr">HR</option>
              <option value="accountant">Accountant</option>
              <option value="admin">Admin</option>
              <option value="owner">Owner</option>
            </select>
            {!editingId && (
              <input
                type="password"
                placeholder="Password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="border border-gray-300 rounded px-3 py-2"
              />
            )}
            <button
              type="submit"
              className="bg-green-600 text-white rounded px-4 py-2 hover:bg-green-700 col-span-2"
            >
              {editingId ? 'Update Employee' : 'Save Employee'}
            </button>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-100 border-b">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">Name</th>
              <th className="px-6 py-3 text-left font-semibold">Email</th>
              <th className="px-6 py-3 text-left font-semibold">Position</th>
              <th className="px-6 py-3 text-left font-semibold">Department</th>
              <th className="px-6 py-3 text-left font-semibold">Role</th>
              {canManage && <th className="px-6 py-3 text-left font-semibold">Salary</th>}
              {canManage && <th className="px-6 py-3 text-left font-semibold">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {employees.map((employee) => (
              <tr key={employee._id} className="border-b hover:bg-gray-50">
                <td className="px-6 py-4">{employee.firstName} {employee.lastName}</td>
                <td className="px-6 py-4">{employee.email}</td>
                <td className="px-6 py-4">{employee.position}</td>
                <td className="px-6 py-4">{employee.department}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 rounded text-xs font-semibold ${
                    employee.role === 'owner' ? 'bg-purple-100 text-purple-800' :
                    employee.role === 'admin' ? 'bg-red-100 text-red-800' :
                    employee.role === 'hr' ? 'bg-blue-100 text-blue-800' :
                    employee.role === 'accountant' ? 'bg-green-100 text-green-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {employee.role}
                  </span>
                </td>
                {canManage && <td className="px-6 py-4">${employee.salary.toLocaleString()}</td>}
                {canManage && (
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleEdit(employee)}
                      className="text-blue-600 hover:text-blue-800 font-semibold mr-3"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(employee._id)}
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
