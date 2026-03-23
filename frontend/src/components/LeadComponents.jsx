import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, ExternalLink, MapPin } from 'lucide-react'

export const STATUS_COLORS = {
  new: { bg: '#dbeafe', color: '#1d4ed8' },
  engaging: { bg: '#fef9c3', color: '#a16207' },
  secured: { bg: '#dcfce7', color: '#15803d' },
  dead: { bg: '#fee2e2', color: '#dc2626' },
  unfiltered: { bg: '#f3f4f6', color: '#4b5563' },
}

const THAI_KEYWORDS = ['bangkok', 'chiang mai', 'phuket', 'pattaya', 'hua hin', 'koh samui', 'thailand', 'thai', 'chiang rai', 'krabi', 'samui', 'koh']

export function timeAgo(isoString) {
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

export function getCurrency(lead, meta) {
  const loc = ((meta?.ai_detected_location || '') + ' ' + (lead.city || '')).toLowerCase()
  if (THAI_KEYWORDS.some(kw => loc.includes(kw))) return 'THB'
  return 'USD'
}

export function formatPrice(price, currency = 'USD') {
  if (!price) return null
  if (currency === 'THB') {
    return '฿' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(price)
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, maximumFractionDigits: 0
  }).format(price)
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

function Lightbox({ images, startIdx, onClose }) {
  const [idx, setIdx] = useState(startIdx)

  const prev = (e) => { e.stopPropagation(); setIdx(i => (i - 1 + images.length) % images.length) }
  const next = (e) => { e.stopPropagation(); setIdx(i => (i + 1) % images.length) }

  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'ArrowLeft') setIdx(i => (i - 1 + images.length) % images.length)
      if (e.key === 'ArrowRight') setIdx(i => (i + 1) % images.length)
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [images.length, onClose])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%',
          width: 40, height: 40, cursor: 'pointer', color: '#fff', fontSize: '1.25rem',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >×</button>

      <div style={{
        position: 'absolute', top: 20, left: '50%', transform: 'translateX(-50%)',
        color: 'rgba(255,255,255,0.7)', fontSize: '0.85rem'
      }}>
        {idx + 1} / {images.length}
      </div>

      <img
        src={images[idx]}
        alt={`Photo ${idx + 1}`}
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: '90vw', maxHeight: '85vh', objectFit: 'contain', borderRadius: 4, userSelect: 'none' }}
        onError={e => { e.target.style.display = 'none' }}
      />

      {images.length > 1 && (
        <>
          <button onClick={prev} style={{ ...navBtnStyle('left'), position: 'fixed', width: 44, height: 44, background: 'rgba(255,255,255,0.15)' }}>
            <ChevronLeft size={24} />
          </button>
          <button onClick={next} style={{ ...navBtnStyle('right'), position: 'fixed', width: 44, height: 44, background: 'rgba(255,255,255,0.15)' }}>
            <ChevronRight size={24} />
          </button>
        </>
      )}

      {images.length > 1 && (
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', gap: 6, overflowX: 'auto', maxWidth: '90vw', padding: '4px 8px'
          }}
        >
          {images.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`thumb ${i + 1}`}
              onClick={e => { e.stopPropagation(); setIdx(i) }}
              style={{
                width: 60, height: 46, objectFit: 'cover', borderRadius: 4,
                cursor: 'pointer', flexShrink: 0,
                outline: i === idx ? '2px solid #fff' : '2px solid transparent',
                opacity: i === idx ? 1 : 0.5
              }}
              onError={e => { e.target.style.display = 'none' }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ImageGallery({ images }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [lightboxIdx, setLightboxIdx] = useState(null)
  if (!images || images.length === 0) return null

  const prev = (e) => { e.stopPropagation(); setActiveIdx(i => (i - 1 + images.length) % images.length) }
  const next = (e) => { e.stopPropagation(); setActiveIdx(i => (i + 1) % images.length) }

  return (
    <>
      {lightboxIdx !== null && (
        <Lightbox images={images} startIdx={lightboxIdx} onClose={() => setLightboxIdx(null)} />
      )}
      <div style={{ marginBottom: '1.25rem' }}>
        <div style={{ position: 'relative', background: '#000', borderRadius: 8, overflow: 'hidden', marginBottom: 6 }}>
          <img
            src={images[activeIdx]}
            alt={`Photo ${activeIdx + 1}`}
            onClick={() => setLightboxIdx(activeIdx)}
            style={{ width: '100%', height: 280, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
            onError={e => { e.target.style.display = 'none' }}
          />
          {images.length > 1 && (
            <>
              <button onClick={prev} style={navBtnStyle('left')}><ChevronLeft size={20} /></button>
              <button onClick={next} style={navBtnStyle('right')}><ChevronRight size={20} /></button>
            </>
          )}
          <div
            onClick={() => setLightboxIdx(activeIdx)}
            style={{
              position: 'absolute', bottom: 8, right: 10,
              background: 'rgba(0,0,0,0.55)', color: '#fff',
              fontSize: '0.75rem', borderRadius: 12, padding: '2px 8px', cursor: 'zoom-in'
            }}
          >
            {images.length > 1 ? `${activeIdx + 1} / ${images.length} · click to expand` : 'click to expand'}
          </div>
        </div>
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
    </>
  )
}

// ── Score helpers ─────────────────────────────────────────────────────────────

export function scoreColor(score) {
  if (score >= 8) return '#16a34a'
  if (score >= 6) return '#ca8a04'
  if (score >= 4) return '#ea580c'
  return '#dc2626'
}

function scoreLabel(score) {
  if (score >= 8) return 'Strong match'
  if (score >= 6) return 'Good match'
  if (score >= 4) return 'Partial match'
  if (score >= 2) return 'Weak match'
  return 'Not a match'
}

function scoreSublabel(score) {
  if (score >= 8) return 'Clear housing listing with good details — price, location, or contact found.'
  if (score >= 6) return 'Likely a housing listing, but some info (price, contact, or location) is missing.'
  if (score >= 4) return 'Post mentions housing but is vague, incomplete, or off-topic.'
  if (score >= 2) return 'Barely related to housing — may be a comment, share, or unrelated post.'
  return 'Not a housing listing.'
}

function ScoreDot({ score }) {
  const color = scoreColor(score)
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, flexShrink: 0
    }} />
  )
}

