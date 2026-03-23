import { useState, useEffect, useCallback } from 'react'
import { Search, Home, LayoutGrid, Map, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import { LeadCard, LeadModal } from '../components/LeadComponents'
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
        if (res.remaining > 0) {
          setReanalyzeProgress(`Re-analyzed ${totalUpdated} leads, ${res.remaining} remaining...`)
        } else {
          break
        }
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
  }, [statusFilter, searchTerm, direction, activeTab])

  useEffect(() => { loadLeads() }, [statusFilter, activeTab])

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
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2>{title}</h2>
          <p>{total} {direction === 'seeking' ? 'prospect' : 'listing'}{total !== 1 ? 's' : ''} found</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {direction === 'offering' && (
            <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
              <button
                onClick={() => setViewMode('grid')}
                style={{
                  padding: '6px 14px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  background: viewMode === 'grid' ? 'var(--primary, #2563eb)' : 'white',
                  color: viewMode === 'grid' ? 'white' : 'var(--text-secondary)',
                  fontSize: '0.85rem', fontWeight: 500,
                }}
              >
                <LayoutGrid size={15} /> Grid
              </button>
              <button
                onClick={() => setViewMode('map')}
                style={{
                  padding: '6px 14px', border: 'none', borderLeft: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  background: viewMode === 'map' ? 'var(--primary, #2563eb)' : 'white',
                  color: viewMode === 'map' ? 'white' : 'var(--text-secondary)',
                  fontSize: '0.85rem', fontWeight: 500,
                }}
              >
                <Map size={15} /> Map
              </button>
            </div>
          )}
          {statusFilter === 'unfiltered' && (
            <button
              onClick={handleAutoFilter}
              disabled={filtering}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}
            >
              {filtering ? 'Filtering...' : 'Auto-Filter Raw Leads'}
            </button>
          )}
          {direction === 'offering' && (
            <>
              <button
                onClick={handleReanalyze}
                disabled={reanalyzing}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              >
                <RefreshCw size={14} className={reanalyzing ? 'spin' : ''} />
                {reanalyzing ? reanalyzeProgress || 'Re-analyzing...' : 'Re-analyze AI'}
              </button>
              <button
                onClick={handleDeduplicate}
                disabled={deduplicating}
                className="btn btn-secondary"
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
              >
                {deduplicating ? 'Cleaning...' : 'Clean up'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs — only shown on Leads page (seeking direction) */}
      {direction === 'seeking' && (
        <div style={{ display: 'flex', gap: 0, marginBottom: '1.25rem', borderBottom: '2px solid var(--border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                padding: '0.5rem 1.25rem',
                background: 'none',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid var(--primary, #2563eb)' : '2px solid transparent',
                marginBottom: -2,
                fontWeight: activeTab === tab.id ? 700 : 400,
                color: activeTab === tab.id ? 'var(--primary, #2563eb)' : 'var(--text-secondary)',
                cursor: 'pointer',
                fontSize: '0.9rem',
                transition: 'color 0.15s',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

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
          <option value="unfiltered">Unfiltered</option>
          <option value="new">New</option>
          <option value="engaging">Engaging</option>
          <option value="secured">Secured</option>
          <option value="dead">Dead</option>
        </select>
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
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '1.25rem'
        }}>
          {leads.map(lead => (
            <LeadCard key={lead.id} lead={lead} onClick={setSelectedLead} compact={direction === 'seeking'} />
          ))}
        </div>
      )}

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
