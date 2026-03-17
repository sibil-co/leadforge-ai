import { useState, useEffect, useCallback } from 'react'
import { Search, ChevronLeft, ChevronRight, ExternalLink, MapPin, Home } from 'lucide-react'
import { api } from '../services/api'

const STATUS_COLORS = {
  new: { bg: '#dbeafe', color: '#1d4ed8' },
  engaging: { bg: '#fef9c3', color: '#a16207' },
  secured: { bg: '#dcfce7', color: '#15803d' },
  dead: { bg: '#fee2e2', color: '#dc2626' },
}

function timeAgo(isoString) {
  if (!isoString) return null
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 30) return `${days}d ago`
  return new Date(isoString).toLocaleDateString()
}

const THAI_KEYWORDS = ['bangkok', 'chiang mai', 'phuket', 'pattaya', 'hua hin', 'koh samui', 'thailand', 'thai', 'chiang rai', 'krabi', 'samui', 'koh']

function getCurrency(lead, meta) {
  const loc = ((meta?.ai_detected_location || '') + ' ' + (lead.city || '')).toLowerCase()
  if (THAI_KEYWORDS.some(kw => loc.includes(kw))) return 'THB'
  return 'USD'
}

function formatPrice(price, currency = 'USD') {
  if (!price) return null
  if (currency === 'THB') {
    return '฿' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(price)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(price)
}

// Image gallery with prev/next and thumbnail strip
function ImageGallery({ images }) {
  const [activeIdx, setActiveIdx] = useState(0)
  if (!images || images.length === 0) return null

  const prev = () => setActiveIdx(i => (i - 1 + images.length) % images.length)
  const next = () => setActiveIdx(i => (i + 1) % images.length)

  return (
    <div style={{ marginBottom: '1.25rem' }}>
      {/* Main image */}
      <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
        <img
          src={images[activeIdx]}
          alt={`Photo ${activeIdx + 1}`}
          style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block' }}
          onError={e => { e.target.style.display = 'none' }}
        />
        {images.length > 1 && (
          <>
            <button onClick={prev} style={navBtnStyle('left')}>
              <ChevronLeft size={20} />
            </button>
            <button onClick={next} style={navBtnStyle('right')}>
              <ChevronRight size={20} />
            </button>
            <div style={{
              position: 'absolute', bottom: 8, right: 10,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              fontSize: '0.75rem', borderRadius: 12, padding: '2px 8px'
            }}>
              {activeIdx + 1} / {images.length}
            </div>
          </>
        )}
      </div>
      {/* Thumbnail strip */}
      {images.length > 1 && (
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 2 }}>
          {images.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`thumb ${i + 1}`}
              onClick={() => setActiveIdx(i)}
              style={{
                width: 52, height: 40, objectFit: 'cover', borderRadius: 4,
                cursor: 'pointer', flexShrink: 0,
                outline: i === activeIdx ? '2px solid var(--primary)' : '2px solid transparent',
                opacity: i === activeIdx ? 1 : 0.65
              }}
              onError={e => { e.target.style.display = 'none' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function navBtnStyle(side) {
  return {
    position: 'absolute', top: '50%', [side]: 8,
    transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.45)', border: 'none', borderRadius: '50%',
    width: 32, height: 32, cursor: 'pointer', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center'
  }
}

// Single lead card
function LeadCard({ lead, onClick }) {
  const meta = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : (lead.metadata || {})
  const imageUrls = meta.image_urls || meta.images?.map(img => img.image_file_uri || img.url).filter(Boolean) || []
  const thumb = imageUrls[0]
  const imgCount = imageUrls.length
  const postedAt = meta.posted_at || lead.created_at
  const statusStyle = STATUS_COLORS[lead.status] || STATUS_COLORS.new
  const phone = meta.phone || meta.contacts?.phones?.[0] || ''

  return (
    <div
      onClick={() => onClick(lead)}
      style={{
        background: 'var(--bg-card, white)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s, transform 0.15s',
        display: 'flex',
        flexDirection: 'column'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.12)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.transform = 'none'
      }}
    >
      {/* Photo / placeholder */}
      <div style={{ position: 'relative', height: 180, background: '#f3f4f6', flexShrink: 0 }}>
        {thumb ? (
          <img
            src={thumb}
            alt="listing"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            onError={e => {
              e.target.style.display = 'none'
              e.target.nextSibling.style.display = 'flex'
            }}
          />
        ) : null}
        {/* Placeholder shown when no image or image fails */}
        <div style={{
          display: thumb ? 'none' : 'flex',
          width: '100%', height: '100%',
          alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6, color: '#9ca3af'
        }}>
          <Home size={36} />
          <span style={{ fontSize: '0.75rem' }}>No photos</span>
        </div>

        {/* Image count badge */}
        {imgCount > 1 && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: '0.7rem', borderRadius: 10, padding: '2px 7px'
          }}>
            📷 {imgCount}
          </div>
        )}

        {/* Status badge */}
        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: statusStyle.bg, color: statusStyle.color,
          fontSize: '0.7rem', fontWeight: 600, borderRadius: 10,
          padding: '2px 8px', textTransform: 'capitalize'
        }}>
          {lead.status}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '0.875rem', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Location */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <MapPin size={12} />
          {lead.city || 'Unknown location'}
          {postedAt && (
            <span style={{ marginLeft: 'auto' }}>{timeAgo(postedAt)}</span>
          )}
        </div>

        {/* Name */}
        <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {lead.name}
        </div>

        {/* Price + Area */}
        <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
          {lead.price && (
            <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)', fontSize: '0.95rem' }}>
              {formatPrice(lead.price, getCurrency(lead, meta))}{meta.ai_price_period === 'month' ? '/mo' : ''}
            </span>
          )}
          {lead.area && (
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
              {lead.area} m²
            </span>
          )}
        </div>

        {/* AI badges: listing type + bedrooms */}
        {(meta.ai_listing_type || meta.ai_bedrooms) && (
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {meta.ai_listing_type && meta.ai_listing_type !== 'unknown' && (
              <span style={{
                fontSize: '0.68rem', borderRadius: 10, padding: '2px 7px',
                background: meta.ai_listing_type === 'rental' ? '#dbeafe' : '#fef9c3',
                color: meta.ai_listing_type === 'rental' ? '#1e40af' : '#92400e'
              }}>
                {meta.ai_listing_type}
              </span>
            )}
            {meta.ai_bedrooms && (
              <span style={{ fontSize: '0.68rem', background: '#f3f4f6', color: '#374151', borderRadius: 10, padding: '2px 7px' }}>
                {meta.ai_bedrooms} bed
              </span>
            )}
          </div>
        )}

        {/* AI summary (2 lines) */}
        {meta.ai_summary && (
          <div style={{
            fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
          }}>
            {meta.ai_summary}
          </div>
        )}

        {/* Contact snippet (only if no summary) */}
        {!meta.ai_summary && phone && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            📞 {phone}
          </div>
        )}

        {/* Engagement */}
        <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: '#9ca3af', marginTop: 'auto', paddingTop: 6 }}>
          {meta.likes > 0 && <span>❤️ {meta.likes}</span>}
          {meta.comments_count > 0 && <span>💬 {meta.comments_count}</span>}
          {meta.shares_count > 0 && <span>🔁 {meta.shares_count}</span>}
        </div>
      </div>
    </div>
  )
}

