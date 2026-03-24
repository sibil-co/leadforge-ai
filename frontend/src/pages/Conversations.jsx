import { useState } from 'react'
import { MessageSquare, Send, User, ArrowLeft } from 'lucide-react'
import { mockLeads } from '../data/mockData'

export default function Conversations() {
  const [selectedLead, setSelectedLead] = useState(null)
  const [message, setMessage] = useState('')
  const [mobileView, setMobileView] = useState('list') // 'list' | 'chat'

  const engagingLeads = mockLeads.filter((l) => l.status === 'engaging' || l.status === 'secured')

  const handleSendMessage = () => {
    if (!message.trim() || !selectedLead) return
    alert(`Message sent to ${selectedLead.name}: "${message}"\n\n(Mock - Connect Meta API to send real messages)`)
    setMessage('')
  }

  const handleSelectLead = (lead) => {
    setSelectedLead(lead)
    setMobileView('chat')
  }

  return (
    <div>
      <div className="page-header">
        <h2>Conversations</h2>
        <p>Monitor and manage AI-led conversations with leads</p>
      </div>

      {/* Mobile tabs — hidden on tablet+ via CSS */}
      <div className="conversations-mobile-tabs">
        <button
          className={`conversations-mobile-tab ${mobileView === 'list' ? 'active' : ''}`}
          onClick={() => setMobileView('list')}
        >
          Contacts
        </button>
        <button
          className={`conversations-mobile-tab ${mobileView === 'chat' ? 'active' : ''}`}
          onClick={() => setMobileView('chat')}
        >
          {selectedLead ? selectedLead.name : 'Chat'}
        </button>
      </div>

      <div className="conversations-layout">

        {/* ── Contacts panel ─────────────────────────────────────────────── */}
        <div
          className="card"
          style={{
            overflow: 'hidden',
            display: mobileView === 'list' ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
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
                  onClick={() => handleSelectLead(lead)}
                  style={{
                    padding: '0.875rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedLead?.id === lead.id ? 'var(--bg-tertiary)' : 'transparent',
                    transition: 'background 0.1s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{
                      width: '36px', height: '36px', borderRadius: '50%',
                      background: 'var(--primary)', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      color: 'white', flexShrink: 0,
                    }}>
                      <User size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: '0.9rem' }}>{lead.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {lead.city} · {lead.conversation_history?.length || 0} messages
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ── Chat panel ─────────────────────────────────────────────────── */}
        <div
          className="card"
          style={{
            display: mobileView === 'chat' ? 'flex' : 'none',
            flexDirection: 'column',
          }}
        >
          {selectedLead ? (
            <>
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', minWidth: 0 }}>
                  <button
                    onClick={() => setMobileView('list')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', flexShrink: 0 }}
                  >
                    <ArrowLeft size={18} />
                  </button>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '50%',
                    background: 'var(--primary)', display: 'flex',
                    alignItems: 'center', justifyContent: 'center', color: 'white', flexShrink: 0,
                  }}>
                    <User size={20} />
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedLead.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      {selectedLead.city}
                    </div>
                  </div>
                </div>
                <span className={`status-badge ${selectedLead.status}`}>{selectedLead.status}</span>
              </div>

              <div className="chat-container" style={{ flex: 1, padding: '1.25rem', overflow: 'auto' }}>
                <div className="chat-messages" style={{ height: '100%' }}>
                  {(selectedLead.conversation_history || []).length === 0 ? (
                    <div className="empty-state">
                      <MessageSquare size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                      <p>No conversation yet</p>
                      <button className="btn btn-primary mt-4">Start AI Outreach</button>
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

              <div style={{ padding: '0.875rem 1.25rem', borderTop: '1px solid var(--border)' }}>
                <div className="chat-input-container">
                  <input
                    type="text"
                    className="form-input chat-input"
                    placeholder="Type a message..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  />
                  <button className="btn btn-primary" onClick={handleSendMessage}>
                    <Send size={18} />
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
