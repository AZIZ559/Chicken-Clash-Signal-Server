// server.js - Node.js TCP Signaling Server
const net = require('net');

// يجب أن نستخدم المنفذ الافتراضي الذي يقدمه Render
const PORT = process.env.PORT || 8080; 
const HOST = '0.0.0.0'; // الاستماع على جميع الواجهات

const rooms = {};

// دالة لضمان إرسال الرسالة كسطر جديد (Delimiter)
function sendMessage(client, data) {
    if (client && client.writable) {
        client.write(JSON.stringify(data) + '\n');
    }
}

const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    
    // متغير مؤقت لتخزين الأجزاء غير المكتملة من الرسالة
    let buffer = '';

    console.log(`Client connected from: ${socket.remoteAddress}:${socket.remotePort}`);

    socket.on('data', (data) => {
        // إضافة البيانات الجديدة إلى المخزن المؤقت
        buffer += data;
        
        // معالجة المخزن المؤقت بناءً على فاصل السطر الجديد (\n)
        let messages = buffer.split('\n');
        
        // آخر جزء قد يكون غير مكتمل، نحتفظ به في المخزن المؤقت
        buffer = messages.pop();
        
        messages.forEach(message => {
            if (message.trim() === '') return;

            try {
                const data = JSON.parse(message);
                
                if (data.type === 'create_room') {
                    const { code, host_id, name } = data;
                    if (!rooms[code]) {
                        rooms[code] = { host: socket, players: new Map([[host_id, { socket, name, id: host_id }]]), code: code };
                        socket.code = code;
                        socket.godot_id = host_id;
                        socket.is_host = true;
                        console.log(`Room created: ${code}`);
                    }
                }
                else if (data.type === 'join_room') {
                    const { code, player_id, name } = data;
                    const room = rooms[code];

                    if (room && !room.players.has(player_id)) {
                        room.players.set(player_id, { socket, name, id: player_id });
                        socket.code = code;
                        socket.godot_id = player_id;
                        socket.is_host = false;
                        
                        // إرسال رسالة الانضمام إلى المضيف (Host)
                        sendMessage(room.host, {
                            type: 'new_player_joined',
                            player_id: player_id, 
                            name: name
                        });
                    } else {
                        sendMessage(socket, { type: 'join_failed', message: 'Room not found or ID taken.' });
                    }
                }
                else if (['offer', 'answer', 'candidate'].includes(data.type)) {
                    const { code, peer_id } = data;
                    const room = rooms[code];
                    if (room) {
                        let targetPlayer = room.players.get(peer_id);
                        if (targetPlayer) {
                            // إعادة توجيه رسالة العرض/الإجابة/المرشح
                            sendMessage(targetPlayer.socket, {
                                type: data.type,
                                peer_id: socket.godot_id, 
                                description: data.description 
                            });
                        }
                    }
                }
            } catch (e) {
                console.error("Error processing message:", e.message);
            }
        });
    });

    socket.on('close', () => {
        if (socket.code && rooms[socket.code]) {
            const room = rooms[socket.code];
            if (socket.is_host) { 
                // إغلاق الغرفة إذا كان المغادر هو المضيف
                room.players.forEach(p => {
                    if (p.socket !== socket) {
                         sendMessage(p.socket, { type: 'room_closed' });
                    }
                });
                delete rooms[socket.code];
                console.log(`Room closed: ${socket.code}`);
            } else if (socket.godot_id) {
                // إزالة اللاعب العادي
                room.players.delete(socket.godot_id);
                // إبلاغ المضيف
                sendMessage(room.host, {
                    type: 'player_disconnected',
                    player_id: socket.godot_id
                });
            }
        }
    });

    socket.on('error', (err) => {
        console.error(`Socket error: ${err.message}`);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`✅ TCP Signaling Server Running on ${HOST}:${PORT}`);
});
