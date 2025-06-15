# WarHeadliner

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![React](https://img.shields.io/badge/React-18.x-blue.svg)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)

**WarHeadliner** is a real-time incident monitoring and visualization platform designed to track, analyze, and display geospatial events with comprehensive media support and advanced filtering capabilities.

## Overview

WarHeadliner provides real-time monitoring and visualization of incidents through an interactive map interface. The platform aggregates data from multiple sources, processes media content, and presents information in an accessible, multilingual interface supporting both English and Persian languages.

**Live Demo:** [war.AminAlam.info](https://war.AminAlam.info)

## Key Features

### Real-Time Monitoring
- **Live Data Streaming**: Continuous updates with configurable refresh intervals
- **Geospatial Visualization**: Interactive map with custom markers and clustering
- **Event Classification**: Automated categorization of incidents by type
- **Time-based Filtering**: Flexible time range selection (1 hour to all-time)

### Advanced Media Processing
- **Multi-format Support**: Images and videos with automatic format detection
- **Intelligent Filtering**: Dynamic media filtering based on quality metrics
- **Gallery Interface**: Full-screen media viewer with navigation controls
- **Thumbnail Generation**: Optimized preview generation for performance

### User Interface & Experience
- **Responsive Design**: Mobile-optimized interface with touch controls
- **Multilingual Support**: English and Persian (RTL) language support
- **Performance Optimization**: Debounced updates and lazy loading
- **Export Functionality**: High-resolution map export with watermarking

### Data Management
- **RESTful API**: Comprehensive backend API for data access
- **Statistical Analytics**: Real-time statistics and metrics
- **Filtering System**: Advanced filtering by type, time, and location
- **Boundary-based Loading**: Efficient data loading based on map viewport

## 🏗️ Architecture

### Frontend Stack
- **React 18+**: Modern React with hooks and functional components
- **Leaflet**: Interactive mapping with custom marker system
- **Axios**: HTTP client for API communication
- **Date-fns**: Date manipulation and formatting
- **HTML2Canvas**: Client-side image generation

### Backend Integration
- RESTful API endpoints for data retrieval
- Media serving with optimized delivery
- Real-time statistics computation
- Geospatial data processing

### Performance Features
- **Mobile Optimization**: Reduced animations and simplified markers on mobile
- **Debounced Updates**: Throttled map updates for smooth performance
- **Lazy Loading**: Progressive content loading
- **Memory Management**: Efficient cleanup and garbage collection

## 🚀 Getting Started

### Prerequisites
- Node.js (v16 or higher)
- npm or yarn package manager
- Modern web browser with JavaScript enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AminAlam/WarHeadliner.git
   cd WarHeadliner
   ```

2. **Install dependencies**
   ```bash
   # Frontend dependencies
   cd frontend
   npm install
   
   # Backend dependencies (if applicable)
   cd ../backend
   npm install
   ```

3. **Environment Configuration**
   ```bash
   # Create environment file
   cp .env.example .env
   
   # Configure API endpoints and settings
   # Edit .env with your specific configuration
   ```

4. **Start Development Server**
   ```bash
   # Frontend development server
   cd frontend
   npm start
   
   # Backend server (separate terminal)
   cd backend
   npm start
   ```

5. **Access the application**
   Open [http://localhost:3000](http://localhost:3000) in your browser

### Production Deployment

1. **Build the application**
   ```bash
   cd frontend
   npm run build
   ```

2. **Configure web server**
   - Serve the `build` directory using your preferred web server
   - Configure reverse proxy for API endpoints
   - Set up SSL certificates for production use

3. **Environment Variables**
   ```bash
   REACT_APP_API_BASE_URL=https://your-api-domain.com
   REACT_APP_MAP_ATTRIBUTION=Your Map Attribution
   ```

## 📡 API Integration

### Core Endpoints

#### Events API
```http
GET /api/events
```
Parameters:
- `hours`: Time range filter (1, 6, 12, 24, 48, or 'all')
- `types`: Event type filter (comma-separated)
- `bounds`: Geographic boundary filter

#### Statistics API
```http
GET /api/stats
```
Parameters:
- `hours`: Time range for statistics calculation

#### Media API
```http
GET /api/media/{fileId}
```
Serves media files with optimized delivery and caching.

#### Messages API
```http
GET /api/messages
```
Parameters:
- `limit`: Number of messages per page
- `page`: Page number for pagination

### Response Format
```json
{
  "id": "unique_identifier",
  "latitude": 32.4279,
  "longitude": 53.6880,
  "message_timestamp": "2024-01-01T12:00:00Z",
  "message_text": "Event description",
  "channel_name": "Source channel",
  "official_location": "Location name",
  "extracted_location": "Extracted location",
  "media": "file1;file2;file3",
  "is_air_attack": true,
  "is_air_defence": false,
  "is_electricity_shortage": false,
  "is_water_shortage": false,
  "is_unknown_explosion": false
}
```

## 🎨 Customization

### Event Types
The system supports multiple event classifications:
- **Air Attack**: High-priority incidents with red markers
- **Air Defence**: Defense-related events with blue markers
- **Electricity Shortage**: Infrastructure issues with orange markers
- **Water Shortage**: Utility disruptions with purple markers
- **Unknown Explosion**: Unclassified explosive events with gray markers
- **Other**: General incidents with light gray markers

### Styling
- CSS custom properties for easy theme customization
- Responsive breakpoints for mobile optimization
- RTL language support with automatic layout adjustment

### Performance Tuning
```javascript
// Mobile-specific optimizations
const performanceMode = {
  reduceAnimations: isMobile,
  simplifyMarkers: isMobile,
  limitMarkers: isMobile ? 50 : 200,
  reducedUpdateFrequency: isMobile ? 60000 : 30000
}
```

## 📱 Mobile Support

- **Touch Controls**: Optimized touch interactions for mobile devices
- **Responsive Layout**: Adaptive interface for various screen sizes
- **Performance Mode**: Automatic mobile optimizations
- **Gesture Support**: Native mobile gestures for map navigation

## 🌐 Internationalization

### Supported Languages
- **English**: Full feature support with LTR layout
- **Persian (Farsi)**: Complete RTL layout with localized content

### Adding New Languages
1. Add translation object to `translations` in `App.jsx`
2. Include RTL/LTR layout handling if needed
3. Update language selector component

## 🔧 Development

### Code Structure
```
frontend/
├── src/
│   ├── App.jsx          # Main application component
│   ├── App.css          # Global styles
│   └── index.js         # Application entry point
├── public/              # Static assets
└── package.json         # Dependencies and scripts
```

### Key Components
- **MapContainer**: Interactive map with real-time updates
- **IncidentCard**: Individual incident display with media
- **EnhancedMarker**: Custom map markers with animations
- **Gallery Modal**: Full-screen media viewer

### Performance Monitoring
- React DevTools for component profiling
- Network monitoring for API optimization
- Memory usage tracking for long-running sessions

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch**
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. **Make your changes**
4. **Add tests if applicable**
5. **Commit your changes**
   ```bash
   git commit -m "Add your descriptive commit message"
   ```
6. **Push to the branch**
   ```bash
   git push origin feature/your-feature-name
   ```
7. **Open a Pull Request**

### Development Guidelines
- Follow React best practices and hooks patterns
- Maintain responsive design principles
- Ensure accessibility compliance
- Add comments for complex logic
- Test on multiple devices and browsers

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **OpenStreetMap**: For providing map tiles and geographic data
- **Leaflet**: For the excellent mapping library
- **React Community**: For the robust ecosystem and tools
- **Contributors**: For their valuable contributions and feedback

## 📞 Support

For support, bug reports, or feature requests:
- **GitHub Issues**: [Create an issue](https://github.com/AminAlam/WarHeadliner/issues)
- **Email**: Contact through GitHub profile
- **Documentation**: Check the wiki for detailed guides

---

**Built with ❤️ for real-time incident monitoring and public awareness.** 