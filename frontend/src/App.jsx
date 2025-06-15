import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import axios from 'axios'
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet'
import { format } from 'date-fns'
import 'leaflet/dist/leaflet.css'
import './App.css'
import L from 'leaflet'
import icon from 'leaflet/dist/images/marker-icon.png'
import iconShadow from 'leaflet/dist/images/marker-shadow.png'
import html2canvas from 'html2canvas'
import io from 'socket.io-client'

const socket = io({ path: '/socket.io' });

// Fix for default markers in react-leaflet
L.Marker.prototype.options.icon = L.divIcon({
  html: '<div style="background-color: red; width: 20px; height: 20px; border-radius: 50%; border: 2px solid white;"></div>',
  iconSize: [20, 20],
  iconAnchor: [10, 10]
})

// Component to store map reference and track bounds
function MapRef({ onBoundsChange }) {
  const map = useMap()
  
  useEffect(() => {
    window.leafletMapInstance = map
  }, [map])
  
  useEffect(() => {
    if (!onBoundsChange) return
    
    // Debounce function to prevent excessive calls
    let timeoutId = null
    
    const debouncedBoundsChange = () => {
      if (timeoutId) clearTimeout(timeoutId)
      const debounceTime = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? 200 : 100
      timeoutId = setTimeout(() => {
        const bounds = map.getBounds()
        if (bounds && bounds.isValid()) {
          onBoundsChange(bounds)
        }
      }, debounceTime) // Longer debounce on mobile for better performance
    }
    
    // Initial bounds after a short delay to ensure map is ready
    const initialTimeout = setTimeout(() => {
      const bounds = map.getBounds()
      if (bounds && bounds.isValid()) {
        onBoundsChange(bounds)
      }
    }, 500)
    
    // Listen for map move events
    map.on('moveend', debouncedBoundsChange)
    map.on('zoomend', debouncedBoundsChange)
    
    // Cleanup
    return () => {
      if (timeoutId) clearTimeout(timeoutId)
      clearTimeout(initialTimeout)
      map.off('moveend', debouncedBoundsChange)
      map.off('zoomend', debouncedBoundsChange)
    }
  }, [map, onBoundsChange])
  
  return null
}

