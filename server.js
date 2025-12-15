// server.js - Node.js WebSocket Signaling Server
const http = require('http');
const WebSocket = require('ws');

// يتم تحديد المنفذ من قِبل Render (عادة 10000 أو 8080)
const PORT = process.env.PORT || 8080; 

const rooms = {};

// 1. إنشاء خادم HTTP أساسي (للتوافق مع Render)
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('WebSocket Signaling Server is Running.\n');
});

// 2. إنشاء خادم WebSockets باستخدام خادم HTTP
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws, req) => {
    console.log(`Client connected: ${req.socket.remoteAddress}`);

    // معالجة الرسائل الواردة
    ws.on('message', (message) => {
        try {
            // تحويل الرسالة إلى نص قبل محاولة تحليل JSON
            const messageString = message.toString();
            const data = JSON.parse(messageString);
            
            if (data.type === 'create_room') {
                const { code, host_id, name } = data;
                if (!rooms[code]) {
                    // نستخدم Map لتخزين الاتصالات
                    rooms[code] = { host: ws, players: new Map([[host_id, { socket: ws, name, id: host_id }]]), code: code };
                    ws.code = code;
                    ws.godot_id = host_id;
                    ws.is_host = true;
                    console.log(`Room created: ${code}`);
                }
            }
            else if (data.type === 'join_room') {
                const { code, player_id, name } = data;
                const room = rooms[code];

                if (room && !room.players.has(player_id)) {
                    room.players.set(player_id, { socket: ws, name, id: player_id });
                    ws.code = code;
                    ws.godot_id = player_id;
                    ws.is_host = false;
                    
                    // إرسال رسالة للمضيف
                    if (room.host.readyState === WebSocket.OPEN) {
                        room.host.send(JSON.stringify({
                            type: 'new_player_joined',
                            player_id: player_id, 
                            name: name
                        }));
                    }
                } else {
                    ws.send(JSON.stringify({ type: 'join_failed', message: 'Room not found or ID taken.' }));
                }
            }
            else if (['offer', 'answer', 'candidate'].includes(data.type)) {
                const { code, peer_id } = data;
                const room = rooms[code];
                if (room) {
                    let targetPlayer = room.players.get(peer_id);
                    if (targetPlayer && targetPlayer.socket.readyState === WebSocket.OPEN) {
                        targetPlayer.socket.send(JSON.stringify({
                            type: data.type,
                            peer_id: ws.godot_id, 
                            description: data.description 
                        }));
                    }
                }
            }
        } catch (e) {
            // هذا الجزء يتجاهل أخطاء HTTP/HTTPS غير المرغوب فيها
            if (!message.toString().startsWith('GET') && !message.toString().startsWith('HEAD')) {
                 console.error("Error processing message:", e.message);
            }
        }
    });

    // معالجة قطع الاتصال
    ws.on('close', () => {
        if (ws.code && rooms[ws.code]) {
            const room = rooms[ws.code];
            if (ws.is_host) { 
                // إغلاق الغرفة
                room.players.forEach(p => {
                    if (p.socket !== ws && p.socket.readyState === WebSocket.OPEN) {
                         p.socket.send(JSON.stringify({ type: 'room_closed' }));
                    }
                });
                delete rooms[ws.code];
                console.log(`Room closed: ${ws.code}`);
            } else if (ws.godot_id) {
                // إزالة اللاعب
                room.players.delete(ws.godot_id);
                if (room.host && room.host.readyState === WebSocket.OPEN) {
                     room.host.send(JSON.stringify({
                        type: 'player_disconnected',
                        player_id: ws.godot_id
                    }));
                }
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`✅ WebSocket Signaling Server Running on Port ${PORT}`);
});
