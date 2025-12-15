// server.js - Node.js WebSocket Signaling Server
const WebSocket = require('ws');

// يتم قراءة البورت من بيئة الاستضافة (Render)
const PORT = process.env.PORT || 8080; 
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

console.log(`✅ Signaling Server Running on Port ${PORT}`);

wss.on('connection', (ws, req) => {
    ws.id = Math.random(); 

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);

            if (data.type === 'create_room') {
                const { code, host_id, name } = data;
                if (!rooms[code]) {
                    rooms[code] = { host: ws, players: new Map([[host_id, { ws, name, id: host_id }]]), code: code };
                    ws.code = code;
                    ws.godot_id = host_id;
                    console.log(`Room created: ${code}`);
                }
            }
            else if (data.type === 'join_room') {
                const { code, player_id, name } = data;
                const room = rooms[code];

                if (room && room.host !== ws) {
                    room.players.set(player_id, { ws, name, id: player_id });
                    ws.code = code;
                    ws.godot_id = player_id;

                    room.host.send(JSON.stringify({
                        type: 'new_player_joined',
                        player_id: player_id, 
                        name: name
                    }));
                } else {
                    ws.send(JSON.stringify({ type: 'join_failed', message: 'Room not found.' }));
                }
            }
            else if (['offer', 'answer', 'candidate'].includes(data.type)) {
                const { code, peer_id } = data;
                const room = rooms[code];
                if (room) {
                    let targetPlayer = room.players.get(peer_id);
                    if (targetPlayer) {
                        targetPlayer.ws.send(JSON.stringify({
                            type: data.type,
                            peer_id: ws.godot_id, 
                            description: data.description 
                        }));
                    }
                }
            }
        } catch (e) {
            console.error("Error processing message:", e.message);
        }
    });

    ws.on('close', () => {
        if (ws.code && rooms[ws.code]) {
            const room = rooms[ws.code];
            if (ws.godot_id === 1) { 
                room.players.forEach(p => {
                    if (p.ws !== ws && p.ws.readyState === WebSocket.OPEN) {
                         p.ws.send(JSON.stringify({ type: 'room_closed' }));
                    }
                });
                delete rooms[ws.code];
            } else if (ws.godot_id) {
                room.players.delete(ws.godot_id);
            }
        }
    });
});