// Memoized Incident Card component for better performance
const IncidentCard = React.memo(({ 
  incident, 
  isSelected, 
  onSelect, 
  getIncidentStyle, 
  getEventType, 
  formatTime,
  onOpenGallery
}) => {
  const handleClick = useCallback(() => {
    onSelect(incident)
  }, [incident, onSelect])

  const style = useMemo(() => getIncidentStyle(incident), [incident, getIncidentStyle])
  const eventType = useMemo(() => getEventType(incident), [incident, getEventType])

  // Parse media field and create media URLs
  const [filteredMedia, setFilteredMedia] = useState([])
  const [mediaLoading, setMediaLoading] = useState(false)

  const allMediaFiles = useMemo(() => {
    if (!incident.media || incident.media.trim() === '') return []
    
    const fileIds = incident.media.split(';')
      .filter(fileId => fileId.trim() !== '')
      .map(fileId => fileId.trim())
    
    return fileIds.map(fileId => ({
      fileId,
      url: `/api/media/${fileId}`,
      isVideo: isVideoFileId(fileId)
    }))
  }, [incident.media])

  // Filter images by actual dimensions
  useEffect(() => {
    if (allMediaFiles.length === 0) {
      setFilteredMedia([])
      return
    }

    setMediaLoading(true)
    const promises = allMediaFiles.map(media => {
      if (media.isVideo) {
        // Keep all videos - let the player handle loading/errors
        return Promise.resolve({ ...media, include: true })
      }

      // Check image dimensions - More mobile-friendly filtering
      return new Promise((resolve) => {
        const img = new Image()
        img.onload = () => {
          // More flexible filtering: include images that are at least 200px wide OR 150px tall
          // This prevents tiny thumbnails/icons while allowing mobile-sized images
          const isValidSize = img.width >= 200 || img.height >= 150
          
          // Check aspect ratio - filter out very thin or very wide images
          const aspectRatio = Math.min(img.width / img.height, img.height / img.width)
          const hasGoodRatio = aspectRatio >= 0.3
          
          resolve({ 
            ...media, 
            include: isValidSize && hasGoodRatio,
            width: img.width,
            height: img.height,
            aspectRatio: aspectRatio
          })
        }
        img.onerror = () => {
          resolve({ ...media, include: false })
        }
        img.src = media.url
      })
    })

    Promise.all(promises).then(results => {
      const filtered = results.filter(result => result.include)
      setFilteredMedia(filtered)
      setMediaLoading(false)
      
      // Debug logging
      console.log('Media filtering results:')
      results.forEach(result => {
        if (!result.isVideo) {
          console.log(`Image ${result.fileId}: ${result.width}x${result.height} - ${result.include ? 'INCLUDED' : 'EXCLUDED'}`)
        }
      })
    })
  }, [allMediaFiles])

  const mediaFiles = filteredMedia

  const handleMediaClick = useCallback((e, index) => {
    e.stopPropagation()
    onOpenGallery(mediaFiles, index)
  }, [mediaFiles, onOpenGallery])

  return (
    <div 
      className={`incident-card ${isSelected ? 'selected' : ''}`}
      onClick={handleClick}
    >
      <div className="incident-card-layout">
        {/* Media section on the left */}
        <div className="incident-media-section">
          {mediaLoading && allMediaFiles.length > 0 && (
            <div className="incident-media-loading">
              <div className="media-loading-spinner"></div>
              <span>Loading...</span>
            </div>
          )}
          {!mediaLoading && mediaFiles.length > 0 && (
            <div className="incident-media">
              {mediaFiles.slice(0, 2).map((media, index) => (
                <div key={media.fileId} className="media-item">
                  {media.isVideo ? (
                    <div className="video-thumbnail" onClick={(e) => handleMediaClick(e, index)}>
                      <video 
                        src={media.url} 
                        muted
                        playsInline
                        preload="metadata"
                        onError={(e) => {
                          // More graceful error handling - show placeholder instead of hiding
                          const error = e.target.error || {};
                          console.warn('Video failed to load:', media.url, `code: ${error.code}`, `message: ${error.message}`)
                          e.target.style.display = 'none'
                          // Show error placeholder
                          const placeholder = document.createElement('div')
                          placeholder.className = 'video-error-placeholder'
                          placeholder.innerHTML = '📹'
                          placeholder.style.cssText = `
                            width: 100%;
                            height: 100%;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: rgba(107, 114, 128, 0.3);
                            border-radius: 0.5rem;
                            font-size: 1.2rem;
                          `
                          e.target.parentElement.appendChild(placeholder)
                        }}
                      />
                      <div className="video-play-icon">▶</div>
                    </div>
                  ) : (
                    <img 
                      src={media.url} 
                      alt={`Media ${index + 1}`}
                      onError={(e) => {
                        e.target.style.display = 'none'
                      }}
                      onClick={(e) => handleMediaClick(e, index)}
                    />
                  )}
                </div>
              ))}
              {mediaFiles.length > 2 && (
                <div 
                  className="media-count"
                  onClick={(e) => handleMediaClick(e, 0)}
                >
                  +{mediaFiles.length - 2}
                </div>
              )}
            </div>
          )}
          {!mediaLoading && mediaFiles.length === 0 && (
            <div className="no-media-placeholder">
              <div 
                className="incident-type-indicator"
                style={{ backgroundColor: style.color }}
              ></div>
            </div>
          )}
        </div>

        {/* Text content on the right */}
        <div className="incident-text-content">
          {/* First row: Time, Title, Channel */}
          <div className="incident-first-row">
            <div className="incident-time">
              {formatTime(new Date(incident.message_timestamp), 'HH:mm')}
            </div>
            <div 
              className="incident-type-text"
              title={eventType}
            >
              {eventType}
            </div>
            <div 
              className="incident-channel"
              title={incident.channel_name}
            >
              {incident.channel_name}
            </div>
          </div>

          {/* Second row: Location and Message */}
          <div className="incident-second-row">
            <div 
              className="incident-location"
              title={incident.official_location || incident.extracted_location}
            >
              {incident.official_location || incident.extracted_location}
            </div>
            {incident.message_text && (
              <div 
                className="incident-message"
                title={incident.message_text}
              >
                {incident.message_text.length > 100 
                  ? incident.message_text.substring(0, 100) + '...' 
                  : incident.message_text}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
})

// Enhanced Marker component with realistic fade effects
const EnhancedMarker = React.memo(({ event, style }) => {
  const map = useMap()
  const [markerId] = useState(() => `marker-${event.id}`)
  const [marker, setMarker] = useState(null)
  
  // Create stable references to prevent unnecessary re-renders
  const eventId = event.id
  const eventLat = event.latitude
  const eventLng = event.longitude
  
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
    
    // Parse media for popup - for now just show first 3 files, filtering will be done by the components
    const rawFileIds = event.media && event.media.trim() !== '' 
      ? event.media.split(';').filter(fileId => fileId.trim() !== '').map(fileId => fileId.trim()).slice(0, 3)
      : []
    
    const mediaHtml = rawFileIds.length > 0 
      ? `<div class="popup-media">
           ${rawFileIds.map(fileId => {
             const isVideo = isVideoFileId(fileId)
             return isVideo 
               ? `<div class="popup-video-thumb" onclick="window.open('/api/media/${fileId}', '_blank')">
                    <video src="/api/media/${fileId}" muted preload="metadata" class="popup-media-video" 
                           onerror="
                             console.warn('Popup video failed to load:', '${fileId}');
                             this.style.display='none';
                             const placeholder = document.createElement('div');
                             placeholder.innerHTML = '📹';
                             placeholder.style.cssText = 'width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(107,114,128,0.3);border-radius:0.375rem;font-size:1rem;';
                             this.parentElement.appendChild(placeholder);
                           "></video>
                    <div class="popup-video-play">▶</div>
                  </div>`
               : `<img src="/api/media/${fileId}" alt="Media" class="popup-media-img" 
                       onclick="window.open('/api/media/${fileId}', '_blank')"
                       onerror="this.style.display='none'"
                       onload="
                         const aspectRatio = Math.min(this.naturalWidth / this.naturalHeight, this.naturalHeight / this.naturalWidth);
                         if ((this.naturalWidth < 200 && this.naturalHeight < 150) || aspectRatio < 0.3) {
                           this.style.display='none';
                         }
                       ">`
           }).join('')}
         </div>`
      : ''

    // Create marker only once
    const newMarker = L.marker([eventLat, eventLng], { icon: customIcon })
      .bindPopup(`
        <div class="popup-content">
          ${mediaHtml}
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
    
    newMarker.addTo(map)
    setMarker(newMarker)
    
    // Cleanup function
    return () => {
      if (newMarker) {
        map.removeLayer(newMarker)
      }
      const gradientElement = document.getElementById(gradientId)
      if (gradientElement) {
        gradientElement.remove()
      }
    }
  }, [eventId, eventLat, eventLng, map, markerId]) // Only re-create if essential props change
  
  return null
})

