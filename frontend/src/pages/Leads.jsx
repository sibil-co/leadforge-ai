import { useState } from 'react'
import { Search, Filter, MessageSquare } from 'lucide-react'
import { mockLeads } from '../data/mockData'

export default function Leads() {
  const [leads] = useState(mockLeads)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)

  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = lead.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.city.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = !statusFilter || lead.status === statusFilter
    const matchesCity = !cityFilter || lead.city === cityFilter
    return matchesSearch && matchesStatus && matchesCity
  })

  const cities = [...new Set(leads.map((l) => l.city))]

  const formatPrice = (price) => {
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
        <p>Manage and view your scraped leads</p>
      </div>

      <div className="search-bar">
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

        <select
          className="form-select"
          value={cityFilter}
          onChange={(e) => setCityFilter(e.target.value)}
          style={{ width: '150px' }}
        >
          <option value="">All Cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>{city}</option>
          ))}
        </select>
      </div>

      <div className="card">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Price</th>
              <th>City</th>
              <th>Source</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLeads.map((lead) => (
              <tr key={lead.id}>
                <td>{lead.name}</td>
                <td>{lead.price ? formatPrice(lead.price) : '-'}</td>
                <td>{lead.city}</td>
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
                    Chat
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {filteredLeads.length === 0 && (
          <div className="empty-state">
            <p>No leads found matching your criteria</p>
          </div>
        )}
      </div>

      {selectedLead && (
        <div className="modal-overlay" onClick={() => setSelectedLead(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Conversation with {selectedLead.name}</h3>
              <button className="modal-close" onClick={() => setSelectedLead(null)}>
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="chat-container">
                <div className="chat-messages">
                  {(selectedLead.conversation_history || []).length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                      No conversation yet. Start outreach to begin.
                    </p>
                  ) : (
                    selectedLead.conversation_history.map((msg, idx) => (
                      <div key={idx} className={`chat-message ${msg.role}`}>
                        {msg.content}
                      </div>
                    ))
                  )}
                </div>
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