function AIScoreBlock({ score, isHousing, locationOk, locationConf }) {
  const color = scoreColor(score)
  const pct = (score / 10) * 100

  return (
    <div style={{ marginBottom: '1rem', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.875rem' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
        AI Confidence Score
      </div>

      {/* Score bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{ flex: 1, height: 8, background: '#e2e8f0', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
        </div>
        <span style={{ fontWeight: 700, fontSize: '1rem', color, minWidth: 36, textAlign: 'right' }}>
          {score}/10
        </span>
      </div>

      {/* Label + description */}
      <div style={{ fontWeight: 600, fontSize: '0.85rem', color, marginBottom: 3 }}>{scoreLabel(score)}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 10 }}>{scoreSublabel(score)}</div>

      {/* Verdict pills */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill
          label="Housing listing"
          value={isHousing === true ? 'Yes' : isHousing === false ? 'No' : '—'}
          ok={isHousing === true}
        />
        <Pill
          label="Location match"
          value={locationOk === true ? 'Yes' : locationOk === false ? 'No' : '—'}
          ok={locationOk === true}
          sub={locationConf ? `confidence: ${locationConf}` : null}
        />
      </div>

      {/* How the score works — collapsed by default */}
      <details style={{ marginTop: 10 }}>
        <summary style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none', listStyle: 'none' }}>
          ▸ How is this score calculated?
        </summary>
        <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--text-secondary)', lineHeight: 1.6, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
          GPT reads the full post and scores it 0–10 based on four factors:
          <ul style={{ margin: '6px 0 0 1.2rem', padding: 0 }}>
            <li><strong>Listing clarity</strong> — is it clearly offering or seeking housing?</li>
            <li><strong>Information completeness</strong> — does it include price, area, or room type?</li>
            <li><strong>Location relevance</strong> — does it match the target country/city?</li>
            <li><strong>Actionability</strong> — is there contact info (phone, LINE, email)?</li>
          </ul>
          <div style={{ marginTop: 6 }}>
            <strong>8–10:</strong> Strong · <strong>6–7:</strong> Good · <strong>4–5:</strong> Partial · <strong>0–3:</strong> Weak/None
          </div>
        </div>
      </details>
    </div>
  )
}