// Helper function to get event type (moved outside component for reuse)
function getEventType(event) {
  if (event.is_air_attack) return 'Air Attack'
  if (event.is_air_defence) return 'Air Defence'
  if (event.is_electricity_shortage) return 'Electricity Shortage'
  if (event.is_water_shortage) return 'Water Shortage'
  if (event.is_unknown_explosion) return 'Unknown Explosion'
  return 'Other'
}

// Helper function to detect video files based on Telegram file ID patterns
function isVideoFileId(fileId) {
  // Telegram video file IDs typically start with 'BAA' or contain 'video' patterns
  // This is a heuristic based on common Telegram file ID patterns
  return fileId.startsWith('BAA') || fileId.includes('video') || fileId.startsWith('CgA')
}

// Simple approach: load all images and filter by actual dimensions

// Translation object
const translations = {
  en: {
    appTitle: 'Iran-Israel War Monitor',
    sidebarTitle: 'WarHeadliner',
    statistics: 'Statistics',
    messages: 'Messages', 
    filters: 'Filters',
    totalMessages: 'Total Incidents',
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
    motivationalMessage: 'Iranian people will win this fight',
    incidentsInView: 'incidents in view',
    showing: 'showing',
    loadMore: 'Load More',
    more: 'more'
  },
  fa: {
    appTitle: 'مانیتور جنگ ایران-اسرائیل',
    sidebarTitle: 'مانیتور جنگ',
    statistics: 'آمار',
    messages: 'رویدادها',
    filters: 'فیلترها',
    totalMessages: 'کل رویدادها',
    airAttacks: 'حملات هوایی',
    airDefence: 'پدافند هوایی',
    electricityIssues: 'مشکلات برق',
    waterIssues: 'مشکلات آب',
    unknownExplosions: 'انفجارهای نامشخص',
    recentMessages: 'رویدادهای اخیر',
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
    message: 'رویداد',
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
    motivationalMessage: 'مردم ایران در این نبرد پیروز خواهند شد',
    incidentsInView: 'رویداد در نمایش',
    showing: 'نمایش',
    loadMore: 'بارگذاری بیشتر',
    more: 'بیشتر'
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
  const [mapBounds, setMapBounds] = useState(null)
  const [incidentsInView, setIncidentsInView] = useState([])
  const [selectedIncident, setSelectedIncident] = useState(null)
  const [bottomMenuDisplayCount, setBottomMenuDisplayCount] = useState(50)
  const [galleryModal, setGalleryModal] = useState({ isOpen: false, images: [], currentIndex: 0 })

  // Mobile performance detection
  const isMobile = useMemo(() => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           window.innerWidth <= 768
  }, [])
  
  // Performance flags for mobile
  const performanceMode = useMemo(() => ({
    reduceAnimations: isMobile,
    simplifyMarkers: isMobile,
    limitMarkers: isMobile ? 50 : 200, // Limit markers on mobile
    reducedUpdateFrequency: isMobile ? 60000 : 30000, // Less frequent updates on mobile
    optimizeScrolling: isMobile
  }), [isMobile])

  // Translation helper function
  const t = (key) => translations[language][key] || key

  // Update document title when language changes
  useEffect(() => {
    document.title = t('appTitle')
  }, [language])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, performanceMode.reducedUpdateFrequency)
    return () => clearInterval(interval)
  }, [timeFilter, typeFilter, performanceMode.reducedUpdateFrequency])

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

  // Memoized styles to prevent unnecessary re-renders with mobile optimizations
  const incidentStyles = useMemo(() => {
    const baseStyles = {
      air_attack: {
        color: '#ef4444',
        fillColor: '#ef4444',
        fillOpacity: 0.4,
        weight: 2,
        radius: performanceMode.simplifyMarkers ? 6 : 7.5,
        gradientColors: performanceMode.simplifyMarkers 
          ? ['#ef4444', '#dc2626'] 
          : ['#ef4444', '#dc2626', '#b91c1c', 'rgba(239, 68, 68, 0.1)'],
        pulseAnimation: !performanceMode.reduceAnimations
      },
      air_defence: {
        color: '#3b82f6',
        fillColor: '#3b82f6',
        fillOpacity: 0.4,
        weight: 2,
        radius: performanceMode.simplifyMarkers ? 5 : 6,
        gradientColors: performanceMode.simplifyMarkers 
          ? ['#3b82f6', '#2563eb'] 
          : ['#3b82f6', '#2563eb', '#1d4ed8', 'rgba(59, 130, 246, 0.1)'],
        pulseAnimation: !performanceMode.reduceAnimations
      },
      electricity_shortage: {
        color: '#f59e0b',
        fillColor: '#f59e0b',
        fillOpacity: 0.3,
        weight: 2,
        radius: performanceMode.simplifyMarkers ? 3 : 4,
        gradientColors: performanceMode.simplifyMarkers 
          ? ['#f59e0b', '#d97706'] 
          : ['#f59e0b', '#d97706', '#b45309', 'rgba(245, 158, 11, 0.1)'],
        pulseAnimation: false
      },
      water_shortage: {
        color: '#8b5cf6',
        fillColor: '#8b5cf6',
        fillOpacity: 0.3,
        weight: 2,
        radius: performanceMode.simplifyMarkers ? 3 : 4,
        gradientColors: performanceMode.simplifyMarkers 
          ? ['#8b5cf6', '#7c3aed'] 
          : ['#8b5cf6', '#7c3aed', '#6d28d9', 'rgba(139, 92, 246, 0.1)'],
        pulseAnimation: false
      },
      unknown_explosion: {
        color: '#6b7280',
        fillColor: '#6b7280',
        fillOpacity: 0.3,
        weight: 2,
        radius: performanceMode.simplifyMarkers ? 4 : 5,
        gradientColors: performanceMode.simplifyMarkers 
          ? ['#6b7280', '#4b5563'] 
          : ['#6b7280', '#4b5563', '#374151', 'rgba(107, 114, 128, 0.1)'],
        pulseAnimation: !performanceMode.reduceAnimations
      },
      other: {
        color: '#64748b',
        fillColor: '#64748b',
        fillOpacity: 0.2,
        weight: 2,
        radius: performanceMode.simplifyMarkers ? 2 : 3,
        gradientColors: performanceMode.simplifyMarkers 
          ? ['#64748b', '#475569'] 
          : ['#64748b', '#475569', '#334155', 'rgba(100, 116, 139, 0.1)'],
        pulseAnimation: false
      }
    }
    return baseStyles
  }, [performanceMode])

  const getIncidentStyle = useCallback((event) => {
    if (event.is_air_attack) return incidentStyles.air_attack
    if (event.is_air_defence) return incidentStyles.air_defence
    if (event.is_electricity_shortage) return incidentStyles.electricity_shortage
    if (event.is_water_shortage) return incidentStyles.water_shortage
    if (event.is_unknown_explosion) return incidentStyles.unknown_explosion
    return incidentStyles.other
  }, [incidentStyles])

  const getIncidentTypeKey = useCallback((event) => {
    // Use priority order (most specific first) - for styling and primary categorization
    if (event.is_air_attack) return 'air_attack'
    if (event.is_air_defence) return 'air_defence'
    if (event.is_electricity_shortage) return 'electricity_shortage'
    if (event.is_water_shortage) return 'water_shortage'
    if (event.is_unknown_explosion) return 'unknown_explosion'
    return 'other'
  }, [])

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

  const toggleIncidentType = useCallback((incidentType) => {
    setVisibleIncidents(prev => ({
      ...prev,
      [incidentType]: !prev[incidentType]
    }))
  }, [])

  // Handle map bounds change to filter incidents in view
  const handleBoundsChange = useCallback((bounds) => {
    if (!bounds || !bounds.isValid()) return
    
    // Throttle bounds updates on mobile for better performance
    const now = Date.now()
    if (performanceMode.optimizeScrolling) {
      if (handleBoundsChange.lastUpdate && now - handleBoundsChange.lastUpdate < 300) {
        return // Skip update if too frequent on mobile
      }
      handleBoundsChange.lastUpdate = now
    }
    
    setMapBounds(bounds)
    
    if (events.length > 0) {
      try {
        const incidentsInBounds = events
          .filter(event => {
            if (!event.latitude || !event.longitude) return false
            const lat = parseFloat(event.latitude)
            const lng = parseFloat(event.longitude)
            if (isNaN(lat) || isNaN(lng)) return false
            
            const isInBounds = bounds.contains([lat, lng])
            
            // Check if ANY of the event's flags match visible incident types
            const isVisible = (
              (event.is_air_attack && visibleIncidents.air_attack) ||
              (event.is_air_defence && visibleIncidents.air_defence) ||
              (event.is_electricity_shortage && visibleIncidents.electricity_shortage) ||
              (event.is_water_shortage && visibleIncidents.water_shortage) ||
              (event.is_unknown_explosion && visibleIncidents.unknown_explosion) ||
              (!event.is_air_attack && !event.is_air_defence && !event.is_electricity_shortage && 
               !event.is_water_shortage && !event.is_unknown_explosion && visibleIncidents.other)
            )
            
            return isInBounds && isVisible
          })
          // Don't limit here - we'll limit in the bottom menu display only
        setIncidentsInView(incidentsInBounds)
      } catch (error) {
        console.warn('Error filtering incidents in bounds:', error)
      }
    }
  }, [events, visibleIncidents, performanceMode, getIncidentTypeKey])

  // Update incidents in view when events or visibility changes
  useEffect(() => {
    if (mapBounds && mapBounds.isValid && mapBounds.isValid() && events.length > 0) {
      try {
        const incidentsInBounds = events.filter(event => {
          if (!event.latitude || !event.longitude) return false
          const lat = parseFloat(event.latitude)
          const lng = parseFloat(event.longitude)
          if (isNaN(lat) || isNaN(lng)) return false
          
          // Check if ANY of the event's flags match visible incident types
          const isVisible = (
            (event.is_air_attack && visibleIncidents.air_attack) ||
            (event.is_air_defence && visibleIncidents.air_defence) ||
            (event.is_electricity_shortage && visibleIncidents.electricity_shortage) ||
            (event.is_water_shortage && visibleIncidents.water_shortage) ||
            (event.is_unknown_explosion && visibleIncidents.unknown_explosion) ||
            (!event.is_air_attack && !event.is_air_defence && !event.is_electricity_shortage && 
             !event.is_water_shortage && !event.is_unknown_explosion && visibleIncidents.other)
          )
          
          return mapBounds.contains([lat, lng]) && isVisible
        })
        setIncidentsInView(incidentsInBounds)
      } catch (error) {
        console.warn('Error updating incidents in view:', error)
      }
    }
  }, [events, visibleIncidents, mapBounds, getIncidentTypeKey])

  // Handle incident selection from bottom bar
  const handleIncidentSelect = (incident) => {
    setSelectedIncident(incident)
    if (window.leafletMapInstance) {
      window.leafletMapInstance.setView([incident.latitude, incident.longitude], 12)
    }
  }

  // Handle load more incidents in bottom menu
  const handleLoadMoreIncidents = () => {
    setBottomMenuDisplayCount(prev => prev + 50)
  }

  // Reset bottom menu count when incidents change
  useEffect(() => {
    setBottomMenuDisplayCount(50)
  }, [incidentsInView.length])

  // Gallery modal functions
  const openGallery = (images, startIndex = 0) => {
    setGalleryModal({ isOpen: true, images, currentIndex: startIndex })
  }

  const closeGallery = () => {
    setGalleryModal({ isOpen: false, images: [], currentIndex: 0 })
  }

  const nextImage = () => {
    setGalleryModal(prev => ({
      ...prev,
      currentIndex: (prev.currentIndex + 1) % prev.images.length
    }))
  }

  const prevImage = () => {
    setGalleryModal(prev => ({
      ...prev,
      currentIndex: prev.currentIndex === 0 ? prev.images.length - 1 : prev.currentIndex - 1
    }))
  }

  // Keyboard navigation for gallery
  useEffect(() => {
    if (!galleryModal.isOpen) return

    const handleKeyPress = (e) => {
      switch (e.key) {
        case 'Escape':
          closeGallery()
          break
        case 'ArrowLeft':
          e.preventDefault()
          prevImage()
          break
        case 'ArrowRight':
          e.preventDefault()
          nextImage()
          break
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [galleryModal.isOpen])

  // Update subscription when filters change
  useEffect(() => {
    if (socket) {
      socket.emit('subscribe', { hours: timeFilter, types: typeFilter });
    }
  }, [timeFilter, typeFilter, socket]);

  const exportMapImage = async () => {
    setIsExporting(true)
    
    // Add exporting class to show watermark
    const mapContainer = document.querySelector('.map-container')
    if (!mapContainer) {
      throw new Error('Map container not found')
    }
    mapContainer.classList.add('exporting')
    
    // Temporarily change only the banner text to English
    const bannerElement = document.querySelector('.motivational-banner-map span')
    let originalBannerText = ''
    
    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default

      if (bannerElement) {
        originalBannerText = bannerElement.textContent
        bannerElement.textContent = translations.en.motivationalMessage
        // Wait for banner text change to take effect
        await new Promise(resolve => setTimeout(resolve, 200))
      }

      // Ensure fonts are loaded before export
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready
      }

      // Add a small delay to ensure text is properly rendered
      await new Promise(resolve => setTimeout(resolve, 200))

      // Get the leaflet map instance to get bounds and projection info
      const leafletContainer = mapContainer.querySelector('.leaflet-container')
      const leafletMap = leafletContainer._leaflet_map || window.leafletMapInstance

      // Temporarily hide export button and bottom incident menu
      const exportBtn = document.querySelector('.export-btn')
      const bottomMenu = document.querySelector('.bottom-incident-bar')
      const originalExportDisplay = exportBtn ? exportBtn.style.display : ''
      const originalBottomMenuDisplay = bottomMenu ? bottomMenu.style.display : ''
      
      if (exportBtn) exportBtn.style.display = 'none'
      if (bottomMenu) bottomMenu.style.display = 'none'

      // Wait a bit for any animations to complete
      await new Promise(resolve => setTimeout(resolve, 500))

      // Capture the entire map including the legend
      const mapCanvas = await html2canvas(mapContainer, {
        useCORS: true,
        allowTaint: true,
        scale: 2,
        width: mapContainer.offsetWidth,
        height: mapContainer.offsetHeight,
        backgroundColor: '#0f172a',
        logging: false,
        imageTimeout: 10000,
        ignoreElements: (element) => {
          return element.classList.contains('export-btn') || 
                 element.classList.contains('export-spinner') ||
                 element.classList.contains('export-icon') ||
                 element.classList.contains('bottom-incident-bar')
        }
      })

      // Restore the export button and bottom menu
      if (exportBtn) exportBtn.style.display = originalExportDisplay
      if (bottomMenu) bottomMenu.style.display = originalBottomMenuDisplay

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
          .filter(event => {
            // Check if ANY of the event's flags match visible incident types
            return (
              (event.is_air_attack && visibleIncidents.air_attack) ||
              (event.is_air_defence && visibleIncidents.air_defence) ||
              (event.is_electricity_shortage && visibleIncidents.electricity_shortage) ||
              (event.is_water_shortage && visibleIncidents.water_shortage) ||
              (event.is_unknown_explosion && visibleIncidents.unknown_explosion) ||
              (!event.is_air_attack && !event.is_air_defence && !event.is_electricity_shortage && 
               !event.is_water_shortage && !event.is_unknown_explosion && visibleIncidents.other)
            )
          })
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

      // Legend is already included in the main map capture

      // Add timestamp only (watermark is already captured from the map)
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
      
      // Restore original banner text after export
      if (bannerElement && originalBannerText) {
        bannerElement.textContent = originalBannerText
      }
      
    } catch (error) {
      console.error('Error exporting map:', error)
      alert('Failed to export map. Please try again.')
      
      // Restore original banner text even if export fails
      if (bannerElement && originalBannerText) {
        bannerElement.textContent = originalBannerText
      }
    } finally {
      // Remove exporting class
      mapContainer.classList.remove('exporting')
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
          {/* Messages section disabled */}
          {/* <button 
            className={`nav-item ${activePanel === 'messages' ? 'active' : ''}`}
            onClick={() => handlePanelChange('messages')}
          >
            <span className="nav-icon">📱</span>
            {t('messages')}
          </button> */}
          <button 
            className={`nav-item ${activePanel === 'filters' ? 'active' : ''}`}
            onClick={() => handlePanelChange('filters')}
          >
            <span className="nav-icon">🔧</span>
            {t('filters')}
          </button>
          <button 
            className="nav-item github-link"
            onClick={() => window.open('https://github.com/AminAlam/WarHeadliner', '_blank')}
          >
            <span className="nav-icon">⚡</span>
            GitHub
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

           {/* Messages panel has been disabled */}

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
                // Get style directly from incidentStyles instead of creating a sample event
                const style = incidentStyles[type] || incidentStyles.other
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
            <div className="watermark-line1">Github.com/AminAlam/WarHeadliner</div>
            <div className="watermark-line2">war.AminAlam.info</div>
          </div>

          <MapContainer 
            center={[32.4279, 53.6880]}  // Iran coordinates
            zoom={6} 
            style={{ height: '100%', width: '100%' }}
            className="main-map"
          >
            <MapRef onBoundsChange={handleBoundsChange} />
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {events
              .filter(event => {
                // Check if ANY of the event's flags match visible incident types
                const isVisible = (
                  (event.is_air_attack && visibleIncidents.air_attack) ||
                  (event.is_air_defence && visibleIncidents.air_defence) ||
                  (event.is_electricity_shortage && visibleIncidents.electricity_shortage) ||
                  (event.is_water_shortage && visibleIncidents.water_shortage) ||
                  (event.is_unknown_explosion && visibleIncidents.unknown_explosion) ||
                  (!event.is_air_attack && !event.is_air_defence && !event.is_electricity_shortage && 
                   !event.is_water_shortage && !event.is_unknown_explosion && visibleIncidents.other)
                )
                
                return isVisible
              })
              // Render ALL incidents on the map (no slice limit)
              .map((event) => {
                const style = getIncidentStyle(event)
                return (
                  <EnhancedMarker key={event.id} event={event} style={style} />
                )
              })}
          </MapContainer>

          {/* Bottom Incident Bar */}
          {incidentsInView.length > 0 && (
            <div className="bottom-incident-bar">
              <div className="incident-bar-header">
                <h4>
                  {incidentsInView.length} {t('incidentsInView')}
                  {bottomMenuDisplayCount < incidentsInView.length && 
                    ` (${t('showing')} ${bottomMenuDisplayCount})`
                  }
                </h4>
              </div>
              <div className="incident-bar-scroll">
                {incidentsInView
                  .slice(0, bottomMenuDisplayCount) // Show only up to bottomMenuDisplayCount
                  .map((incident, index) => (
                  <IncidentCard
                    key={incident.id}
                    incident={incident}
                    isSelected={selectedIncident?.id === incident.id}
                    onSelect={handleIncidentSelect}
                    getIncidentStyle={getIncidentStyle}
                    getEventType={getEventType}
                    formatTime={format}
                    onOpenGallery={openGallery}
                  />
                ))}
                
                {/* Load More Button */}
                {bottomMenuDisplayCount < incidentsInView.length && (
                  <div className="load-more-incidents">
                    <button 
                      className="load-more-btn"
                      onClick={handleLoadMoreIncidents}
                    >
                      {t('loadMore')} ({incidentsInView.length - bottomMenuDisplayCount} {t('more')})
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Gallery Modal */}
          {galleryModal.isOpen && (
            <div className="gallery-overlay" onClick={closeGallery}>
              <div className="gallery-modal" onClick={(e) => e.stopPropagation()}>
                <button className="gallery-close" onClick={closeGallery}>×</button>
                
                {galleryModal.images.length > 1 && (
                  <>
                    <button className="gallery-nav gallery-prev" onClick={prevImage}>‹</button>
                    <button className="gallery-nav gallery-next" onClick={nextImage}>›</button>
                  </>
                )}
                
                <div className="gallery-content">
                  {galleryModal.images[galleryModal.currentIndex]?.isVideo ? (
                    <video 
                      src={galleryModal.images[galleryModal.currentIndex]?.url}
                      controls
                      autoPlay
                      muted
                      playsInline
                      className="gallery-video"
                      onError={(e) => {
                        const error = e.target.error || {};
                        console.error('ERRORGallery video load error:', `code: ${error.code}`, `message: ${error.message}`)
                        console.error('ERRORFailed URL:', galleryModal.images[galleryModal.currentIndex]?.url)
                      }}
                      onLoadedMetadata={(e) => {
                        if (e.target.videoHeight === 0) {
                          console.error('Gallery video metadata error:', e)
                          e.target.style.display = 'none'
                        }
                      }}
                    />
                  ) : (
                    <img 
                      src={galleryModal.images[galleryModal.currentIndex]?.url} 
                      alt={`Media ${galleryModal.currentIndex + 1}`}
                      className="gallery-image"
                    />
                  )}
                  
                  {galleryModal.images.length > 1 && (
                    <div className="gallery-counter">
                      {galleryModal.currentIndex + 1} / {galleryModal.images.length}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App 