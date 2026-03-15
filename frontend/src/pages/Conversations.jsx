import { useState } from 'react'
import { MessageSquare, Send, User } from 'lucide-react'
import { mockLeads } from '../data/mockData'

export default function Conversations() {
  const [selectedLead, setSelectedLead] = useState(null)
  const [message, setMessage] = useState('')

  const engagingLeads = mockLeads.filter((l) => l.status === 'engaging' || l.status === 'secured')

  const handleSendMessage = () => {
    if (!message.trim() || !selectedLead) return
    alert(`Message sent to ${selectedLead.name}: "${message}"\n\n(Mock - Connect Meta API to send real messages)`)
    setMessage('')
  }

  return (
    <div>
      <div className="page-header">
        <h2>Conversations</h2>
        <p>Monitor and manage AI-led conversations with leads</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1.5rem', height: 'calc(100vh - 200px)' }}>
        <div className="card" style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <h3 className="card-title">Active Chats</h3>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            {engagingLeads.length === 0 ? (
              <div className="empty-state">
                <p>No active conversations</p>
              </div>
            ) : (
              engagingLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => setSelectedLead(lead)}
                  style={{
                    padding: '1rem 1.5rem',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedLead?.id === lead.id ? 'var(--bg-tertiary)' : 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '50%',
                      background: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white'
                    }}>
                      <User size={18} />
                    </div>
                    <div>
                      <div style={{ fontWeight: 500 }}>{lead.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        {lead.city} · {lead.conversation_history?.length || 0} messages
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
          {selectedLead ? (
            <>
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '50%',
                    background: 'var(--primary)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white'
                  }}>
                    <User size={20} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{selectedLead.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {selectedLead.city} · {selectedLead.price ? `$${selectedLead.price.toLocaleString()}` : 'Price negotiable'}
                    </div>
                  </div>
                </div>
                <span className={`status-badge ${selectedLead.status}`}>
                  {selectedLead.status}
                </span>
              </div>

              <div className="chat-container" style={{ flex: 1, padding: '1.5rem', overflow: 'auto' }}>
                <div className="chat-messages" style={{ height: '100%' }}>
                  {(selectedLead.conversation_history || []).length === 0 ? (
                    <div className="empty-state">
                      <MessageSquare size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                      <p>No conversation yet</p>
                      <button className="btn btn-primary mt-4">
                        Start AI Outreach
                      </button>
                    </div>
                  ) : (
                    selectedLead.conversation_history.map((msg, idx) => (
                      <div key={idx} className={`chat-message ${msg.role}`}>
                        <div style={{ fontSize: '0.75rem', opacity: 0.7, marginBottom: '0.25rem' }}>
                          {msg.role === 'user' ? 'Lead' : msg.role === 'manual' ? 'Manual' : 'AI Assistant'}
                        </div>
                        {msg.content}
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="modal-footer" style={{ borderTop: '1px solid var(--border)', borderBottom: 'none' }}>
                <div className="chat-input-container" style={{ flex: 1 }}>
                  <input
                    type="text"
                    className="form-input chat-input"
                    placeholder="Type a message or manually intervene..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button className="btn btn-primary" onClick={handleSendMessage}>
                    <Send size={18} />
                    Send
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div>
                <MessageSquare size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
                <p>Select a conversation to view</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