function Pill({ label, value, ok, sub }) {
  const color = ok ? '#15803d' : value === '—' ? '#6b7280' : '#b91c1c'
  const bg = ok ? '#f0fdf4' : value === '—' ? '#f3f4f6' : '#fef2f2'
  return (
    <div style={{ background: bg, border: `1px solid ${ok ? '#bbf7d0' : value === '—' ? '#e5e7eb' : '#fecaca'}`, borderRadius: 6, padding: '3px 10px', fontSize: '0.75rem' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}: </span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
      {sub && <span style={{ color: '#9ca3af', marginLeft: 4 }}>({sub})</span>}
    </div>
  )
}

// ── Lead Card ─────────────────────────────────────────────────────────────────

export function LeadCard({ lead, onClick, compact = false }) {
  let meta = lead.metadata || {}
  if (typeof lead.metadata === 'string') {
    try { meta = JSON.parse(lead.metadata) } catch { meta = {} }
  }

  const imageUrls = meta.image_urls ||
    meta.images?.map(img => img.image_file_uri || img.url).filter(Boolean) ||
    meta.attachments?.filter(att => att.__typename === 'Photo').map(att => att.image?.uri || att.thumbnail).filter(Boolean) ||
    []

  const postedAt = meta.posted_at || lead.created_at
  const statusStyle = STATUS_COLORS[lead.status] || STATUS_COLORS.new
  const score = meta.ai_relevance_score
  const accentColor = score != null ? scoreColor(score) : 'var(--border)'
  const hasPrice = lead.price != null
  const hasContact = meta.contacts?.phones?.length > 0 || meta.ai_contact_line_id || meta.contacts?.lineId

  // ── Compact (text-only) variant — used on Leads page ──────────────────────
  if (compact) {
    return (
      <div
        onClick={() => onClick(lead)}
        style={{
          background: 'var(--bg-card, white)',
          border: '1px solid var(--border)',
          borderLeft: `3px solid ${accentColor}`,
          borderRadius: 10,
          cursor: 'pointer',
          transition: 'box-shadow 0.15s, transform 0.15s',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.09)'
          e.currentTarget.style.transform = 'translateY(-1px)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.boxShadow = 'none'
          e.currentTarget.style.transform = 'none'
        }}
      >
        <div style={{ padding: '0.875rem 1rem', flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{
              fontSize: '0.68rem', fontWeight: 600, borderRadius: 20,
              padding: '2px 8px', textTransform: 'capitalize',
              background: statusStyle.bg, color: statusStyle.color,
            }}>
              {lead.status}
            </span>
            {postedAt && <span style={{ fontSize: '0.7rem', color: '#9ca3af' }}>{timeAgo(postedAt)}</span>}
          </div>

          <div style={{
            fontWeight: 700, fontSize: '0.92rem', lineHeight: 1.35, color: 'var(--text-primary)',
            overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
          }}>
            {meta.ai_title || lead.name || 'Untitled listing'}
          </div>

          {(hasPrice || lead.area) && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              {hasPrice && (
                <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)', fontSize: '1rem' }}>
                  {formatPrice(lead.price, getCurrency(lead, meta))}{meta.ai_price_period === 'month' ? '/mo' : meta.ai_price_period === 'night' ? '/night' : ''}
                </span>
              )}
              {lead.area && <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{lead.area} m²</span>}
            </div>
          )}

          {(lead.city || meta.ai_detected_location) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              <MapPin size={11} strokeWidth={2} />
              <span>{lead.city || meta.ai_detected_location}</span>
            </div>
          )}

          {meta.ai_summary && (
            <div style={{
              fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.45,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', marginTop: 1
            }}>
              {meta.ai_summary}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 'auto', paddingTop: 6, flexWrap: 'wrap' }}>
            {meta.ai_listing_type && meta.ai_listing_type !== 'unknown' && (
              <span style={{
                fontSize: '0.66rem', fontWeight: 500, borderRadius: 20, padding: '2px 7px',
                background: meta.ai_listing_type === 'rental' ? '#dbeafe' : '#fef9c3',
                color: meta.ai_listing_type === 'rental' ? '#1e40af' : '#92400e'
              }}>
                {meta.ai_listing_type}
              </span>
            )}
            {meta.ai_bedrooms && (
              <span style={{ fontSize: '0.66rem', background: '#f3f4f6', color: '#4b5563', borderRadius: 20, padding: '2px 7px' }}>
                {meta.ai_bedrooms} bed
              </span>
            )}
            {hasContact && (
              <span style={{ fontSize: '0.66rem', background: '#f0fdf4', color: '#15803d', borderRadius: 20, padding: '2px 7px', border: '1px solid #bbf7d0' }}>
                contact
              </span>
            )}
            {score != null && (
              <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.72rem', fontWeight: 700, color: accentColor }}>
                <ScoreDot score={score} />
                {score}/10
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Full (image) variant — used on Properties page ─────────────────────────
  const thumb = imageUrls[0]
  const imgCount = imageUrls.length
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
        <div style={{
          display: thumb ? 'none' : 'flex',
          width: '100%', height: '100%',
          alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6, color: '#9ca3af'
        }}>
          <MapPin size={36} />
          <span style={{ fontSize: '0.75rem' }}>No photos</span>
        </div>

        {imgCount > 1 && (
          <div style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'rgba(0,0,0,0.55)', color: '#fff',
            fontSize: '0.7rem', borderRadius: 10, padding: '2px 7px'
          }}>
            📷 {imgCount}
          </div>
        )}

        <div style={{
          position: 'absolute', top: 8, left: 8,
          background: statusStyle.bg, color: statusStyle.color,
          fontSize: '0.7rem', fontWeight: 600, borderRadius: 10,
          padding: '2px 8px', textTransform: 'capitalize'
        }}>
          {lead.status}
        </div>
      </div>

      <div style={{ padding: '0.875rem', flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
          <MapPin size={12} />
          {lead.city || 'Unknown location'}
          {postedAt && <span style={{ marginLeft: 'auto' }}>{timeAgo(postedAt)}</span>}
        </div>

        <div style={{ fontWeight: 600, fontSize: '0.9rem', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {meta.ai_title || lead.name}
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 2 }}>
          {lead.price && (
            <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)', fontSize: '0.95rem' }}>
              {formatPrice(lead.price, getCurrency(lead, meta))}{meta.ai_price_period === 'month' ? '/mo' : ''}
            </span>
          )}
          {lead.area && <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>{lead.area} m²</span>}
        </div>

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

        {meta.ai_summary && (
          <div style={{
            fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
          }}>
            {meta.ai_summary}
          </div>
        )}

        {!meta.ai_summary && phone && (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 2 }}>
            📞 {phone}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, fontSize: '0.72rem', color: '#9ca3af', marginTop: 'auto', paddingTop: 6, alignItems: 'center' }}>
          {meta.likes > 0 && <span>❤️ {meta.likes}</span>}
          {meta.comments_count > 0 && <span>💬 {meta.comments_count}</span>}
          {meta.shares_count > 0 && <span>🔁 {meta.shares_count}</span>}
          {score != null && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
              <ScoreDot score={score} />
              <span style={{ fontWeight: 600, color: accentColor }}>{score}/10</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function LeadModal({ lead, onClose, onStatusChange }) {
  const [currentStatus, setCurrentStatus] = useState(lead.status)
  let meta = lead.metadata || {}
  if (typeof lead.metadata === 'string') {
    try { meta = JSON.parse(lead.metadata) } catch { meta = {} }
  }

  const imageUrls = meta.image_urls ||
    meta.images?.map(img => img.image_file_uri || img.url).filter(Boolean) ||
    meta.attachments?.filter(att => att.__typename === 'Photo').map(att => att.image?.uri || att.thumbnail).filter(Boolean) ||
    []

  const contacts = meta.contacts || {}
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
          <ImageGallery images={imageUrls} key={lead.id} />

          {(meta.ai_title || lead.name) && (
            <h2 style={{ fontWeight: 700, fontSize: '1.15rem', lineHeight: 1.3, margin: '0.75rem 0 0.5rem', color: 'var(--text-primary)' }}>
              {meta.ai_title || lead.name}
            </h2>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: '1rem' }}>
            {meta.profile_picture_url && (
              <img
                src={meta.profile_picture_url}
                alt={lead.name}
                style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none' }}
              />
            )}
            <div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                <span style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', fontSize: '0.6rem' }}>Author</span>
                {' · '}{lead.name}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
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

          {/* Pricing — always first */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Pricing</div>
            {meta.ai_price_tiers && meta.ai_price_tiers.length > 1 ? (
              <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, overflow: 'hidden' }}>
                {meta.ai_price_tiers.map((tier, idx) => (
                  <div key={idx} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.6rem 0.875rem',
                    borderBottom: idx < meta.ai_price_tiers.length - 1 ? '1px solid #e5e7eb' : 'none'
                  }}>
                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>{tier.condition || tier.period}</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)', fontSize: '0.95rem' }}>
                      {formatPrice(tier.amount, getCurrency(lead, meta))}/{tier.period}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.6rem 0.875rem', display: 'inline-block' }}>
                <span style={{ fontWeight: 700, color: 'var(--primary, #2563eb)', fontSize: '0.95rem' }}>
                  {formatPrice(lead.price, getCurrency(lead, meta)) || '—'}
                  {meta.ai_price_period === 'month' ? '/mo' : meta.ai_price_period === 'night' ? '/night' : meta.ai_price_period === 'week' ? '/week' : ''}
                </span>
              </div>
            )}
          </div>

          {/* AI Score — always second */}
          {meta.ai_relevance_score != null && (
            <AIScoreBlock score={meta.ai_relevance_score} isHousing={meta.is_housing_listing} locationOk={meta.is_correct_location} locationConf={meta.location_confidence} />
          )}

          {/* Property Details */}
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Property Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {meta.ai_property_name && (
                <div style={{ gridColumn: '1 / -1', background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Property</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{meta.ai_property_name}</div>
                </div>
              )}
              {[
                { label: 'Location', value: lead.city || meta.ai_detected_location || '—' },
                { label: 'Area', value: lead.area ? `${lead.area} m²` : '—' },
                { label: 'Floor', value: meta.ai_floor || '—' },
                { label: 'Room Type', value: meta.ai_room_type || '—' },
                { label: 'Bedrooms', value: meta.ai_bedrooms ? `${meta.ai_bedrooms} bed` : '—' },
                { label: 'Bathrooms', value: meta.ai_bathrooms ? `${meta.ai_bathrooms} bath` : '—' },
              ].map(({ label, value }) => (
                <div key={label} style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{value}</div>
                </div>
              ))}
              {meta.ai_furnished !== null && meta.ai_furnished !== undefined && (
                <div style={{ background: meta.ai_furnished ? '#f0fdf4' : '#f8f9fa', borderRadius: 8, padding: '0.6rem 0.75rem', border: meta.ai_furnished ? '1px solid #bbf7d0' : 'none' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Furnished</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: meta.ai_furnished ? '#166534' : '#6b7280' }}>
                    {meta.ai_furnished ? 'Yes' : 'No'}
                  </div>
                </div>
              )}
              {meta.ai_available_from && (
                <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Available</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{meta.ai_available_from}</div>
                </div>
              )}
              {meta.ai_units_available && (
                <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: 2 }}>Units</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{meta.ai_units_available} available</div>
                </div>
              )}
            </div>
          </div>

          {meta.ai_google_maps_query && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Location</div>
              <iframe
                title="map"
                src={`https://www.google.com/maps?q=${encodeURIComponent(meta.ai_google_maps_query)}&output=embed`}
                width="100%"
                height="240"
                style={{ border: 0, borderRadius: 8, display: 'block' }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
              <a
                href={`https://www.google.com/maps/search/${encodeURIComponent(meta.ai_google_maps_query)}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: '0.75rem', color: 'var(--primary)', textDecoration: 'none', display: 'inline-block', marginTop: 4 }}
              >
                {meta.ai_google_maps_query} ↗
              </a>
            </div>
          )}

          {meta.ai_amenities && meta.ai_amenities.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Amenities</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {meta.ai_amenities.map((amenity, idx) => (
                  <span key={idx} style={{
                    background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0',
                    borderRadius: 20, padding: '3px 10px', fontSize: '0.78rem'
                  }}>
                    {amenity}
                  </span>
                ))}
              </div>
            </div>
          )}

          {(() => {
            const allPhones = meta.ai_all_phones?.length ? meta.ai_all_phones : contacts.phones || []
            const allEmails = meta.ai_all_emails?.length ? meta.ai_all_emails : contacts.emails || []
            const lineId = meta.ai_contact_line_id || contacts.lineId
            const whatsapp = meta.ai_contact_whatsapp
            const contactName = meta.ai_contact_name
            const hasAny = allPhones.length > 0 || allEmails.length > 0 || lineId || whatsapp || contactName
            if (!hasAny) return null
            return (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Contact</div>
                <div style={{ background: 'var(--bg-secondary, #f8f9fa)', borderRadius: 8, padding: '0.875rem', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {contactName && <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: 2 }}>{contactName}</div>}
                  {allPhones.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>📞</span>
                      <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{allPhones.join('  ·  ')}</div>
                    </div>
                  )}
                  {lineId && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                      <span style={{ fontSize: '1rem' }}>💬</span>
                      <span><strong>LINE:</strong> {lineId}</span>
                    </div>
                  )}
                  {whatsapp && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.875rem' }}>
                      <span style={{ fontSize: '1rem' }}>📲</span>
                      <span><strong>WhatsApp:</strong> {whatsapp}</span>
                    </div>
                  )}
                  {allEmails.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                      <span style={{ fontSize: '1rem', lineHeight: 1.4 }}>✉️</span>
                      <div style={{ fontSize: '0.875rem', lineHeight: 1.6 }}>{allEmails.join('  ·  ')}</div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

          {(meta.likes > 0 || meta.comments_count > 0 || meta.shares_count > 0) && (
            <div style={{ display: 'flex', gap: 16, fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              {meta.likes > 0 && <span>❤️ {meta.likes} reactions</span>}
              {meta.comments_count > 0 && <span>💬 {meta.comments_count} comments</span>}
              {meta.shares_count > 0 && <span>🔁 {meta.shares_count} shares</span>}
            </div>
          )}

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

          {onStatusChange && (
            <div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 6 }}>Status</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {['unfiltered', 'new', 'engaging', 'secured', 'dead'].map(s => {
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
          )}
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
