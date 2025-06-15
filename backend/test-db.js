const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

console.log('🔍 Database Connection Test');
console.log('==========================');

// Display environment variables (without showing password)
console.log('Environment variables:');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
console.log('NODE_ENV:', process.env.NODE_ENV || 'Not set');

if (!process.env.DATABASE_URL) {
  console.error('❌ DATABASE_URL is not set in environment variables');
  console.log('\n💡 Expected format: postgresql://username:password@host:port/database');
  console.log('   Example: postgresql://telegram_user:your_password@aminalam.info:5433/telegram_monitor');
  process.exit(1);
}

// Parse DATABASE_URL to show connection details
try {
  const url = new URL(process.env.DATABASE_URL);
  console.log('\n📋 Connection Details:');
  console.log('Host:', url.hostname);
  console.log('Port:', url.port);
  console.log('Database:', url.pathname.slice(1));
  console.log('Username:', url.username);
  console.log('Password:', url.password ? '[HIDDEN]' : 'Not provided');
} catch (err) {
  console.error('❌ Invalid DATABASE_URL format:', err.message);
  process.exit(1);
}

// Test connection
async function testConnection() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000, // 10 seconds timeout
  });

  try {
    console.log('\n🔗 Attempting to connect...');
    const client = await pool.connect();
    
    console.log('✅ Connection successful!');
    
    // Test a simple query
    console.log('\n📊 Testing query...');
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Query successful!');
    console.log('Current time:', result.rows[0].current_time);
    console.log('PostgreSQL version:', result.rows[0].pg_version);
    
    // Test if the messages table exists
    console.log('\n🗃️  Checking if messages table exists...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'messages'
      );
    `);
    
    if (tableCheck.rows[0].exists) {
      console.log('✅ Messages table exists');
      
      // Count messages
      const countResult = await client.query('SELECT COUNT(*) as message_count FROM messages');
      console.log('📊 Total messages:', countResult.rows[0].message_count);
    } else {
      console.log('⚠️  Messages table does not exist');
    }
    
    client.release();
    await pool.end();
    
    console.log('\n🎉 All tests passed! The database connection is working.');
    
  } catch (err) {
    console.error('\n❌ Connection failed:', err.message);
    console.error('Error code:', err.code);
    
    if (err.code === 'ENOTFOUND') {
      console.error('💡 This means the hostname could not be resolved. Check if "aminalam.info" is accessible.');
    } else if (err.code === 'ECONNREFUSED') {
      console.error('💡 Connection refused. The database server might not be running on port 5433.');
    } else if (err.code === '28P01') {
      console.error('💡 Authentication failed. Check username/password.');
    } else if (err.code === '3D000') {
      console.error('💡 Database does not exist.');
    }
    
    await pool.end();
    process.exit(1);
  }
}

testConnection(); 