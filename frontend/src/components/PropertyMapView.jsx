import { useState, useEffect, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { formatPrice, getCurrency, STATUS_COLORS, timeAgo } from './LeadComponents'

// Fix Leaflet default icon paths for Vite
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const createPinIcon = (label, active) => L.divIcon({
  className: '',
  html: `<div style="
    background: ${active ? '#222' : 'white'};
    color: ${active ? 'white' : '#111'};
    border: 2px solid ${active ? '#111' : '#ccc'};
    border-radius: 20px;
    padding: 5px 11px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    box-shadow: ${active ? '0 4px 16px rgba(0,0,0,0.35)' : '0 2px 6px rgba(0,0,0,0.12)'};
    transform: ${active ? 'scale(1.12)' : 'scale(1)'};
    transition: all 0.15s ease;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    cursor: pointer;
    user-select: none;
  ">${label}</div>`,
  iconSize: [100, 30],
  iconAnchor: [50, 15],
})

function MapAutoFit({ coords }) {
  const map = useMap()
  const prevCount = useRef(0)
  useEffect(() => {
    const points = Object.values(coords)
    if (points.length === 0 || points.length === prevCount.current) return
    prevCount.current = points.length
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 14)
    } else {
      const bounds = L.latLngBounds(points.map(p => [p.lat, p.lng]))
      map.fitBounds(bounds, { padding: [50, 50] })
    }
  }, [Object.keys(coords).length, map])
  return null
}

function MapPanTo({ coords, selectedId }) {
  const map = useMap()
  useEffect(() => {
    if (!selectedId || !coords[selectedId]) return
    const pos = coords[selectedId]
    map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.4 })
  }, [selectedId, coords, map])
  return null
}

function SidebarCard({ lead, meta, isSelected, isHovered, hasPin, onClick, onDoubleClick, onMouseEnter, onMouseLeave }) {
  const statusStyle = STATUS_COLORS[lead.status] || STATUS_COLORS.new
  const currency = getCurrency(lead, meta)
  const postedAt = meta.posted_at || lead.created_at
  const active = isSelected || isHovered

  const imageUrls =
    meta.image_urls ||
    meta.images?.map(img => img.image_file_uri || img.url).filter(Boolean) ||
    meta.attachments?.filter(a => a.__typename === 'Photo').map(a => a.image?.uri || a.thumbnail).filter(Boolean) ||
    []
  const thumb = imageUrls[0]

  return (
    <div
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        display: 'flex',
        gap: 10,
        padding: '10px 12px',
        background: isSelected ? '#eff6ff' : active ? '#f8f9fa' : 'white',
        border: `1px solid ${isSelected ? '#3b82f6' : active ? '#d1d5db' : 'var(--border)'}`,
        borderLeft: isSelected ? '3px solid #3b82f6' : `1px solid ${active ? '#d1d5db' : 'var(--border)'}`,
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 0.1s, border-color 0.1s, box-shadow 0.1s',
        boxShadow: isSelected ? '0 2px 12px rgba(59,130,246,0.15)' : active ? '0 2px 10px rgba(0,0,0,0.08)' : 'none',
        opacity: hasPin ? 1 : 0.55,
      }}
    >
      {/* Thumbnail */}
      <div style={{ width: 72, height: 60, flexShrink: 0, borderRadius: 8, overflow: 'hidden', background: '#f3f4f6' }}>
        {thumb ? (
          <img src={thumb} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db', fontSize: '1.25rem' }}>🏠</div>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <span style={{
            fontSize: '0.62rem', fontWeight: 600, borderRadius: 20,
            padding: '1px 7px', textTransform: 'capitalize',
            background: statusStyle.bg, color: statusStyle.color, flexShrink: 0
          }}>
            {lead.status}
          </span>
          {postedAt && <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{timeAgo(postedAt)}</span>}
        </div>
        <div style={{
          fontWeight: 600, fontSize: '0.82rem', lineHeight: 1.3, color: 'var(--text-primary)',
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
        }}>
          {meta.ai_title || lead.name || 'Untitled listing'}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          {lead.price && (
            <span style={{ fontWeight: 700, color: '#2563eb', fontSize: '0.82rem' }}>
              {formatPrice(lead.price, currency)}{meta.ai_price_period === 'month' ? '/mo' : ''}
            </span>
          )}
          {lead.area && <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{lead.area} m²</span>}
        </div>
      </div>
    </div>
  )
}

