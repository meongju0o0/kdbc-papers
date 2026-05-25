const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:4000/api`;

function getAuthToken() {
  return localStorage.getItem('auth_token');
}

async function request(path, options = {}) {
  const token = getAuthToken();
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(options.headers || {}),
  };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const errorPayload = await response.json();
      message = errorPayload?.message || message;
    } catch {
      // ignore json parse error
    }

    throw new Error(message);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export const api = {
  login: ({ username, password }) => request('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  }),
  me: () => request('/auth/me'),
  getPapers: ({ volume, no, includePdf, page, pageSize, keyword } = {}) => {
    const params = new URLSearchParams();
    if (volume) {
      params.set('volume', volume);
    }
    if (no) {
      params.set('no', no);
    }
    if (includePdf === false) {
      params.set('includePdf', 'false');
    }
    if (page) {
      params.set('page', String(page));
    }
    if (pageSize) {
      params.set('pageSize', String(pageSize));
    }
    if (keyword && keyword.trim()) {
      params.set('keyword', keyword.trim());
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    return request(`/papers${query}`);
  },
  createPaper: (payload) => request('/papers', {
    method: 'POST',
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  }),
  updatePaper: (id, payload) => request(`/papers/${id}`, {
    method: 'PUT',
    body: payload instanceof FormData ? payload : JSON.stringify(payload),
  }),
  deletePaper: (id) => request(`/papers/${id}`, {
    method: 'DELETE',
  }),
  getPaperIssues: () => request('/papers/issues'),
  getPaper: (id) => request(`/papers/${id}`),
  getIssues: () => request('/issues'),
  createIssue: (payload) => request('/issues', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  updateIssue: (id, payload) => request(`/issues/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }),
  deleteIssue: (id) => request(`/issues/${id}`, {
    method: 'DELETE',
  }),
};
