const API_BASE = import.meta.env.VITE_API_URL || '';

export const api = {
  auth: {
    register: (data) => fetch(`${API_BASE}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    }).then(res => res.json()),
    
    login: (email, password) => fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }).then(res => res.json())
  },
  
  leads: {
    getAll: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return fetch(`${API_BASE}/api/leads${query ? '?' + query : ''}`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      }).then(res => res.json());
    },
    
    update: (id, data) => fetch(`${API_BASE}/api/leads/${id}`, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify(data)
    }).then(res => res.json())
  },
  
  scrape: {
    trigger: (data) => fetch(`${API_BASE}/api/scrape/trigger`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify(data)
    }).then(res => res.json())
  },
  
  outreach: {
    start: (id) => fetch(`${API_BASE}/api/outreach/start/${id}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    }).then(res => res.json()),
    
    sendMessage: (id, message) => fetch(`${API_BASE}/api/outreach/message/${id}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify({ message })
    }).then(res => res.json()),
    
    intervene: (id, data) => fetch(`${API_BASE}/api/outreach/intervene/${id}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}` 
      },
      body: JSON.stringify(data)
    }).then(res => res.json())
  }
};