export default function PropertyMapView({ leads, onLeadClick }) {
  const [coords, setCoords] = useState({})
  const [hoveredId, setHoveredId] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [geocoding, setGeocoding] = useState(false)
  const [mobileView, setMobileView] = useState('list')
  const cardRefs = useRef({})
  const markerRefs = useRef({})

  const getMeta = (lead) => {
    if (typeof lead.metadata === 'string') {
      try { return JSON.parse(lead.metadata) } catch { return {} }
    }
    return lead.metadata || {}
  }

  const getGeoQuery = (lead) => {
    const m = getMeta(lead)
    return m.ai_google_maps_query || lead.city || m.ai_detected_location || null
  }

  // Nominatim geocoding queue — 1 req/sec rate limit
  useEffect(() => {
    const toGeocode = leads.filter(l => getGeoQuery(l) && !coords[l.id])
    if (!toGeocode.length) return

    setGeocoding(true)
    let cancelled = false

    ;(async () => {
      for (const lead of toGeocode) {
        if (cancelled) break
        const query = getGeoQuery(lead)
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`,
            { headers: { 'User-Agent': 'LeadforgeAI/1.0 contact@leadforge.ai' } }
          )
          const data = await res.json()
          if (data[0]) {
            setCoords(prev => ({
              ...prev,
              [lead.id]: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
            }))
          }
        } catch { /* network error, skip */ }
        await new Promise(r => setTimeout(r, 1100))
      }
      if (!cancelled) setGeocoding(false)
    })()

    return () => { cancelled = true }
  }, [leads.map(l => l.id).join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToCard = (leadId) => {
    cardRefs.current[leadId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  const handlePinClick = (lead) => {
    setSelectedId(lead.id)
    scrollToCard(lead.id)
    // Open the popup on the marker
    const marker = markerRefs.current[lead.id]
    if (marker) marker.openPopup()
  }

  const handleCardClick = (lead) => {
    setSelectedId(lead.id)
    // Open popup if pin exists
    const marker = markerRefs.current[lead.id]
    if (marker) marker.openPopup()
  }

  const pinnedCount = Object.keys(coords).length
  const hasLocationCount = leads.filter(l => getGeoQuery(l)).length

  return (
    <>
      <style>{`
        @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: 0.3 } }
        .leaflet-popup-content-wrapper { border-radius: 12px !important; box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important; }
        .leaflet-popup-tip { display: none !important; }
        .leaflet-control-zoom { border-radius: 10px !important; overflow: hidden; border: none !important; box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important; }
        .leaflet-control-attribution { font-size: 10px !important; opacity: 0.6; }
        @media (min-width: 640px) {
          .map-sidebar { display: flex !important; width: 320px !important; }
          .map-container-wrap { display: flex !important; }
          .map-mobile-tabs { display: none !important; }
        }
        @media (min-width: 1024px) {
          .map-sidebar { width: 360px !important; }
        }
      `}</style>

      {/* Mobile tabs */}
      <div className="map-mobile-tabs">
        <button
          className={`map-mobile-tab ${mobileView === 'list' ? 'active' : ''}`}
          onClick={() => setMobileView('list')}
        >
          List
        </button>
        <button
          className={`map-mobile-tab ${mobileView === 'map' ? 'active' : ''}`}
          onClick={() => setMobileView('map')}
        >
          Map {Object.keys(coords).length > 0 && `(${Object.keys(coords).length})`}
        </button>
      </div>

      <div style={{ display: 'flex', height: 'calc(100vh - 220px)', gap: 16, overflow: 'hidden' }}>

        {/* ── Left: scrollable card sidebar ──────────────────────────────── */}
        <div
          className="map-sidebar"
          style={{
            width: 360, flexShrink: 0, display: mobileView === 'list' ? 'flex' : 'none',
            flexDirection: 'column', overflow: 'hidden',
          }}
        >
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '4px 0 10px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {geocoding && (
              <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: '#f59e0b', animation: 'pulse 1.2s infinite' }} />
            )}
            {geocoding
              ? `Mapping properties… (${pinnedCount}/${hasLocationCount})`
              : `${pinnedCount} of ${leads.length} properties mapped`
            }
          </div>
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4 }}>
            {leads.map(lead => {
              const meta = getMeta(lead)
              return (
                <div key={lead.id} ref={el => { cardRefs.current[lead.id] = el }}>
                  <SidebarCard
                    lead={lead}
                    meta={meta}
                    isSelected={selectedId === lead.id}
                    isHovered={hoveredId === lead.id}
                    hasPin={!!coords[lead.id]}
                    onClick={() => handleCardClick(lead)}
                    onDoubleClick={() => onLeadClick(lead)}
                    onMouseEnter={() => setHoveredId(lead.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  />
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Right: map ─────────────────────────────────────────────────── */}
        <div
          className="map-container-wrap"
          style={{
            flex: 1, borderRadius: 16, overflow: 'hidden', position: 'relative',
            display: mobileView === 'map' ? 'block' : 'none',
          }}
        >
          <MapContainer
            center={[13.75, 100.5]}
            zoom={12}
            style={{ width: '100%', height: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <MapAutoFit coords={coords} />
            <MapPanTo coords={coords} selectedId={selectedId} />

            {leads.map(lead => {
              const pos = coords[lead.id]
              if (!pos) return null
              const meta = getMeta(lead)
              const currency = getCurrency(lead, meta)
              const priceLabel = lead.price
                ? formatPrice(lead.price, currency) + (meta.ai_price_period === 'month' ? '/mo' : '')
                : '–'
              const active = hoveredId === lead.id || selectedId === lead.id

              return (
                <Marker
                  key={lead.id + (active ? '_a' : '_i')}
                  position={[pos.lat, pos.lng]}
                  icon={createPinIcon(priceLabel, active)}
                  zIndexOffset={active ? 1000 : 0}
                  ref={el => { if (el) markerRefs.current[lead.id] = el }}
                  eventHandlers={{
                    click: () => handlePinClick(lead),
                    mouseover: () => setHoveredId(lead.id),
                    mouseout: () => setHoveredId(null),
                  }}
                >
                  <Popup closeButton={false} offset={[0, -8]}>
                    <div style={{ minWidth: 200, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif', padding: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem', marginBottom: 4, lineHeight: 1.3 }}>
                        {meta.ai_title || lead.name || 'Property'}
                      </div>
                      {lead.price && (
                        <div style={{ color: '#2563eb', fontWeight: 700, fontSize: '0.95rem' }}>
                          {formatPrice(lead.price, currency)}{meta.ai_price_period === 'month' ? '/mo' : ''}
                        </div>
                      )}
                      {(lead.area || meta.ai_bedrooms) && (
                        <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: 2, display: 'flex', gap: 8 }}>
                          {meta.ai_bedrooms && <span>{meta.ai_bedrooms} bed</span>}
                          {lead.area && <span>{lead.area} m²</span>}
                        </div>
                      )}
                      {(lead.city || meta.ai_detected_location) && (
                        <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 2 }}>
                          {lead.city || meta.ai_detected_location}
                        </div>
                      )}
                      <button
                        onClick={() => onLeadClick(lead)}
                        style={{
                          marginTop: 10, width: '100%', padding: '6px 12px',
                          background: '#111', color: 'white', border: 'none',
                          borderRadius: 8, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600
                        }}
                      >
                        View details
                      </button>
                    </div>
                  </Popup>
                </Marker>
              )
            })}
          </MapContainer>
        </div>
      </div>
    </>
  )
}
