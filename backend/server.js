const express = require('express');
const { Client } = require('pg');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const app = express();
const port = process.env.PORT || 3001;

// Database connection helper - creates connection only when needed
async function createDatabaseConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 5000,
  });
  
  await client.connect();
  return client;
}

// Helper function to execute database queries safely
async function executeQuery(query, params = []) {
  let client;
  try {
    client = await createDatabaseConnection();
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error('Database query error:', error.message);
    throw error;
  } finally {
    if (client) {
      await client.end();
    }
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
    await executeQuery('SELECT 1');
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
    const { hours = 24, types } = req.query;
    
    let whereClause = `WHERE latitude IS NOT NULL AND longitude IS NOT NULL 
                      AND message_timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'`;
    
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
        channel_name
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

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const { hours = 24 } = req.query;
    
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
      WHERE message_timestamp > NOW() - INTERVAL '${parseInt(hours)} hours'
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
        channel_name
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

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
  console.log('Database connections will be created on-demand for each request');
});