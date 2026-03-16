import { useState, useEffect } from 'react'
import { Search, MessageSquare } from 'lucide-react'
import { api } from '../services/api'

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    loadLeads()
  }, [statusFilter, cityFilter])

  const loadLeads = async () => {
    try {
      setLoading(true)
      const params = { limit: 100 }
      if (statusFilter) params.status = statusFilter
      if (cityFilter) params.city = cityFilter
      if (searchTerm) params.search = searchTerm
      
      const data = await api.leads.getAll(params)
      setLeads(data.leads || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    loadLeads()
  }

  const formatPrice = (price) => {
    if (!price) return '-'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(price)
  }

  return (
    <div>
      <div className="page-header">
        <h2>Leads</h2>
        <p>{total} total leads found</p>
      </div>

      <form onSubmit={handleSearch} className="search-bar">
        <div style={{ position: 'relative', flex: 1, maxWidth: '300px' }}>
          <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search leads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ paddingLeft: '40px' }}
          />
        </div>

        <select
          className="form-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ width: '150px' }}
        >
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="engaging">Engaging</option>
          <option value="secured">Secured</option>
          <option value="dead">Dead</option>
        </select>

        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      <div className="card">
        {loading ? (
          <div className="card-body">Loading leads...</div>
        ) : leads.length === 0 ? (
          <div className="empty-state">
            <p>No leads found. Go to Scrape to find leads!</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Area</th>
                <th>City</th>
                <th>Contact</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => {
                const metadata = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata) : lead.metadata;
                const contacts = metadata?.contacts || {};
                const displayPhone = lead.phone || contacts.phones?.[0] || '-';
                
                return (
                  <tr key={lead.id}>
                    <td>
                      <div style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={lead.name}>
                        {lead.name}
                      </div>
                    </td>
                    <td>{formatPrice(lead.price)}</td>
                    <td>{lead.area ? `${lead.area} m²` : '-'}</td>
                    <td>{lead.city || '-'}</td>
                    <td>
                      <div style={{ fontSize: '0.75rem' }}>
                        {displayPhone !== '-' && <div>{displayPhone}</div>}
                        {contacts.lineId && <div style={{ color: 'var(--primary)' }}>LINE: {contacts.lineId}</div>}
                      </div>
                    </td>
                    <td style={{ textTransform: 'capitalize' }}>{lead.source_type}</td>
                    <td>
                      <span className={`status-badge ${lead.status}`}>
                        {lead.status}
                      </span>
                    </td>
                    <td>
                      <button
                        className="btn btn-secondary"
                        onClick={() => setSelectedLead(lead)}
                        style={{ padding: '0.375rem 0.75rem' }}
                      >
                        <MessageSquare size={16} />
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedLead && (
        <div className="modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Lead Details</h3>
              <button className="modal-close" onClick={() => setSelectedLead(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Name</label>
                  <div style={{ fontWeight: '600' }}>{selectedLead.name}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>City</label>
                  <div>{selectedLead.city || '-'}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Price</label>
                  <div style={{ fontWeight: '600', color: 'var(--success)' }}>{formatPrice(selectedLead.price)}</div>
                </div>
                <div>
                  <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Area</label>
                  <div>{selectedLead.area ? `${selectedLead.area} m²` : '-'}</div>
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Contact</label>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {selectedLead.phone && <span>📞 {selectedLead.phone}</span>}
                  {selectedLead.email && <span>📧 {selectedLead.email}</span>}
                </div>
              </div>
              
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Post Text</label>
                <div style={{ 
                  background: 'var(--bg-secondary)', 
                  padding: '0.75rem', 
                  borderRadius: '6px',
                  maxHeight: '200px',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  fontSize: '0.875rem'
                }}>
                  {selectedLead.comment_text || 'No description'}
                </div>
              </div>
              
              <div>
                <label style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Source URL</label>
                <a 
                  href={selectedLead.source_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{ fontSize: '0.75rem', wordBreak: 'break-all' }}
                >
                  {selectedLead.source_url}
                </a>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedLead(null)}>
                Close
              </button>
              {selectedLead.status === 'new' && (
                <button className="btn btn-primary">
                  Start Outreach
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