// Detail modal
function LeadModal({ lead, onClose, onStatusChange }) {
  const [currentStatus, setCurrentStatus] = useState(lead.status)
  const [galleryIdx, setGalleryIdx] = useState(0)

  const meta = typeof lead.metadata === 'string' ? JSON.parse(lead.metadata || '{}') : (lead.metadata || {})
  const imageUrls = meta.image_urls || meta.images?.map(img => img.image_file_uri || img.url).filter(Boolean) || []
  const contacts = meta.contacts || {}
  const phone = meta.phone || contacts.phones?.[0] || ''
  const email = meta.email || contacts.emails?.[0] || ''
  const postedAt = meta.posted_at || lead.created_at

  const handleStatusChange = async (newStatus) => {
    setCurrentStatus(newStatus)
    if (onStatusChange) onStatusChange(lead.id, newStatus)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 640, width: '95vw', maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="modal-header">
          <h3 className="modal-title">Listing Details</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ padding: '1.25rem' }}>
          {/* Image gallery */}
          <ImageGallery images={imageUrls} key={lead.id} />

          {/* Author row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '1rem' }}>
            {meta.profile_picture_url && (
              <img
                src={meta.profile_picture_url}
                alt={lead.name}
                style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none' }}
              />
            )}
            <div>
              <div style={{ fontWeight: 600 }}>{lead.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                {postedAt ? timeAgo(postedAt) : ''}
                {lead.city ? ` · ${lead.city}` : ''}
              </div>
            </div>
            {lead.source_url && (
              <a
                href={lead.source_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ marginLeft: 'auto', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', textDecoration: 'none' }}
              >
                View on Facebook <ExternalLink size={13} />
              </a>
            )}
          </div>

          {/* Key stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: '1rem' }}>
            {[
              { label: 'Price', value: formatPrice(lead.price, getCurrency(lead, meta)) || '—' },
              { label: 'Area', value: lead.area ? `${lead.area} m²` : '—' },
              { label: 'Location', value: lead.city || '—' },
            ].map(({ label, value }) => (
              <div key={label} style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
                <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Engagement */}
          {(meta.likes > 0 || meta.comments_count > 0 || meta.shares_count > 0) && (
            <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {meta.likes > 0 && <span>❤️ {meta.likes} reactions</span>}
              {meta.comments_count > 0 && <span>💬 {meta.comments_count} comments</span>}
              {meta.shares_count > 0 && <span>🔁 {meta.shares_count} shares</span>}
            </div>
          )}

          {/* AI Summary */}
          {meta.ai_summary && (
            <div style={{
              background: '#f0f9ff', border: '1px solid #bae6fd',
              borderRadius: 8, padding: '0.875rem', marginBottom: '1rem'
            }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: '#0369a1', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                AI Summary
              </div>
              <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{meta.ai_summary}</div>
            </div>
          )}

          {/* Raw post text — collapsible */}
          <details style={{ marginBottom: '1rem' }}>
            <summary style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
              View original post
            </summary>
            <div style={{
              background: 'var(--bg-secondary, #f8f9fa)', padding: '0.75rem',
              borderRadius: 8, marginTop: 6, maxHeight: 180, overflowY: 'auto',
              whiteSpace: 'pre-wrap', fontSize: '0.875rem', lineHeight: 1.5
            }}>
              {lead.comment_text || 'No description'}
            </div>
          </details>

          {/* Contact */}
          {(phone || email || contacts.lineId || (contacts.phones && contacts.phones.length > 1) || (contacts.emails && contacts.emails.length > 1)) && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Contact</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Primary phone/email from AI */}
                {phone && <span style={{ fontSize: '0.875rem' }}>📞 {phone}</span>}
                {email && <span style={{ fontSize: '0.875rem' }}>✉️ {email}</span>}
                {contacts.lineId && <span style={{ fontSize: '0.875rem' }}>💬 LINE: {contacts.lineId}</span>}

                {/* All extracted phones */}
                {contacts.phones && contacts.phones.filter(p => p !== phone).length > 0 && (
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: 4 }}>All Phone Numbers:</div>
                    {contacts.phones.map((p, idx) => (
                      <div key={idx} style={{ fontSize: '0.875rem', color: '#374151' }}>📞 {p}</div>
                    ))}
                  </div>
                )}

                {/* All extracted emails */}
                {contacts.emails && contacts.emails.filter(e => e !== email).length > 0 && (
                  <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
                    <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginBottom: 4 }}>All Emails:</div>
                    {contacts.emails.map((e, idx) => (
                      <div key={idx} style={{ fontSize: '0.875rem', color: '#374151' }}>✉️ {e}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Status</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {['new', 'engaging', 'secured', 'dead'].map(s => {
                const st = STATUS_COLORS[s]
                return (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    style={{
                      padding: '4px 12px', borderRadius: 16, border: 'none', cursor: 'pointer',
                      fontWeight: currentStatus === s ? 700 : 400,
                      fontSize: '0.8rem', textTransform: 'capitalize',
                      background: currentStatus === s ? st.bg : 'var(--bg-secondary, #f3f4f6)',
                      color: currentStatus === s ? st.color : 'var(--text-secondary)',
                      outline: currentStatus === s ? `2px solid ${st.color}` : 'none'
                    }}
                  >
                    {s}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Close</button>
          {lead.source_url && (
            <a
              href={lead.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              Open Facebook Post <ExternalLink size={14} />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Leads({ direction = 'seeking', title = 'Leads' }) {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [selectedLead, setSelectedLead] = useState(null)
  const [total, setTotal] = useState(0)

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true)
      const params = { limit: 100, direction }
      if (statusFilter) params.status = statusFilter
      if (searchTerm) params.search = searchTerm
      const data = await api.leads.getAll(params)
      setLeads(data.leads || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchTerm, direction])

  useEffect(() => { loadLeads() }, [statusFilter])

  const handleSearch = e => {
    e.preventDefault()
    loadLeads()
  }

  const handleStatusChange = async (leadId, newStatus) => {
    try {
      await api.leads.update(leadId, { status: newStatus })
      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l))
      if (selectedLead?.id === leadId) setSelectedLead(prev => ({ ...prev, status: newStatus }))
    } catch (err) {
      console.error('Status update failed:', err)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h2>{title}</h2>
        <p>{total} {direction === 'seeking' ? 'prospect' : 'listing'}{total !== 1 ? 's' : ''} found</p>
      </div>

      {/* Filters */}
      <form onSubmit={handleSearch} className="search-bar" style={{ marginBottom: '1.5rem' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 300 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search by name..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 38 }}
          />
        </div>
        <select
          className="form-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ width: 150 }}
        >
          <option value="">All Status</option>
          <option value="new">New</option>
          <option value="engaging">Engaging</option>
          <option value="secured">Secured</option>
          <option value="dead">Dead</option>
        </select>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      {/* Card grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading listings...</div>
      ) : leads.length === 0 ? (
        <div className="empty-state">
          <Home size={40} style={{ color: '#d1d5db', marginBottom: 12 }} />
          <p>No {direction === 'seeking' ? 'leads' : 'properties'} yet. Go to Scrape to find posts!</p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.25rem'
        }}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={setSelectedLead} />
          ))}
        </div>
      )}

      {/* Detail modal */}
      {selectedLead && (
        <LeadModal
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
