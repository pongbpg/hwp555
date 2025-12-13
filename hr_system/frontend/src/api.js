import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
};

export const employeeAPI = {
  getAll: () => api.get('/employees'),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  delete: (id) => api.delete(`/employees/${id}`),
};

export const attendanceAPI = {
  getAll: (params) => api.get('/attendance', { params }),
  getByEmployee: (id) => api.get(`/attendance/employee/${id}`),
  create: (data) => api.post('/attendance', data),
  update: (id, data) => api.put(`/attendance/${id}`, data),
  delete: (id) => api.delete(`/attendance/${id}`),
};

export const kpiAPI = {
  getAll: (params) => api.get('/kpi', { params }),
  getByEmployee: (id) => api.get(`/kpi/employee/${id}`),
  create: (data) => api.post('/kpi', data),
  update: (id, data) => api.put(`/kpi/${id}`, data),
  delete: (id) => api.delete(`/kpi/${id}`),
};

export const salaryAPI = {
  getAll: (params) => api.get('/salary', { params }),
  getByEmployee: (id) => api.get(`/salary/employee/${id}`),
  create: (data) => api.post('/salary', data),
  update: (id, data) => api.put(`/salary/${id}`, data),
  delete: (id) => api.delete(`/salary/${id}`),
};

export default api;
