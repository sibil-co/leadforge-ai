const API_BASE = '';

const getToken = () => localStorage.getItem('token');

const headers = () => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${getToken()}`
});

export const api = {
  auth: {
    login: (email, password) => 
      fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      }).then(res => res.json()),
    
    register: (data) => 
      fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      }).then(res => res.json())
  },
  
  leads: {
    getAll: (params = {}) => {
      const query = new URLSearchParams(params).toString();
      return fetch(`${API_BASE}/api/leads${query ? '?' + query : ''}`, {
        headers: headers()
      }).then(res => res.json());
    },
    
    getStats: () => 
      fetch(`${API_BASE}/api/leads?stats=true`, {
        headers: headers()
      }).then(res => res.json()),
    
    update: (id, data) => 
      fetch(`${API_BASE}/api/leads/${id}`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify(data)
      }).then(res => res.json()),
      
    filter: () =>
      fetch(`${API_BASE}/api/leads/filter`, {
        method: 'POST',
        headers: headers()
      }).then(res => res.json())
  },
  
  scrape: {
    trigger: async (data) => {
      const res = await fetch(`${API_BASE}/api/scrape`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(data)
      });
      const json = await res.json();
      if (!res.ok) {
        // Properly extract error message from various formats
        let errorMsg;
        if (typeof json.error === 'string') {
          errorMsg = json.error;
        } else if (typeof json.error === 'object' && json.error !== null) {
          errorMsg = json.error.message || json.error.error || JSON.stringify(json.error);
        } else {
          errorMsg = 'Failed to trigger scraper';
        }
        console.error('Scrape error response:', json);
        throw new Error(errorMsg);
      }
      return json;
    },
    
    getJobs: () => 
      fetch(`${API_BASE}/api/scrape`, {
        headers: headers()
      }).then(res => res.json()),
    
    cancel: (id) => 
      fetch(`${API_BASE}/api/scrape?action=cancel&id=${id}`, {
        method: 'POST',
        headers: headers()
      }).then(res => res.json())
  },
  
  outreach: {
    start: (id) => 
      fetch(`${API_BASE}/api/outreach/start/${id}`, {
        method: 'POST',
        headers: headers()
      }).then(res => res.json()),
    
    sendMessage: (id, message) => 
      fetch(`${API_BASE}/api/outreach/message/${id}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ message })
      }).then(res => res.json()),
    
    getConversation: (id) => 
      fetch(`${API_BASE}/api/outreach/conversation/${id}`, {
        headers: headers()
      }).then(res => res.json()),
    
    intervene: (id, data) => 
      fetch(`${API_BASE}/api/outreach/intervene/${id}`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify(data)
      }).then(res => res.json())
  }
};
