import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor for consistent error shape
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const message = error.response?.data?.error?.message || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

// ─── Jobs ─────────────────────────────────────────────────────
export const jobsApi = {
  create: (data) => api.post('/jobs', data),
  list: () => api.get('/jobs'),
  get: (id) => api.get(`/jobs/${id}`),
  apply: (jobId, data) => api.post(`/jobs/${jobId}/apply`, data),
  updateCapacity: (id, active_capacity) => api.patch(`/jobs/${id}/capacity`, { active_capacity }),
  updateStatus: (id, status) => api.patch(`/jobs/${id}/status`, { status }),
};

// ─── Applications ─────────────────────────────────────────────
export const applicationsApi = {
  get: (id) => api.get(`/applications/${id}`),
  acknowledge: (id) => api.post(`/applications/${id}/acknowledge`),
  exit: (id, reason) => api.patch(`/applications/${id}/exit`, { reason }),
  getEvents: (id) => api.get(`/applications/${id}/events`),
};

// ─── Pipeline ─────────────────────────────────────────────────
export const pipelineApi = {
  snapshot: (jobId) => api.get(`/pipeline/${jobId}`),
  events: (jobId, params = {}) => api.get(`/pipeline/${jobId}/events`, { params }),
};

// ─── Admin ────────────────────────────────────────────────────
export const adminApi = {
  stats: () => api.get('/admin/stats'),
  triggerDecay: () => api.post('/admin/trigger-decay'),
};
