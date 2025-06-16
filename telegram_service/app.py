# telegram_service/app.py
from flask import Flask, request, jsonify
from telethon.sync import TelegramClient
import os
import asyncio
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
import threading

# Load environment variables
load_dotenv()

# Configuration
API_ID = int(os.getenv('TELEGRAM_API_ID'))
API_HASH = os.getenv('TELEGRAM_API_HASH')
PHONE = os.getenv('TELEGRAM_PHONE_NUMBER')
SESSION = os.getenv('TELEGRAM_SESSION_NAME', 'telegram_session')

# New configuration for forwarding
TARGET_CHANNEL = os.getenv('TARGET_CHANNEL')  # Channel username or ID where messages will be forwarded
KEYWORDS = 'حمله هوایی,موشک,پهپاد,جنگنده,بمب افکن,پدافند هوایی,دفاع هوایی,رهگیری,قطع برق,خاموشی,قطع آب,کمبود آب,انفجار,صدای انفجار,آتش سوزی,حادثه,موشک,پدافند,بمب,راکت,صدا,منفجر,دیده شد,حمله,لرزید'  # Comma-separated keywords to trigger forwarding
TEST_LENGTH_LIMIT = 400

# Initialize Flask app
app = Flask(__name__)

# Thread-local storage for event loops
thread_local = threading.local()

def get_event_loop():
    """Get or create an event loop for the current thread"""
    if not hasattr(thread_local, "loop"):
        thread_local.loop = asyncio.new_event_loop()
        asyncio.set_event_loop(thread_local.loop)
    return thread_local.loop

# Initialize Telegram client in the main thread
print("Connecting to Telegram...")
loop = get_event_loop()
with TelegramClient(SESSION, API_ID, API_HASH, loop=loop) as client:
    if not client.is_user_authorized():
        print("Need to authenticate with Telegram...")
        client.send_code_request(PHONE)
        code = input('Enter the code you received: ')
        client.sign_in(PHONE, code)
    print("Connected to Telegram successfully!")

# Keep track of last check time
last_check_time = datetime.now(timezone.utc)

def should_forward_message(message_text):
    """Check if a message contains any of the specified keywords"""
    if not KEYWORDS or not message_text:
        return False
    message_text = message_text.lower()
    print(f"Checking message: {message_text}")
    print(f"Keywords: {KEYWORDS}")
    print(f"Keywords split: {KEYWORDS.split(',')}")
    return any(keyword.strip() in message_text for keyword in KEYWORDS.split(',') if len(keyword.strip()) < TEST_LENGTH_LIMIT)

async def forward_message(client, message, target_channel):
    """Forward a message to the target channel"""
    try:
        # Convert channel ID to integer if it's a string and starts with -100
        if isinstance(target_channel, str) and target_channel.startswith('-100'):
            target_channel = int(target_channel)
        
        print(f"Attempting to forward message to channel {target_channel}")
        target_entity = await client.get_input_entity(target_channel)
        print(f"Successfully got entity for channel {target_channel}")
        
        # Forward the message
        await client.forward_messages(target_entity, message)
        print(f"Successfully forwarded message {message.id} to {target_channel}")
        return True
    except ValueError as e:
        print(f"Invalid channel format: {e}")
        return False
    except Exception as e:
        print(f"Error forwarding message: {e}")
        return False

