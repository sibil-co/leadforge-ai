export const mockLeads = [
  {
    id: '1',
    name: 'John Smith',
    price: 450000,
    city: 'Miami',
    source_url: 'https://facebook.com/groups/realestate',
    source_type: 'group',
    status: 'new',
    facebook_id: 'fb_12345',
    created_at: '2024-01-15T10:30:00Z'
  },
  {
    id: '2',
    name: 'Sarah Johnson',
    price: 325000,
    city: 'Orlando',
    source_url: 'https://facebook.com/groups/floridahomes',
    source_type: 'group',
    status: 'engaging',
    facebook_id: 'fb_12346',
    conversation_history: [
      { role: 'assistant', content: 'Hi Sarah! I noticed you might be looking for properties in Orlando area.', timestamp: '2024-01-15T11:00:00Z' },
      { role: 'user', content: 'Yes, I am! Looking for something around $300k', timestamp: '2024-01-15T11:05:00Z' },
      { role: 'assistant', content: 'Great! I have some excellent options in that range. What features are you looking for?', timestamp: '2024-01-15T11:10:00Z' }
    ],
    created_at: '2024-01-14T09:15:00Z'
  },
  {
    id: '3',
    name: 'Michael Brown',
    price: 550000,
    city: 'Tampa',
    source_url: 'https://facebook.com/groups/tamparealestate',
    source_type: 'group',
    status: 'secured',
    facebook_id: 'fb_12347',
    conversation_history: [
      { role: 'assistant', content: 'Hi Michael! Great to connect with you.', timestamp: '2024-01-10T14:00:00Z' },
      { role: 'user', content: 'I am interested in the Tampa property you mentioned', timestamp: '2024-01-10T14:30:00Z' },
      { role: 'assistant', content: 'Perfect! Let me tell you more about it.', timestamp: '2024-01-10T14:35:00Z' },
      { role: 'user', content: 'I would like to proceed and schedule a viewing', timestamp: '2024-01-11T10:00:00Z' }
    ],
    created_at: '2024-01-10T14:00:00Z'
  },
  {
    id: '4',
    name: 'Emily Davis',
    price: 280000,
    city: 'Jacksonville',
    source_url: 'https://facebook.com/groups/jaxhomes',
    source_type: 'group',
    status: 'dead',
    facebook_id: 'fb_12348',
    conversation_history: [
      { role: 'assistant', content: 'Hi Emily! Found some great options for you.', timestamp: '2024-01-08T09:00:00Z' },
      { role: 'user', content: 'Thanks but I am not interested anymore', timestamp: '2024-01-08T09:30:00Z' }
    ],
    created_at: '2024-01-08T09:00:00Z'
  },
  {
    id: '5',
    name: 'Robert Wilson',
    price: 675000,
    city: 'Fort Lauderdale',
    source_url: 'https://facebook.com/groups/southflorida',
    source_type: 'group',
    status: 'new',
    facebook_id: 'fb_12349',
    created_at: '2024-01-16T08:45:00Z'
  },
  {
    id: '6',
    name: 'Jennifer Martinez',
    price: 395000,
    city: 'Miami',
    source_url: 'https://facebook.com/groups/miamirealty',
    source_type: 'page',
    status: 'engaging',
    facebook_id: 'fb_12350',
    conversation_history: [
      { role: 'assistant', content: 'Hi Jennifer! Looking forward to helping you find your dream home.', timestamp: '2024-01-16T11:00:00Z' },
      { role: 'user', content: 'Thanks! What do you have available in Miami?', timestamp: '2024-01-16T11:15:00Z' }
    ],
    created_at: '2024-01-16T11:00:00Z'
  },
  {
    id: '7',
    name: 'David Anderson',
    price: 720000,
    city: 'West Palm Beach',
    source_url: 'https://facebook.com/groups/palmbeach',
    source_type: 'group',
    status: 'new',
    facebook_id: 'fb_12351',
    created_at: '2024-01-16T14:20:00Z'
  },
  {
    id: '8',
    name: 'Lisa Thompson',
    price: 310000,
    city: 'Orlando',
    source_url: 'https://facebook.com/groups/orlandohomes',
    source_type: 'group',
    status: 'new',
    facebook_id: 'fb_12352',
    created_at: '2024-01-16T16:00:00Z'
  },
  {
    id: '9',
    name: 'Christopher Lee',
    price: 485000,
    city: 'Tampa',
    source_url: 'https://facebook.com/groups/tampaproperties',
    source_type: 'group',
    status: 'secured',
    facebook_id: 'fb_12353',
    conversation_history: [
      { role: 'assistant', content: 'Hi Christopher! Let me know if you have any questions.', timestamp: '2024-01-12T10:00:00Z' },
      { role: 'user', content: 'I want to make an offer on the Tampa property', timestamp: '2024-01-13T09:00:00Z' }
    ],
    created_at: '2024-01-12T10:00:00Z'
  },
  {
    id: '10',
    name: 'Amanda Garcia',
    price: 520000,
    city: 'Miami',
    source_url: 'https://facebook.com/groups/miamiluxury',
    source_type: 'page',
    status: 'new',
    facebook_id: 'fb_12354',
    created_at: '2024-01-17T09:30:00Z'
  }
]

export const mockScrapeJobs = [
  {
    id: '1',
    country: 'USA',
    city: 'Miami',
    keywords: ['real estate', 'homes for sale', 'property'],
    apify_run_id: 'run_abc123',
    status: 'completed',
    leads_count: 25,
    created_at: '2024-01-15T08:00:00Z',
    completed_at: '2024-01-15T08:15:00Z'
  },
  {
    id: '2',
    country: 'USA',
    city: 'Orlando',
    keywords: ['vacation home', 'investment property'],
    apify_run_id: 'run_def456',
    status: 'completed',
    leads_count: 18,
    created_at: '2024-01-14T10:30:00Z',
    completed_at: '2024-01-14T10:45:00Z'
  },
  {
    id: '3',
    country: 'USA',
    city: 'Tampa',
    keywords: ['real estate', 'buy house'],
    apify_run_id: 'run_ghi789',
    status: 'running',
    leads_count: 0,
    created_at: '2024-01-17T11:00:00Z',
    completed_at: null
  },
  {
    id: '4',
    country: 'USA',
    city: 'Jacksonville',
    keywords: ['property', 'homes'],
    apify_run_id: 'run_jkl012',
    status: 'failed',
    leads_count: 0,
    created_at: '2024-01-13T14:00:00Z',
    completed_at: '2024-01-13T14:05:00Z'
  },
  {
    id: '5',
    country: 'USA',
    city: 'Fort Lauderdale',
    keywords: ['luxury homes', 'beach property'],
    apify_run_id: 'run_mno345',
    status: 'completed',
    leads_count: 12,
    created_at: '2024-01-16T09:00:00Z',
    completed_at: '2024-01-16T09:20:00Z'
  }
]

export const mockStats = {
  total: 156,
  new_count: 45,
  engaging_count: 38,
  secured_count: 52,
  dead_count: 21
}
