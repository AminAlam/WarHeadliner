import React, { useState, useEffect } from 'react'
import axios from 'axios'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { format } from 'date-fns'
import 'leaflet/dist/leaflet.css'
import './App.css'

// Fix for default markers in react-leaflet
import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'

let DefaultIcon = L.divIcon({
  html: '<div style="background-color: red; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

L.Marker.prototype.options.icon = DefaultIcon

// Component to store map reference
function MapRef() {
  const map = useMap()
  useEffect(() => {
    window.leafletMapInstance = map
  }, [map])
  return null
}

// Enhanced Marker component with realistic fade effects
function EnhancedMarker({ event, style }) {
  const map = useMap()
  const [markerId] = useState(() => `marker-${event.id}-${Date.now()}`)
  
  useEffect(() => {
    // Create unique gradient ID for this marker
    const gradientId = `gradient-${markerId}`
    
    // Check if SVG defs exist, create if not
    let svgDefs = document.getElementById('leaflet-marker-gradients')
    if (!svgDefs) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
      svg.id = 'leaflet-marker-svg'
      svg.style.position = 'absolute'
      svg.style.width = '0'
      svg.style.height = '0'
      svg.style.pointerEvents = 'none'
      
      svgDefs = document.createElementNS('http://www.w3.org/2000/svg', 'defs')
      svgDefs.id = 'leaflet-marker-gradients'
      svg.appendChild(svgDefs)
      document.body.appendChild(svg)
    }
    
    // Create radial gradient
    const gradient = document.createElementNS('http://www.w3.org/2000/svg', 'radialGradient')
    gradient.id = gradientId
    gradient.setAttribute('cx', '50%')
    gradient.setAttribute('cy', '50%')
    gradient.setAttribute('r', '50%')
    
    // Add gradient stops for realistic fade effect
    const stops = [
      { offset: '0%', color: style.gradientColors[0], opacity: 0.9 },
      { offset: '30%', color: style.gradientColors[1], opacity: 0.7 },
      { offset: '60%', color: style.gradientColors[2], opacity: 0.4 },
      { offset: '100%', color: style.gradientColors[3], opacity: 0.1 }
    ]
    
    stops.forEach(stop => {
      const stopElement = document.createElementNS('http://www.w3.org/2000/svg', 'stop')
      stopElement.setAttribute('offset', stop.offset)
      stopElement.setAttribute('stop-color', stop.color)
      stopElement.setAttribute('stop-opacity', stop.opacity)
      gradient.appendChild(stopElement)
    })
    
    svgDefs.appendChild(gradient)
    
    // Get event type class for styling
    const eventTypeClass = event.is_air_attack ? 'air-attack' :
                           event.is_air_defence ? 'air-defence' :
                           event.is_electricity_shortage ? 'electricity-shortage' :
                           event.is_water_shortage ? 'water-shortage' :
                           event.is_unknown_explosion ? 'unknown-explosion' : 'other'
    
    // Create custom marker
    const customIcon = L.divIcon({
      html: `
        <div class="enhanced-marker ${eventTypeClass} ${style.pulseAnimation ? 'pulse' : ''}" style="
          width: ${style.radius * 2}px;
          height: ${style.radius * 2}px;
          background: radial-gradient(circle, ${style.gradientColors.join(', ')});
          border: 2px solid ${style.color};
          border-radius: 50%;
          box-shadow: 
            0 0 ${style.radius}px rgba(${style.color.replace('#', '').match(/.{2}/g).map(x => parseInt(x, 16)).join(', ')}, 0.3),
            inset 0 0 ${style.radius/2}px rgba(255, 255, 255, 0.2);
          animation: ${style.pulseAnimation ? 'marker-pulse 2s infinite' : 'none'};
          transition: all 0.3s ease;
        ">
          <div class="marker-center" style="
            width: ${style.radius/2}px;
            height: ${style.radius/2}px;
            background: ${style.color};
            border-radius: 50%;
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            box-shadow: 0 0 ${style.radius/4}px rgba(255, 255, 255, 0.8);
          "></div>
        </div>
      `,
      className: 'enhanced-marker-icon',
      iconSize: [style.radius * 2, style.radius * 2],
      iconAnchor: [style.radius, style.radius]
    })
    
    // Create marker
    const marker = L.marker([event.latitude, event.longitude], { icon: customIcon })
      .bindPopup(`
        <div class="popup-content">
          <div class="popup-header">
            <strong>${getEventType(event)}</strong>
            <span class="popup-time">
              ${format(new Date(event.message_timestamp), 'HH:mm')}
            </span>
          </div>
          <div class="popup-body">
            <div><strong>Location:</strong> ${event.official_location || event.extracted_location}</div>
            <div><strong>Channel:</strong> ${event.channel_name}</div>
            <div><strong>Message:</strong> ${event.message_text.substring(0, 150)}...</div>
          </div>
        </div>
      `)
    
    marker.addTo(map)
    
    // Cleanup function
    return () => {
      map.removeLayer(marker)
      const gradientElement = document.getElementById(gradientId)
      if (gradientElement) {
        gradientElement.remove()
      }
    }
  }, [event, style, map, markerId])
  
  return null
}

// Helper function to get event type (moved outside component for reuse)
function getEventType(event) {
  if (event.is_air_attack) return 'Air Attack'
  if (event.is_air_defence) return 'Air Defence'
  if (event.is_electricity_shortage) return 'Electricity Shortage'
  if (event.is_water_shortage) return 'Water Shortage'
  if (event.is_unknown_explosion) return 'Unknown Explosion'
  return 'Other'
}

// Translation object
const translations = {
  en: {
    appTitle: 'Iran-Israel War Monitor',
    sidebarTitle: 'WarHeadliner',
    statistics: 'Statistics',
    messages: 'Messages', 
    filters: 'Filters',
    totalMessages: 'Total Messages',
    airAttacks: 'Air Attacks',
    airDefence: 'Air Defence',
    electricityIssues: 'Electricity Issues',
    waterIssues: 'Water Issues',
    unknownExplosions: 'Unknown Explosions',
    recentMessages: 'Recent Messages',
    timeRange: 'Time Range',
    eventType: 'Event Type',
    allTypes: 'All Types',
    lastHour: 'Last 1 hour',
    last6Hours: 'Last 6 hours',
    last12Hours: 'Last 12 hours',
    last24Hours: 'Last 24 hours',
    last48Hours: 'Last 48 hours',
    allTime: 'All Time',
    live: 'Live',
    loading: 'Loading WarHeadliner Monitor...',
    location: 'Location',
    channel: 'Channel',
    message: 'Message',
    time: 'Time',
    language: 'Language',
    loadMore: 'Load More',
    loadingMessages: 'Loading messages...',
    noMoreMessages: 'No more messages',
    legend: 'Legend',
    showOnMap: 'Show on Map',
    exportMap: 'Export Map',
    exportingMap: 'Exporting...',
    mapExported: 'Map exported successfully!',
    motivationalMessage: 'Iranian people will win this fight'
  },
  fa: {
    appTitle: 'مانیتور جنگ ایران-اسرائیل',
    sidebarTitle: 'وارهدلاینر',
    statistics: 'آمار',
    messages: 'پیام‌ها',
    filters: 'فیلترها',
    totalMessages: 'کل پیام‌ها',
    airAttacks: 'حملات هوایی',
    airDefence: 'پدافند هوایی',
    electricityIssues: 'مشکلات برق',
    waterIssues: 'مشکلات آب',
    unknownExplosions: 'انفجارهای نامشخص',
    recentMessages: 'پیام‌های اخیر',
    timeRange: 'بازه زمانی',
    eventType: 'نوع رویداد',
    allTypes: 'همه انواع',
    lastHour: '۱ ساعت گذشته',
    last6Hours: '۶ ساعت گذشته',
    last12Hours: '۱۲ ساعت گذشته',
    last24Hours: '۲۴ ساعت گذشته',
    last48Hours: '۴۸ ساعت گذشته',
    allTime: 'همه زمان‌ها',
    live: 'زنده',
    loading: 'در حال بارگذاری مانیتور وارهدلاینر...',
    location: 'موقعیت',
    channel: 'کانال',
    message: 'پیام',
    time: 'زمان',
    language: 'زبان',
    loadMore: 'بارگذاری بیشتر',
    loadingMessages: 'در حال بارگذاری پیام‌ها...',
    noMoreMessages: 'پیام دیگری وجود ندارد',
    legend: 'راهنما',
    showOnMap: 'نمایش در نقشه',
    exportMap: 'خروجی نقشه',
    exportingMap: 'در حال خروجی...',
    mapExported: 'نقشه با موفقیت ذخیره شد!',
    motivationalMessage: 'ملت ایران در این نبرد پیروز خواهد شد'
  }
}

function App() {
  const [events, setEvents] = useState([])
  const [stats, setStats] = useState({})
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeFilter, setTimeFilter] = useState(24)
  const [typeFilter, setTypeFilter] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [activePanel, setActivePanel] = useState('stats')
  const [language, setLanguage] = useState('fa')
  const [messagesLoading, setMessagesLoading] = useState(false)
  const [messagesPage, setMessagesPage] = useState(1)
  const [hasMoreMessages, setHasMoreMessages] = useState(true)
  const [visibleIncidents, setVisibleIncidents] = useState({
    air_attack: true,
    air_defence: true,
    electricity_shortage: false,
    water_shortage: false,
    unknown_explosion: true,
    other: false
  })
  const [isExporting, setIsExporting] = useState(false)

  // Translation helper function
  const t = (key) => translations[language][key] || key

  // Update document title when language changes
  useEffect(() => {
    document.title = t('appTitle')
  }, [language])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30000) // Refresh every 30 seconds
    return () => clearInterval(interval)
  }, [timeFilter, typeFilter])

  const fetchData = async () => {
    try {
      const params = {}
      if (timeFilter !== 'all') {
        params.hours = timeFilter
      }
      if (typeFilter) params.types = typeFilter

      const statsParams = {}
      if (timeFilter !== 'all') {
        statsParams.hours = timeFilter
      }

      const [eventsRes, statsRes, messagesRes] = await Promise.all([
        axios.get('/api/events', { params }),
        axios.get('/api/stats', { params: statsParams }),
        axios.get('/api/messages', { params: { limit: 10, page: 1 } })
      ])

      setEvents(eventsRes.data)
      setStats(statsRes.data)
      setMessages(messagesRes.data)
      setMessagesPage(1)
      setHasMoreMessages(messagesRes.data.length === 10)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching data:', error)
      setLoading(false)
    }
  }

  const getIncidentStyle = (event) => {
    if (event.is_air_attack) return {
      color: '#ef4444',
      fillColor: '#ef4444',
      fillOpacity: 0.4,
      weight: 2,
      radius: 7.5,
      gradientColors: ['#ef4444', '#dc2626', '#b91c1c', 'rgba(239, 68, 68, 0.1)'],
      pulseAnimation: true
    }
    if (event.is_air_defence) return {
      color: '#3b82f6',
      fillColor: '#3b82f6',
      fillOpacity: 0.4,
      weight: 2,
      radius: 6,
      gradientColors: ['#3b82f6', '#2563eb', '#1d4ed8', 'rgba(59, 130, 246, 0.1)'],
      pulseAnimation: true
    }
    if (event.is_electricity_shortage) return {
      color: '#f59e0b',
      fillColor: '#f59e0b',
      fillOpacity: 0.3,
      weight: 2,
      radius: 4,
      gradientColors: ['#f59e0b', '#d97706', '#b45309', 'rgba(245, 158, 11, 0.1)'],
      pulseAnimation: false
    }
    if (event.is_water_shortage) return {
      color: '#8b5cf6',
      fillColor: '#8b5cf6',
      fillOpacity: 0.3,
      weight: 2,
      radius: 4,
      gradientColors: ['#8b5cf6', '#7c3aed', '#6d28d9', 'rgba(139, 92, 246, 0.1)'],
      pulseAnimation: false
    }
    if (event.is_unknown_explosion) return {
      color: '#6b7280',
      fillColor: '#6b7280',
      fillOpacity: 0.3,
      weight: 2,
      radius: 5,
      gradientColors: ['#6b7280', '#4b5563', '#374151', 'rgba(107, 114, 128, 0.1)'],
      pulseAnimation: true
    }
    return {
      color: '#64748b',
      fillColor: '#64748b',
      fillOpacity: 0.2,
      weight: 2,
      radius: 3,
      gradientColors: ['#64748b', '#475569', '#334155', 'rgba(100, 116, 139, 0.1)'],
      pulseAnimation: false
    }
  }

  const getIncidentTypeKey = (event) => {
    if (event.is_air_attack) return 'air_attack'
    if (event.is_air_defence) return 'air_defence'
    if (event.is_electricity_shortage) return 'electricity_shortage'
    if (event.is_water_shortage) return 'water_shortage'
    if (event.is_unknown_explosion) return 'unknown_explosion'
    return 'other'
  }

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handlePanelChange = (panel) => {
    setActivePanel(panel)
    // Only close sidebar on very small screens (mobile phones)
    // if (window.innerWidth <= 480) {
    //   setSidebarOpen(false)
    // }
  }

  const loadMoreMessages = async () => {
    if (messagesLoading || !hasMoreMessages) return

    setMessagesLoading(true)
    try {
      const nextPage = messagesPage + 1
      const response = await axios.get('/api/messages', { 
        params: { limit: 10, page: nextPage }
      })
      
      if (response.data.length > 0) {
        setMessages(prevMessages => [...prevMessages, ...response.data])
        setMessagesPage(nextPage)
        setHasMoreMessages(response.data.length === 10)
      } else {
        setHasMoreMessages(false)
      }
    } catch (error) {
      console.error('Error loading more messages:', error)
    } finally {
      setMessagesLoading(false)
    }
  }

  const toggleIncidentType = (incidentType) => {
    setVisibleIncidents(prev => ({
      ...prev,
      [incidentType]: !prev[incidentType]
    }))
  }

  const exportMapImage = async () => {
    setIsExporting(true)
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default
      
      const mapContainer = document.querySelector('.map-container')
      if (!mapContainer) {
        throw new Error('Map container not found')
      }

      // Get the leaflet map instance to get bounds and projection info
      const leafletContainer = mapContainer.querySelector('.leaflet-container')
      const leafletMap = leafletContainer._leaflet_map || window.leafletMapInstance

      // Temporarily hide the export button and legend
      const exportBtn = document.querySelector('.export-btn')
      const legend = document.querySelector('.map-legend')
      const originalExportDisplay = exportBtn ? exportBtn.style.display : ''
      const originalLegendDisplay = legend ? legend.style.display : ''
      
      if (exportBtn) exportBtn.style.display = 'none'
      if (legend) legend.style.display = 'none'

      // Wait a bit for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500))

      // Capture just the map (without legend) first
      const mapCanvas = await html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        width: mapContainer.offsetWidth,
        height: mapContainer.offsetHeight,
        backgroundColor: '#0f172a',
        logging: false,
        ignoreElements: (element) => {
          return element.classList.contains('export-btn') || 
                 element.classList.contains('map-legend') ||
                 element.classList.contains('export-spinner') ||
                 element.classList.contains('export-icon')
        }
      })

      // Restore the legend temporarily to capture it separately
      if (legend) legend.style.display = originalLegendDisplay
      await new Promise(resolve => setTimeout(resolve, 100))

      // Capture the legend separately
      let legendCanvas = null
      if (legend) {
        legendCanvas = await html2canvas(legend, {
          useCORS: true,
          allowTaint: true,
          scale: 2,
          backgroundColor: null,
          logging: false,
          ignoreElements: (element) => {
            return element.classList.contains('export-btn') || 
                   element.classList.contains('export-spinner') ||
                   element.classList.contains('export-icon')
          }
        })
      }

      // Restore original displays
      if (exportBtn) exportBtn.style.display = originalExportDisplay
      if (legend) legend.style.display = originalLegendDisplay

      // Create final canvas
      const finalCanvas = document.createElement('canvas')
      const finalCtx = finalCanvas.getContext('2d')
      
      finalCanvas.width = mapCanvas.width
      finalCanvas.height = mapCanvas.height

      // Draw the map
      finalCtx.drawImage(mapCanvas, 0, 0)

      // Manually draw the enhanced incident markers on the map
      if (leafletMap && events.length > 0) {
        const mapBounds = leafletMap.getBounds()
        const mapSize = leafletMap.getSize()
        
        events
          .filter(event => visibleIncidents[getIncidentTypeKey(event)])
          .forEach(event => {
            try {
              // Convert lat/lng to pixel coordinates
              const point = leafletMap.latLngToContainerPoint([event.latitude, event.longitude])
              const style = getIncidentStyle(event)
              
              if (point.x >= 0 && point.x <= mapSize.x && point.y >= 0 && point.y <= mapSize.y) {
                // Scale coordinates for high-res canvas
                const x = point.x * 2
                const y = point.y * 2
                const outerRadius = style.radius * 2
                const innerRadius = style.radius
                
                // Create radial gradient for export
                const gradient = finalCtx.createRadialGradient(x, y, 0, x, y, outerRadius)
                style.gradientColors.forEach((color, index) => {
                  const stop = index / (style.gradientColors.length - 1)
                  const opacity = 0.9 - (stop * 0.8) // Fade from 0.9 to 0.1
                  gradient.addColorStop(stop, color.includes('rgba') ? color : color + Math.round(opacity * 255).toString(16).padStart(2, '0'))
                })
                
                // Draw the outer gradient circle
                finalCtx.beginPath()
                finalCtx.arc(x, y, outerRadius, 0, 2 * Math.PI)
                finalCtx.fillStyle = gradient
                finalCtx.fill()
                
                // Draw the border
                finalCtx.strokeStyle = style.color
                finalCtx.lineWidth = style.weight * 2
                finalCtx.stroke()
                
                // Draw the center highlight
                finalCtx.beginPath()
                finalCtx.arc(x, y, innerRadius / 2, 0, 2 * Math.PI)
                finalCtx.fillStyle = style.color
                finalCtx.fill()
                
                // Add center glow
                finalCtx.beginPath()
                finalCtx.arc(x, y, innerRadius / 4, 0, 2 * Math.PI)
                finalCtx.fillStyle = 'rgba(255, 255, 255, 0.8)'
                finalCtx.fill()
              }
            } catch (error) {
              console.warn('Error drawing enhanced incident marker:', error)
            }
          })
      }

      // Draw the legend on top
      if (legendCanvas) {
        const legendRect = legend.getBoundingClientRect()
        const mapRect = mapContainer.getBoundingClientRect()
        
        // Calculate legend position relative to map container
        const legendX = (legendRect.left - mapRect.left) * 2
        const legendY = (legendRect.top - mapRect.top) * 2
        
        finalCtx.drawImage(legendCanvas, legendX, legendY)
      }

      // Add watermark
      const watermarkText1 = 'github.com/AminAlam/WarHeadliner'
      const watermarkText2 = 'war.aminalam.info'
      
      const watermarkWidth = 500
      const watermarkHeight = 80
      finalCtx.fillStyle = 'rgba(255, 255, 255, 0.9)'
      finalCtx.fillRect(10, finalCanvas.height - watermarkHeight - 10, watermarkWidth, watermarkHeight)
      
      finalCtx.strokeStyle = 'rgba(30, 41, 59, 0.3)'
      finalCtx.lineWidth = 2
      finalCtx.strokeRect(10, finalCanvas.height - watermarkHeight - 10, watermarkWidth, watermarkHeight)
      
      finalCtx.fillStyle = '#1e293b'
      finalCtx.font = 'bold 24px Arial'
      finalCtx.fillText(watermarkText1, 25, finalCanvas.height - 50)
      finalCtx.font = 'bold 20px Arial'
      finalCtx.fillText(watermarkText2, 25, finalCanvas.height - 25)

      const timestamp = new Date().toLocaleString()
      finalCtx.font = '14px Arial'
      finalCtx.fillStyle = 'rgba(30, 41, 59, 0.7)'
      finalCtx.fillText(`Exported: ${timestamp}`, finalCanvas.width - 200, finalCanvas.height - 15)

      // Download the image
      const link = document.createElement('a')
      link.download = `iran-israel-war-monitor-${new Date().toISOString().split('T')[0]}.png`
      link.href = finalCanvas.toDataURL('image/png', 1.0)
      link.click()

      console.log(t('mapExported'))
      
    } catch (error) {
      console.error('Error exporting map:', error)
      alert('Failed to export map. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  if (loading) {
    return (
      <div className="loading">
        <div className="loading-spinner"></div>
        <h2>{t('loading')}</h2>
      </div>
    )
  }

  return (
    <div className={`app ${language === 'fa' ? 'rtl' : 'ltr'}`}>
      {/* Mobile Overlay */}
      {sidebarOpen && <div className="overlay" onClick={toggleSidebar}></div>}
      
      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>{t('sidebarTitle')}</h2>
          <div className="header-controls">
            <select 
              value={language} 
              onChange={(e) => setLanguage(e.target.value)}
              className="language-select"
            >
              <option value="en">EN</option>
              <option value="fa">فا</option>
            </select>
            <button className="close-sidebar" onClick={toggleSidebar}>×</button>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-item ${activePanel === 'stats' ? 'active' : ''}`}
            onClick={() => handlePanelChange('stats')}
          >
            <span className="nav-icon">📊</span>
            {t('statistics')}
          </button>
          <button 
            className={`nav-item ${activePanel === 'messages' ? 'active' : ''}`}
            onClick={() => handlePanelChange('messages')}
          >
            <span className="nav-icon">📱</span>
            {t('messages')}
          </button>
          <button 
            className={`nav-item ${activePanel === 'filters' ? 'active' : ''}`}
            onClick={() => handlePanelChange('filters')}
          >
            <span className="nav-icon">🔧</span>
            {t('filters')}
          </button>
        </nav>

        {/* Panel Content */}
        <div className="panel-content">
                     {activePanel === 'stats' && (
             <div className="stats-panel">
               <h3>{t('statistics')}</h3>
               <div className="stats-list">
                 <div className="stat-item">
                   <span className="stat-label">{t('totalMessages')}</span>
                   <span className="stat-value">{stats.total_messages || 0}</span>
                 </div>
                 <div className="stat-item">
                   <span className="stat-label">{t('airAttacks')}</span>
                   <span className="stat-value air-attack">{stats.air_attacks || 0}</span>
                 </div>
                 <div className="stat-item">
                   <span className="stat-label">{t('airDefence')}</span>
                   <span className="stat-value air-defence">{stats.air_defence || 0}</span>
                 </div>
                 <div className="stat-item">
                   <span className="stat-label">{t('electricityIssues')}</span>
                   <span className="stat-value electricity">{stats.electricity_shortages || 0}</span>
                 </div>
                 <div className="stat-item">
                   <span className="stat-label">{t('waterIssues')}</span>
                   <span className="stat-value water">{stats.water_shortages || 0}</span>
                 </div>
                 <div className="stat-item">
                   <span className="stat-label">{t('unknownExplosions')}</span>
                   <span className="stat-value explosion">{stats.unknown_explosions || 0}</span>
                 </div>
               </div>
             </div>
           )}

                                {activePanel === 'messages' && (
             <div className="messages-panel">
               <h3>{t('recentMessages')}</h3>
               <div className="messages-list">
                 {messages.map((message) => (
                   <div key={message.id} className="message-card">
                     <div className="message-header">
                       <span className={`message-type ${getEventType(message).toLowerCase().replace(/\s+/g, '-')}`}>
                         {getEventType(message)}
                       </span>
                       <span className="message-time">
                         {format(new Date(message.message_timestamp), 'HH:mm')}
                       </span>
                     </div>
                     <div className="message-content">
                       <div className="message-channel">{message.channel_name}</div>
                       {message.official_location && (
                         <div className="message-location">📍 {message.official_location}</div>
                       )}
                       <div className="message-text">{message.message_text}</div>
                     </div>
                   </div>
                 ))}
               </div>
               
               {/* Load More Button */}
               <div className="load-more-container">
                 {messagesLoading && (
                   <div className="loading-messages">
                     <div className="loading-spinner-small"></div>
                     <span>{t('loadingMessages')}</span>
                   </div>
                 )}
                 
                 {!messagesLoading && hasMoreMessages && (
                   <button 
                     className="load-more-btn"
                     onClick={loadMoreMessages}
                   >
                     {t('loadMore')}
                   </button>
                 )}
                 
                 {!messagesLoading && !hasMoreMessages && messages.length > 0 && (
                   <div className="no-more-messages">
                     {t('noMoreMessages')}
                   </div>
                 )}
               </div>
             </div>
           )}

                     {activePanel === 'filters' && (
             <div className="filters-panel">
               <h3>{t('filters')}</h3>
               <div className="filter-group">
                 <label>{t('timeRange')}</label>
                 <select 
                   value={timeFilter} 
                   onChange={(e) => setTimeFilter(e.target.value)}
                   className="filter-select"
                 >
                   <option value={1}>{t('lastHour')}</option>
                   <option value={6}>{t('last6Hours')}</option>
                   <option value={12}>{t('last12Hours')}</option>
                   <option value={24}>{t('last24Hours')}</option>
                   <option value={48}>{t('last48Hours')}</option>
                   <option value="all">{t('allTime')}</option>
                 </select>
               </div>
               
               <div className="filter-group">
                 <label>{t('eventType')}</label>
                 <select 
                   value={typeFilter} 
                   onChange={(e) => setTypeFilter(e.target.value)}
                   className="filter-select"
                 >
                   <option value="">{t('allTypes')}</option>
                   <option value="air_attack">{t('airAttacks')}</option>
                   <option value="air_defence">{t('airDefence')}</option>
                   <option value="electricity_shortage">{t('electricityIssues')}</option>
                   <option value="water_shortage">{t('waterIssues')}</option>
                   <option value="unknown_explosion">{t('unknownExplosions')}</option>
                 </select>
               </div>
             </div>
           )}
        </div>
      </div>

      {/* Main Content */}
      <div className="main-content">
        {/* Top Bar */}
        <div className="top-bar">
          <button className="menu-toggle" onClick={toggleSidebar}>
            <span></span>
            <span></span>
            <span></span>
          </button>
          <h1>{t('appTitle')}</h1>
          <div className="status-indicator">
            <span className="status-dot active"></span>
            {t('live')}
          </div>
        </div>

                {/* Map Container */}
        <div className="map-container">
          {/* Legend */}
          <div className="map-legend">
            <div className="legend-header">
              <h4>{t('legend')}</h4>
              <button 
                className="export-btn"
                onClick={exportMapImage}
                disabled={isExporting}
              >
                {isExporting ? (
                  <>
                    <div className="export-spinner"></div>
                    {t('exportingMap')}
                  </>
                ) : (
                  <>
                    <span className="export-icon">📸</span>
                    {t('exportMap')}
                  </>
                )}
              </button>
            </div>
            <div className="legend-items">
              {Object.entries(visibleIncidents).map(([type, visible]) => {
                const sampleEvent = { [`is_${type}`]: true }
                const style = getIncidentStyle(sampleEvent)
                return (
                  <div key={type} className="legend-item">
                    <label className="legend-checkbox">
                      <input
                        type="checkbox"
                        checked={visible}
                        onChange={() => toggleIncidentType(type)}
                      />
                      <div 
                        className="legend-color" 
                        style={{ 
                          backgroundColor: style.fillColor,
                          border: `2px solid ${style.color}`,
                          opacity: visible ? 1 : 0.3
                        }}
                      ></div>
                      <span className={`legend-label ${!visible ? 'disabled' : ''}`}>
                        {t(type === 'air_attack' ? 'airAttacks' : 
                          type === 'air_defence' ? 'airDefence' : 
                          type === 'electricity_shortage' ? 'electricityIssues' : 
                          type === 'water_shortage' ? 'waterIssues' : 
                          type === 'unknown_explosion' ? 'unknownExplosions' : 'other')}
                      </span>
                    </label>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Motivational Banner - Under the legend */}
          <div className="motivational-banner-map">
            <span>{t('motivationalMessage')}</span>
          </div>

          {/* Watermark - Bottom Left */}
          <div className="map-watermark">
            <div className="watermark-line1">github.com/AminAlam/WarHeadliner</div>
            <div className="watermark-line2">war.aminalam.info</div>
          </div>

          <MapContainer 
            center={[32.4279, 53.6880]}  // Iran coordinates
            zoom={6} 
            style={{ height: '100%', width: '100%' }}
            className="main-map"
          >
            <MapRef />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {events
              .filter(event => visibleIncidents[getIncidentTypeKey(event)])
              .map((event) => {
                const style = getIncidentStyle(event)
                return (
                  <EnhancedMarker key={event.id} event={event} style={style} />
                )
              })}
          </MapContainer>
        </div>
      </div>
    </div>
  )
}

export default App 