@app.route('/get-messages', methods=['POST'])
async def get_messages():
    """Get new messages from specified channels and forward matching messages"""
    global last_check_time
    
    # Ensure we have an event loop in this thread
    loop = get_event_loop()
    
    try:
        data = request.json
        channels = data.get('channels', [])
        # Optional parameter to fetch messages from X minutes ago
        minutes_ago = data.get('minutes_ago', None)
        
        if not channels:
            return jsonify({'error': 'No channels specified'}), 400
        
        # Calculate time range
        current_time = datetime.now(timezone.utc) + timedelta(hours=3.5) # tehran time

        check_since = current_time - timedelta(minutes=1)
        print(f"Checking for messages since: {check_since}")
        
        all_messages = []
        forwarded_messages = []
        forwarding_errors = []
        
        # Get messages from all channels
        async with TelegramClient(SESSION, API_ID, API_HASH, loop=loop) as client:
            for channel in channels:
                try:
                    print(f"Getting messages from {channel}")
                    
                    # Get the channel entity
                    entity = await client.get_entity(channel)
                    
                    # Get messages
                    messages = await client.get_messages(entity, limit=10)
                    print(f"Fetched {len(messages)} messages from {channel}")
                    
                    # Filter and format messages
                    channel_messages = []
                    for message in messages:
                        # Convert message.date to timezone-aware UTC if it isn't already
                        msg_date = message.date
                        if msg_date.tzinfo is None:
                            msg_date = msg_date.replace(tzinfo=timezone.utc)
                        
                        # Add 3.5 hours to the message date
                        msg_date = msg_date + timedelta(hours=3.5)
                        
                        if msg_date < check_since:
                            continue

                        # Check if message should be forwarded
                        if TARGET_CHANNEL and should_forward_message(message.text):
                            print(f"Message contains keywords, forwarding to {TARGET_CHANNEL}")
                            try:
                                if await forward_message(client, message, TARGET_CHANNEL):
                                    forwarded_messages.append(message.id)
                                else:
                                    forwarding_errors.append(f"Failed to forward message {message.id}")
                            except Exception as e:
                                forwarding_errors.append(f"Error forwarding message {message.id}: {str(e)}")

                        # Extract media information
                        media_items = []
                        if message.media:
                            try:
                                # Handle grouped media
                                if hasattr(message, 'grouped_id') and message.grouped_id:
                                    print(f"  Message is part of media group {message.grouped_id}")
                                
                                media_info = {
                                    'type': str(type(message.media).__name__),
                                    'file_id': None,  # Will be populated below
                                    'mime_type': None,
                                    'file_size': None,
                                    'width': None,     # For photos/videos
                                    'height': None,    # For photos/videos
                                    'duration': None,  # For videos/voice/audio
                                    'title': None,     # For audio files
                                    'performer': None, # For audio files
                                    'grouped_id': message.grouped_id if hasattr(message, 'grouped_id') else None
                                }

                                # Handle different types of media
                                if hasattr(message.media, 'photo'):
                                    media_info['file_id'] = message.media.photo.id
                                    if hasattr(message.media.photo, 'sizes') and message.media.photo.sizes:
                                        # Get the largest photo size
                                        largest_size = message.media.photo.sizes[-1]
                                        media_info['width'] = largest_size.w
                                        media_info['height'] = largest_size.h
                                        # For progressive photos, size might be in 'sizes' array
                                        if hasattr(largest_size, 'size'):
                                            media_info['file_size'] = largest_size.size
                                        elif hasattr(largest_size, 'sizes') and largest_size.sizes:
                                            media_info['file_size'] = largest_size.sizes[-1]
                                    media_items.append(media_info)

                                elif hasattr(message.media, 'document'):
                                    doc = message.media.document
                                    media_info['file_id'] = doc.id
                                    media_info['file_size'] = doc.size
                                    
                                    # Get mime type if available
                                    if hasattr(doc, 'mime_type'):
                                        media_info['mime_type'] = doc.mime_type

                                    # Get video/audio attributes if available
                                    for attr in doc.attributes:
                                        if hasattr(attr, 'duration'):
                                            media_info['duration'] = attr.duration
                                        if hasattr(attr, 'w'):
                                            media_info['width'] = attr.w
                                        if hasattr(attr, 'h'):
                                            media_info['height'] = attr.h
                                        if hasattr(attr, 'title'):
                                            media_info['title'] = attr.title
                                        if hasattr(attr, 'performer'):
                                            media_info['performer'] = attr.performer
                                    media_items.append(media_info)

                                print(f"  Extracted {len(media_items)} media items")
                            except Exception as e:
                                print(f"  Error extracting media info: {e}")
                                media_items.append({
                                    'type': str(type(message.media).__name__),
                                    'error': str(e)
                                })
                        
                        message_dict = {
                            'message_id': message.id,
                            'text': message.text or '',
                            'date': msg_date.isoformat(),
                            'channel_title': entity.title,
                            'channel_username': getattr(entity, 'username', ''),
                            'sender_id': message.sender_id,
                            'has_media': bool(message.media),
                            'media': media_items,
                            'views': getattr(message, 'views', 0),
                            'forwards': getattr(message, 'forwards', 0)
                        }
                        channel_messages.append(message_dict)
                    
                    # Mark messages as read if we found any
                    if channel_messages:
                        try:
                            await client.send_read_acknowledge(entity, max_id=channel_messages[-1]['message_id'])
                            print(f"Marked messages as read in channel: {channel}")
                        except Exception as e:
                            print(f"Could not mark messages as read for {channel}: {e}")
                    
                    all_messages.extend(channel_messages)
                    print(f"Got {len(channel_messages)} new messages from {channel}")
                    
                except Exception as e:
                    print(f"Error getting messages from {channel}: {e}")
        
        # Update last check time
        last_check_time = current_time

        # Sort all messages by date
        all_messages.sort(key=lambda x: x['date'])
        
        return jsonify({
            'status': 'success',
            'message_count': len(all_messages),
            'messages': all_messages,
            'last_check': last_check_time.isoformat(),
            'checked_since': check_since.isoformat(),
            'forwarded_messages': forwarded_messages,
            'forwarded_count': len(forwarded_messages),
            'forwarding_errors': forwarding_errors
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/status', methods=['GET'])
def get_status():
    """Get service status"""
    loop = get_event_loop()
    with TelegramClient(SESSION, API_ID, API_HASH, loop=loop) as client:
        return jsonify({
            'client_connected': client.is_connected(),
            'client_authorized': client.is_user_authorized(),
            'last_check': last_check_time.isoformat() if last_check_time else None,
            'status': 'running'
        })

@app.route('/get-channel-info', methods=['POST'])
async def get_channel_info():
    """Get channel information including its ID"""
    loop = get_event_loop()
    
    try:
        data = request.json
        channel_link = data.get('channel_link')
        
        if not channel_link:
            return jsonify({'error': 'No channel link provided'}), 400
            
        async with TelegramClient(SESSION, API_ID, API_HASH, loop=loop) as client:
            try:
                # Try to get the entity
                entity = await client.get_entity(channel_link)
                return jsonify({
                    'status': 'success',
                    'channel_id': entity.id,
                    'channel_title': getattr(entity, 'title', None),
                    'channel_username': getattr(entity, 'username', None),
                    'channel_type': type(entity).__name__,
                    'access_hash': getattr(entity, 'access_hash', None),
                })
            except Exception as e:
                return jsonify({'error': f'Could not get channel info: {str(e)}'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"Starting Flask server on http://0.0.0.0:{os.getenv('FLASK_RUN_PORT', 3002)}")
    app.run(
        host='0.0.0.0',  # Allow connections from any host
        port=int(os.getenv('FLASK_RUN_PORT', 3002)),
        debug=True,
        use_reloader=False  # Important: prevent Flask from starting multiple instances
    ) 