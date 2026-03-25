import { useState, useEffect, useCallback } from 'react'
import { Search, Home, LayoutGrid, Map, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import { LeadCard, LeadPanel } from '../components/LeadComponents'
import PropertyMapView from '../components/PropertyMapView'

const TABS = [
  { id: 'fb', label: 'FB Leads', source: 'groups_scraper' },
  { id: 'direct', label: 'Direct Leads', source: 'direct' },
]

export default function Leads({ direction = 'seeking', title = 'Leads' }) {
  const [activeTab, setActiveTab] = useState('fb')
  const [viewMode, setViewMode] = useState('grid')
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [ownerOnly, setOwnerOnly] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [total, setTotal] = useState(0)
  const [filtering, setFiltering] = useState(false)
  const [reanalyzing, setReanalyzing] = useState(false)
  const [reanalyzeProgress, setReanalyzeProgress] = useState('')
  const [deduplicating, setDeduplicating] = useState(false)

  const handleAutoFilter = async () => {
    try {
      setFiltering(true)
      const res = await api.leads.filter()
      alert(res.message || 'Filtering complete')
      loadLeads()
    } catch (err) {
      console.error(err)
      alert('Failed to filter leads')
    } finally {
      setFiltering(false)
    }
  }

  const handleReanalyze = async () => {
    try {
      setReanalyzing(true)
      setReanalyzeProgress('Starting...')
      let totalUpdated = 0
      while (true) {
        const res = await api.scrape.reanalyze(10)
        totalUpdated += res.updated || 0
        if (res.remaining === 0 || res.updated === 0) break
        setReanalyzeProgress(`Re-analyzed ${totalUpdated} leads, ${res.remaining} remaining...`)
      }
      setReanalyzeProgress('')
      alert(`Re-analysis complete! Updated ${totalUpdated} leads.`)
      loadLeads()
    } catch (err) {
      console.error(err)
      alert('Failed to re-analyze: ' + err.message)
    } finally {
      setReanalyzing(false)
      setReanalyzeProgress('')
    }
  }

  const handleDeduplicate = async () => {
    if (!window.confirm('This will remove duplicates and low-quality/ad posts from your database. Continue?')) return
    try {
      setDeduplicating(true)
      const res = await api.scrape.deduplicate()
      const { breakdown } = res
      alert(
        `Cleanup complete! Removed ${res.removed} posts total:\n` +
        `• ${breakdown.urlDuplicates} URL duplicates\n` +
        `• ${breakdown.textDuplicates} text duplicates\n` +
        `• ${breakdown.lowQualityPosts} low-quality/ad posts`
      )
      loadLeads()
    } catch (err) {
      console.error(err)
      alert('Cleanup failed: ' + err.message)
    } finally {
      setDeduplicating(false)
    }
  }

  const loadLeads = useCallback(async () => {
    try {
      setLoading(true)
      const params = { limit: 100, direction }
      if (statusFilter) params.status = statusFilter
      if (searchTerm) params.search = searchTerm
      if (ownerOnly) params.ownerOnly = 'true'
      const tab = TABS.find(t => t.id === activeTab)
      if (tab) params.source = tab.source
      const data = await api.leads.getAll(params)
      setLeads(data.leads || [])
      setTotal(data.total || 0)
    } catch (error) {
      console.error('Failed to load leads:', error)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchTerm, direction, activeTab, ownerOnly])

  useEffect(() => { loadLeads() }, [statusFilter, activeTab, ownerOnly])

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
    <div style={{ display: 'flex', alignItems: 'flex-start', minHeight: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div>
            <h2>{title}</h2>
            <p>{total} {direction === 'seeking' ? 'prospect' : 'listing'}{total !== 1 ? 's' : ''} found</p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {direction === 'offering' && (
              <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <button
                  onClick={() => setViewMode('grid')}
                  style={{
                    padding: '7px 14px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    background: viewMode === 'grid' ? 'var(--primary)' : 'white',
                    color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                    fontSize: '0.85rem', fontWeight: 500,
                  }}
                >
                  <LayoutGrid size={15} /> Grid
                </button>
                <button
                  onClick={() => setViewMode('map')}
                  style={{
                    padding: '7px 14px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
                    background: viewMode === 'map' ? 'var(--primary)' : 'white',
                    color: viewMode === 'map' ? 'white' : 'var(--text-secondary)',
                    fontSize: '0.85rem', fontWeight: 500,
                  }}
                >
                  <Map size={15} /> Map
                </button>
              </div>
            )}
            {statusFilter === 'unfiltered' && (
              <button onClick={handleAutoFilter} disabled={filtering} className="btn btn-primary">
                {filtering ? 'Filtering...' : 'Auto-Filter'}
              </button>
            )}
            {direction === 'offering' && (
              <>
                <button onClick={handleReanalyze} disabled={reanalyzing} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                  <RefreshCw size={14} className={reanalyzing ? 'spin' : ''} />
                  {reanalyzing ? reanalyzeProgress || 'Re-analyzing...' : 'Re-analyze'}
                </button>
                <button onClick={handleDeduplicate} disabled={deduplicating} className="btn btn-secondary" style={{ fontSize: '0.85rem' }}>
                  {deduplicating ? 'Cleaning...' : 'Clean up'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tabs — only shown on Leads page (seeking direction) */}
      {direction === 'seeking' && (
        <div style={{ display: 'flex', marginBottom: '1.25rem', borderBottom: '2px solid var(--border)', overflowX: 'auto' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                marginBottom: -2,
                fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? 'var(--primary)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleSearch} className="search-bar">
        <div style={{ position: 'relative', flex: 1, minWidth: 160 }}>
          <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)', pointerEvents: 'none' }} />
          <input
            type="text"
            className="form-input"
            placeholder="Search..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            style={{ paddingLeft: 34 }}
          />
        </div>
        <select
          className="form-select"
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          style={{ minWidth: 120, width: 'auto', flex: '0 0 auto' }}
        >
          <option value="">All Status</option>
          <option value="unfiltered">Unfiltered</option>
          <option value="new">New</option>
          <option value="engaging">Engaging</option>
          <option value="secured">Secured</option>
          <option value="dead">Dead</option>
        </select>
        {direction === 'offering' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: '0.875rem', whiteSpace: 'nowrap' }}>
            <input
              type="checkbox"
              checked={ownerOnly}
              onChange={e => setOwnerOnly(e.target.checked)}
              style={{ cursor: 'pointer', width: 16, height: 16 }}
            />
            Owner only
          </label>
        )}
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>Loading listings...</div>
      ) : leads.length === 0 ? (
        <div className="empty-state">
          <Home size={40} style={{ color: '#d1d5db', marginBottom: 12 }} />
          <p>
            {activeTab === 'direct'
              ? 'No direct leads yet.'
              : `No ${direction === 'seeking' ? 'leads' : 'properties'} yet. Go to Scrape to find posts!`}
          </p>
        </div>
      ) : viewMode === 'map' && direction === 'offering' ? (
        <PropertyMapView leads={leads} onLeadClick={setSelectedLead} />
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
          gap: '1rem'
        }}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={setSelectedLead} compact={direction === 'seeking'} isSelected={selectedLead?.id === lead.id} />
          ))}
        </div>
      )}

      </div>

      {selectedLead && (
        <LeadPanel
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  )
}
