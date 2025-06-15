const net = require('net');

console.log('🌐 Network Connectivity Test');
console.log('============================');

const host = 'aminalam.info';
const port = 5433;

console.log(`Testing connection to ${host}:${port}...`);

const socket = new net.Socket();
const timeout = 10000; // 10 seconds

socket.setTimeout(timeout);

socket.on('connect', function() {
    console.log('✅ Successfully connected to', host + ':' + port);
    console.log('🎉 The database server is reachable!');
    socket.destroy();
});

socket.on('timeout', function() {
    console.error('❌ Connection timeout after', timeout/1000, 'seconds');
    console.error('💡 The server might be down or the port might be blocked');
    socket.destroy();
    process.exit(1);
});

socket.on('error', function(error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error code:', error.code);
    
    if (error.code === 'ENOTFOUND') {
        console.error('💡 Hostname not found. Check if "aminalam.info" is a valid domain.');
    } else if (error.code === 'ECONNREFUSED') {
        console.error('💡 Connection refused. PostgreSQL might not be running on port 5433.');
    } else if (error.code === 'ETIMEDOUT') {
        console.error('💡 Connection timed out. Check firewall settings or network connectivity.');
    }
    
    process.exit(1);
});

socket.connect(port, host); 