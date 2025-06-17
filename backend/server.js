const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const axios = require('axios');
const { createServer } = require('http');
const { Server } = require('socket.io');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["https://war.aminalam.info", "http://localhost:3000"],
    methods: ["GET", "POST"],
    credentials: true
  }
});

const port = process.env.PORT || 3001;

// Database connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // max number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
  // The pool will automatically remove the client and create a new one.
  // No need to exit the process.
});

// Helper function to execute database queries safely
async function executeQuery(query, params = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check with database status
app.get('/health', async (req, res) => {
  let dbStatus = 'unknown';
  try {
    await pool.query('SELECT 1');
    dbStatus = 'connected';
  } catch (err) {
    dbStatus = 'disconnected';
    console.error('Health check database error:', err.message);
  }
  
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    database: dbStatus
  });
});

// Get all events with location for map display
app.get('/api/events', async (req, res) => {
  try {
    const { hours = 24, types, channels } = req.query;
    
    let whereClause = `WHERE latitude IS NOT NULL AND longitude IS NOT NULL`;
    
    // Apply time filter unless explicitly set to 'all'
    if (hours !== 'all') {
      whereClause += ` AND message_timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'`;
    }
    
    if (types) {
      const typeFilters = types.split(',').map(type => {
        switch(type) {
          case 'air_attack': return 'is_air_attack = true';
          case 'air_defence': return 'is_air_defence = true';
          case 'electricity_shortage': return 'is_electricity_shortage = true';
          case 'water_shortage': return 'is_water_shortage = true';
          case 'unknown_explosion': return 'is_unknown_explosion = true';
          default: return null;
        }
      }).filter(Boolean);
      
      if (typeFilters.length > 0) {
        whereClause += ` AND (${typeFilters.join(' OR ')})`;
      }
    }

    if (channels) {
      const channelFilters = channels.split(',').map(channel => `'${channel.replace(/'/g, "''")}'`);
      if (channelFilters.length > 0) {
        whereClause += ` AND channel_name IN (${channelFilters.join(',')})`;
      }
    }

    const query = `
      SELECT 
        id,
        message_text,
        message_timestamp,
        is_air_attack,
        is_air_defence,
        is_electricity_shortage,
        is_water_shortage,
        is_unknown_explosion,
        extracted_location,
        official_location,
        latitude,
        longitude,
        channel_name,
        media
      FROM messages 
      ${whereClause}
      ORDER BY message_timestamp DESC
      LIMIT 1000
    `;

    const result = await executeQuery(query);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all unique channel names
app.get('/api/channels', async (req, res) => {
  try {
    const query = `
      SELECT DISTINCT channel_name 
      FROM messages 
      WHERE channel_name IS NOT NULL 
      ORDER BY channel_name
    `;
    const result = await executeQuery(query);
    res.json(result.rows.map(row => row.channel_name));
  } catch (error) {
    console.error('Error fetching channels:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const { hours } = req.query; // No default value

    let timeFilterQuery = '';
    // If hours is provided and not 'all', apply the time filter
    if (hours && hours !== 'all') {
      const parsedHours = parseInt(hours, 10);
      if (!isNaN(parsedHours)) {
        timeFilterQuery = `WHERE message_timestamp > NOW() - INTERVAL '${parsedHours} hours'`;
      }
    }

    const query = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(CASE WHEN is_air_attack THEN 1 END) as air_attacks,
        COUNT(CASE WHEN is_air_defence THEN 1 END) as air_defence,
        COUNT(CASE WHEN is_electricity_shortage THEN 1 END) as electricity_shortages,
        COUNT(CASE WHEN is_water_shortage THEN 1 END) as water_shortages,
        COUNT(CASE WHEN is_unknown_explosion THEN 1 END) as unknown_explosions,
        COUNT(CASE WHEN latitude IS NOT NULL THEN 1 END) as messages_with_location
      FROM messages 
      ${timeFilterQuery}
    `;

    const result = await executeQuery(query);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get recent messages
app.get('/api/messages', async (req, res) => {
  try {
    const { limit = 50 } = req.query;
    
    const query = `
      SELECT 
        id,
        message_text,
        message_timestamp,
        is_air_attack,
        is_air_defence,
        is_electricity_shortage,
        is_water_shortage,
        is_unknown_explosion,
        extracted_location,
        official_location,
        channel_name,
        media
      FROM messages 
      ORDER BY message_timestamp DESC
      LIMIT $1
    `;

    const result = await executeQuery(query, [parseInt(limit)]);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get media from Telegram API
app.get('/api/media/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    
    if (!botToken) {
      console.error('TELEGRAM_BOT_TOKEN environment variable not set');
      return res.status(500).json({ error: 'Telegram bot token not configured' });
    }
    
    const encodedFileId = encodeURIComponent(fileId);
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/getFile?file_id=${encodedFileId}`;
    
    const fileInfoResponse = await axios.get(telegramApiUrl, { timeout: 15000 });
    
    if (!fileInfoResponse.data.ok || !fileInfoResponse.data.result.file_path) {
      console.error('Telegram API error or file_path missing:', fileInfoResponse.data);
      return res.status(404).json({ 
        error: 'File not found on Telegram or path is missing',
        telegramError: fileInfoResponse.data.description 
      });
    }
    
    const filePath = fileInfoResponse.data.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${botToken}/${filePath}`;
    
    // --- START: REDIRECT LOGIC ---
    // Instead of proxying, redirect the client directly to the temporary Telegram URL.
    // This offloads all bandwidth usage from our server to Telegram's.
    res.redirect(302, fileUrl);
    // --- END: REDIRECT LOGIC ---

  } catch (error) {
    console.error('Error in /api/media/ handler:', error.message);
    if (error.response) {
      console.error('Error details:', { status: error.response.status, data: error.response.data });
    }
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Failed to process media request',
        details: error.message 
      });
    }
  }
});

// Add this before the WebSocket connection handling
let onlineUsers = 0;

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('Client connected');
  onlineUsers++;
  io.emit('viewer_count_update', onlineUsers);

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    onlineUsers--;
    io.emit('viewer_count_update', onlineUsers);
  });

  // Handle real-time updates
  socket.on('subscribe', async (filters) => {
    try {
      // Query based on filters
      const whereClause = buildWhereClause(filters);
      const query = `
        SELECT * FROM messages 
        ${whereClause}
        ORDER BY message_timestamp DESC
        LIMIT 1000
      `;
      const result = await executeQuery(query);
      socket.emit('initialData', result.rows);
    } catch (error) {
      console.error('Error fetching data:', error);
      socket.emit('error', { message: 'Error fetching data' });
    }
  });
});

// Helper function to build WHERE clause
function buildWhereClause(filters) {
  const { hours, types } = filters;
  let whereClause = `WHERE latitude IS NOT NULL AND longitude IS NOT NULL`;
  
  // Handle time filtering consistently with the REST API
  // If hours is undefined, null, or not 'all', apply the time filter
  if (hours !== 'all') {
    const hoursToFilter = hours || 24; // Default to 24 hours if not specified
    whereClause += ` AND message_timestamp > NOW() - INTERVAL '${parseInt(hoursToFilter)} hours'`;
  }
  
  if (types && types.length > 0) {
    const typeFilters = types.map(type => {
      switch(type) {
        case 'air_attack': return 'is_air_attack = true';
        case 'air_defence': return 'is_air_defence = true';
        case 'electricity_shortage': return 'is_electricity_shortage = true';
        case 'water_shortage': return 'is_water_shortage = true';
        case 'unknown_explosion': return 'is_unknown_explosion = true';
        default: return null;
      }
    }).filter(Boolean);
    
    if (typeFilters.length > 0) {
      whereClause += ` AND (${typeFilters.join(' OR ')})`;
    }
  }
  
  return whereClause;
}

// Use httpServer instead of app.listen
httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('WebSocket server is ready');
  console.log('Database connection pool established');
});