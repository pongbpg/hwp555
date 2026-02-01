import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_HR_API_BASE_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
});

// Function to set auth token
export const setAuthToken = (token) => {
  if (token) {
    api.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete api.defaults.headers.common.Authorization;
  }
};

// Add token to requests (fallback for manual token setting)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 Unauthorized responses (token expired or invalid)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid - clear storage and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

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
  getSummary: (year) => api.get('/attendance/summary', { params: { year } }),
  getBalance: (year) => api.get('/attendance/balance', { params: { year } }),
  create: (data) => api.post('/attendance', data),
  update: (id, data) => api.put(`/attendance/${id}`, data),
  updateStatus: (id, status) => api.put(`/attendance/${id}/status`, { status }),
  delete: (id) => api.delete(`/attendance/${id}`),
};

export const kpiAPI = {
  getAll: (params) => api.get('/kpi', { params }),
  getByEmployee: (id) => api.get(`/kpi/employee/${id}`),
  getMy: () => api.get('/kpi/my'),
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
