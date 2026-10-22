const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomInt, randomUUID } = require('node:crypto');
const { WebSocket, WebSocketServer } = require('ws');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MAX_PLAYERS = 10;
const BATTLE_MAX_ROUND_WINS = 5;
const BATTLE_HIT_DAMAGE = 1;
const BATTLE_HIT_COOLDOWN_MS = 50;
const BATTLE_ROUND_BREAK_MS = 6000;
const ROOM_CODE_CHARACTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const rooms = new Map();
const matchmakingQueues = new Map();
const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml'
};

const server = http.createServer((request, response) => {
    const requestPath = new URL(request.url, `http://${request.headers.host}`).pathname;
    const relativePath = requestPath === '/' ? 'index.html' : decodeURIComponent(requestPath.slice(1));
    const filePath = path.resolve(ROOT, relativePath);
    if (!filePath.startsWith(`${ROOT}${path.sep}`) && filePath !== path.join(ROOT, 'index.html')) {
        response.writeHead(403).end('Forbidden');
        return;
    }

    fs.stat(filePath, (statError, stats) => {
        if (statError || !stats.isFile()) {
            response.writeHead(404).end('Not found');
            return;
        }
        response.writeHead(200, {
            'Content-Type': contentTypes[path.extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        });
        fs.createReadStream(filePath).pipe(response);
    });
});

const socketServer = new WebSocketServer({ noServer: true, maxPayload: 1024 });

server.on('upgrade', (request, socket, head) => {
    if (new URL(request.url, `http://${request.headers.host}`).pathname !== '/multiplayer') {
        socket.destroy();
        return;
    }
    socketServer.handleUpgrade(request, socket, head, client => {
        socketServer.emit('connection', client);
    });
});

function send(client, message) {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message));
}

function playersIn(room) {
    return [...room.players.values()].map(player => ({
        id: player.id,
        teamId: player.teamId,
        teamSlot: player.teamSlot,
        teamScore: player.teamId === 0 || player.teamId === 1 ? room.teamScores?.[player.teamId] || 0 : 0,
        connected: true,
        hp: Number.isFinite(player.hp) ? player.hp : 100,
        roundWins: player.roundWins || 0,
        matchScore: player.matchScore || 0,
        x: player.x,
        y: player.y,
        angle: player.angle,
        sprinting: player.sprinting,
        phaseShift: player.phaseShift,
        touchDeathActive: player.touchDeathActive,
        touchDeathTimer: player.touchDeathTimer,
        alive: player.alive && Date.now() - player.lastStateAt < 1200
    }));
}

function battlePlayersIn(room) {
    return [...room.battleRoster.values()].map(player => ({
        id: player.id,
        teamId: player.teamId,
        teamSlot: player.teamSlot,
        teamScore: room.teamScores[player.teamId] || 0,
        connected: player.connected,
        hp: Number.isFinite(player.hp) ? player.hp : 100,
        roundWins: player.roundWins || 0,
        matchScore: player.matchScore || 0,
        x: player.x,
        y: player.y,
        angle: player.angle,
        sprinting: player.sprinting,
        phaseShift: player.phaseShift,
        touchDeathActive: player.touchDeathActive,
        touchDeathTimer: player.touchDeathTimer,
        alive: player.connected && player.alive && Date.now() - player.lastStateAt < 1200
    }));
}

function broadcast(room, message) {
    for (const client of room.players.keys()) send(client, message);
}

function leaveRoom(client) {
    const room = client.room;
    if (!room) return;
    if (room.matchmade && room.startedAt === null) {
        clearTimeout(room.countdownTimeout);
        for (const member of room.players.keys()) {
            member.room = null;
            if (member !== client) send(member, { type: 'match-cancelled' });
        }
        room.players.clear();
        clearInterval(room.interval);
        rooms.delete(room.code);
        client.room = null;
        return;
    }
    const departingPlayer = room.players.get(client);
    if (room.mode === 'battle' && room.startedAt !== null && departingPlayer) {
        departingPlayer.connected = false;
        departingPlayer.alive = false;
    }
    room.players.delete(client);
    client.room = null;
    if (room.players.size === 0) {
        clearInterval(room.interval);
        clearTimeout(room.battleRoundTimeout);
        rooms.delete(room.code);
        return;
    }
    if (room.mode === 'battle' && room.startedAt !== null) {
        broadcast(room, { type: 'battle-state', players: battlePlayersIn(room), round: room.battleRound });
        const remainingTeams = new Set([...room.players.values()]
            .filter(player => player.hp > 0 && player.connected)
            .map(player => player.teamId));
        if (remainingTeams.size <= 1) {
            const winningTeamId = remainingTeams.size ? [...remainingTeams][0] : null;
            if (room.battleRoundOver) {
                clearTimeout(room.battleRoundTimeout);
                room.battleEnded = true;
                broadcast(room, {
                    type: 'battle-match-ended',
                    winnerTeamId: winningTeamId,
                    players: battlePlayersIn(room)
                });
            } else {
                finishBattleRound(room, winningTeamId, true);
            }
            return;
        }
        return;
    }
    if (room.host === client) room.host = room.players.keys().next().value;
    broadcast(room, {
        type: 'room-update',
        code: room.code,
        hostId: room.players.get(room.host).id,
        started: room.startedAt !== null,
        players: playersIn(room)
    });
}

function leaveQueue(client, notify = false) {
    const queueKey = client.queueKey;
    if (!queueKey) return;
    const queue = matchmakingQueues.get(queueKey);
    client.queueKey = null;
    if (!queue) return;
    const index = queue.indexOf(client);
    if (index !== -1) queue.splice(index, 1);
    if (notify) send(client, { type: 'queue-cancelled' });
    if (queue.length === 0) {
        matchmakingQueues.delete(queueKey);
        return;
    }
    const [mode, requiredPlayersText] = queueKey.split(':');
    const requiredPlayers = Number(requiredPlayersText);
    queue.forEach((queuedClient, position) => send(queuedClient, {
        type: 'queue-status',
        mode,
        requiredPlayers,
        position: position + 1,
        queuedPlayers: queue.length
    }));
}

function createPlayer() {
    return {
        id: randomUUID(),
        x: 0.5,
        y: 0.5,
        angle: 0,
        sprinting: false,
        phaseShift: false,
        touchDeathActive: false,
        touchDeathTimer: 0,
        alive: true,
        score: 0,
        lastStateAt: Date.now()
    };
}

function createMatch(clients, mode, requiredPlayers) {
    let code;
    do {
        code = Array.from({ length: 5 }, () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)]).join('');
    } while (rooms.has(code));

    const host = clients[0];
    const room = {
        code,
        host,
        players: new Map(),
        oxygen: 35.5,
        startedAt: null,
        lastTick: Date.now(),
        interval: null,
        mode,
        requiredPlayers,
        matchmade: true,
        loadedPlayers: new Set(),
        countdownTimeout: null,
        countdownEndsAt: null,
        battleEndsAt: null,
        battleEnded: false,
        battleRound: 0,
        battleRoundOver: false,
        battleRoundReset: false,
        battleRoster: new Map(),
        teamScores: [0, 0],
        battleShots: new Map(),
        resolvedBattleShots: new Set(),
        lastBattleHitAt: new Map(),
        battleRoundTimeout: null
    };
    const teamAssignments = new Map();
    if (mode === 'battle') {
        const assignedClients = [...clients];
        if (requiredPlayers > 2) {
            for (let index = assignedClients.length - 1; index > 0; index--) {
                const swapIndex = randomInt(index + 1);
                [assignedClients[index], assignedClients[swapIndex]] =
                    [assignedClients[swapIndex], assignedClients[index]];
            }
        }
        const teamSize = requiredPlayers / 2;
        assignedClients.forEach((client, index) => {
            teamAssignments.set(client, {
                teamId: Math.floor(index / teamSize),
                teamSlot: index % teamSize + 1
            });
        });
    }
    for (const client of clients) {
        const player = createPlayer();
        const team = teamAssignments.get(client);
        player.teamId = team ? team.teamId : null;
        player.teamSlot = team ? team.teamSlot : null;
        player.connected = true;
        player.hp = 100;
        player.roundWins = 0;
        player.matchScore = 0;
        room.players.set(client, player);
        if (mode === 'battle') room.battleRoster.set(player.id, player);
        client.room = room;
    }
    for (const client of clients) {
        const player = room.players.get(client);
        send(client, {
            type: 'match-found',
            code,
            mode,
            requiredPlayers,
            playerId: player.id,
            hostId: room.players.get(host).id,
            players: playersIn(room)
        });
    }
    rooms.set(code, room);
    room.interval = setInterval(() => {
        if (room.startedAt === null || room.battleEnded || room.battleRoundOver) return;
        if (room.mode === 'battle') {
            broadcast(room, { type: 'battle-state', players: playersIn(room), round: room.battleRound });
            return;
        }
        const now = Date.now();
        const delta = Math.max(0, Math.min(1, (now - room.lastTick) / 1000));
        room.lastTick = now;
        room.oxygen = Math.max(0, room.oxygen - delta);
        broadcast(room, oxygenState(room));
    }, 250);
}

function joinMatchmakingQueue(client, message) {
    const mode = message.mode;
    const requiredPlayers = message.requiredPlayers;
    const isValidSize = mode === 'team'
        ? Number.isInteger(requiredPlayers) && requiredPlayers >= 2 && requiredPlayers <= 5
        : mode === 'battle'
            && Number.isInteger(requiredPlayers) && requiredPlayers >= 2
            && requiredPlayers <= 10 && requiredPlayers % 2 === 0;
    if (!isValidSize) {
        send(client, { type: 'error', code: 'invalid-match-size' });
        return;
    }
    leaveRoom(client);
    leaveQueue(client);
    const queueKey = `${mode}:${requiredPlayers}`;
    const queue = matchmakingQueues.get(queueKey) || [];
    queue.push(client);
    client.queueKey = queueKey;
    matchmakingQueues.set(queueKey, queue);

    while (queue.length >= requiredPlayers) {
        const players = queue.splice(0, requiredPlayers);
        players.forEach(queuedClient => {
            queuedClient.queueKey = null;
        });
        createMatch(players, mode, requiredPlayers);
    }

    if (queue.length === 0) {
        matchmakingQueues.delete(queueKey);
        return;
    }
    queue.forEach((queuedClient, position) => send(queuedClient, {
        type: 'queue-status',
        mode,
        requiredPlayers,
        position: position + 1,
        queuedPlayers: queue.length
    }));
}

function oxygenState(room) {
    return {
        type: 'oxygen-update',
        oxygen: room.oxygen,
        elapsed: room.startedAt === null ? 0 : (Date.now() - room.startedAt) / 1000,
        startedAt: room.startedAt,
        serverTime: Date.now()
    };
}

function createRoom(client) {
    let code;
    do {
        code = Array.from({ length: 5 }, () => ROOM_CODE_CHARACTERS[randomInt(ROOM_CODE_CHARACTERS.length)]).join('');
    } while (rooms.has(code));

    const room = {
        code,
        host: client,
        players: new Map(),
        oxygen: 35.5,
        startedAt: null,
        lastTick: Date.now(),
        interval: null,
        mode: 'team',
        requiredPlayers: 2,
        matchmade: false,
        loadedPlayers: new Set(),
        countdownTimeout: null,
        countdownEndsAt: null,
        battleEndsAt: null,
        battleEnded: false
    };
    room.players.set(client, createPlayer());
    client.room = room;
    rooms.set(code, room);

    room.interval = setInterval(() => {
        if (room.startedAt !== null && room.mode !== 'battle') {
            const now = Date.now();
            const delta = Math.max(0, Math.min(1, (now - room.lastTick) / 1000));
            room.lastTick = now;
            room.oxygen = Math.max(0, room.oxygen - delta);
            broadcast(room, oxygenState(room));
        }
    }, 250);

    send(client, {
        type: 'room-created',
        code,
        hostId: room.players.get(client).id,
        players: playersIn(room)
    });
}

function joinRoom(client, code) {
    const room = rooms.get(code);
    if (!room) {
        send(client, { type: 'error', code: 'room-not-found' });
        return;
    }
    if (room.players.size >= MAX_PLAYERS) {
        send(client, { type: 'error', code: 'room-full', maxPlayers: MAX_PLAYERS });
        return;
    }
    if (room.players.has(client)) return;

    const player = {
        id: randomUUID(),
        x: 0.5,
        y: 0.5,
        angle: 0,
        sprinting: false,
        phaseShift: false,
        touchDeathActive: false,
        touchDeathTimer: 0,
        alive: true,
        lastStateAt: Date.now()
    };
    room.players.set(client, player);
    client.room = room;
    send(client, {
        type: 'room-joined',
        code,
        playerId: player.id,
        hostId: room.players.get(room.host).id,
        started: room.startedAt !== null,
        players: playersIn(room),
        oxygen: room.oxygen,
        elapsed: room.startedAt === null ? 0 : (Date.now() - room.startedAt) / 1000,
        startedAt: room.startedAt,
        serverTime: Date.now()
    });
    broadcast(room, {
        type: 'room-update',
        code,
        hostId: room.players.get(room.host).id,
        started: room.startedAt !== null,
        players: playersIn(room)
    });
    if (room.startedAt !== null) send(client, oxygenState(room));
}

function startGame(room) {
    if (!room || room.host.room !== room || room.players.size < 2 || room.startedAt !== null) return;
    room.oxygen = 35.5;
    room.startedAt = Date.now();
    room.lastTick = room.startedAt;
    broadcast(room, {
        type: 'game-start',
        mode: room.mode,
        oxygen: room.oxygen,
        elapsed: 0,
        startedAt: room.startedAt,
        serverTime: room.startedAt
    });
    if (room.mode === 'battle') startBattleRound(room);
}

function markPlayerLoaded(client) {
    const room = client.room;
    if (!room || !room.matchmade || room.startedAt !== null || room.countdownTimeout) return;
    room.loadedPlayers.add(client);
    broadcast(room, {
        type: 'loading-status',
        loadedPlayers: room.loadedPlayers.size,
        requiredPlayers: room.requiredPlayers
    });
    if (room.loadedPlayers.size !== room.requiredPlayers) return;
    room.countdownEndsAt = Date.now() + 3000;
    broadcast(room, { type: 'match-countdown', countdownEndsAt: room.countdownEndsAt });
    room.countdownTimeout = setTimeout(() => {
        room.countdownTimeout = null;
        room.countdownEndsAt = null;
        startGame(room);
    }, 3000);
}

function startBattleRound(room) {
    const activeTeams = new Set([...room.players.values()]
        .filter(player => player.connected && player.hp > 0)
        .map(player => player.teamId));
    if (activeTeams.size < 2) {
        finishBattleRound(room, activeTeams.size ? [...activeTeams][0] : null);
        return;
    }
    room.battleRound += 1;
    room.battleRoundOver = false;
    room.battleRoundReset = false;
    room.battleShots.clear();
    room.resolvedBattleShots.clear();
    room.lastBattleHitAt.clear();
    const entries = [...room.players.entries()];
    entries.forEach(([client, player], index) => {
        player.hp = 100;
        player.alive = true;
        player.x = (index + 1) / (entries.length + 1);
        player.y = 0.5;
        player.lastStateAt = Date.now();
        player.connected = true;
    });
    const players = battlePlayersIn(room);
    entries.forEach(([client]) => {
        send(client, {
            type: 'battle-round-start',
            round: room.battleRound,
            players
        });
    });
}

function finishBattleRound(room, winningTeamId, forfeit = false) {
    if (room.battleRoundOver || room.battleEnded) return;
    room.battleRoundOver = true;
    room.battleRoundReset = false;
    if (winningTeamId === 0 || winningTeamId === 1) {
        room.teamScores[winningTeamId] += 1;
        for (const player of room.battleRoster.values()) {
            player.roundWins = room.teamScores[player.teamId];
            if (player.teamId === winningTeamId) player.matchScore += 1;
        }
    }
    const players = battlePlayersIn(room);
    const matchEnded = winningTeamId === 0 || winningTeamId === 1
        ? room.teamScores[winningTeamId] >= BATTLE_MAX_ROUND_WINS || forfeit
        : false;
    broadcast(room, {
        type: 'battle-round-over',
        winnerTeamId: winningTeamId,
        round: room.battleRound,
        matchEnded,
        players
    });
    if (matchEnded) {
        room.battleEnded = true;
        broadcast(room, {
            type: 'battle-match-ended',
            winnerTeamId: winningTeamId,
            players
        });
        return;
    }
    room.battleRoundTimeout = setTimeout(() => {
        room.battleRoundReset = true;
        const entries = [...room.players.entries()];
        const resetPositions = new Map(entries.map(([, player], index) => [
            player.id,
            (index + 1) / (entries.length + 1)
        ]));
        entries.forEach(([, player], index) => {
            player.hp = 100;
            player.alive = true;
            player.x = (index + 1) / (entries.length + 1);
            player.y = 0.5;
            player.sprinting = false;
            player.phaseShift = false;
            player.touchDeathActive = false;
            player.touchDeathTimer = 0;
            player.lastStateAt = Date.now();
        });
        for (const player of room.battleRoster.values()) {
            if (player.connected) {
                player.hp = 100;
                player.alive = true;
                player.x = resetPositions.get(player.id) || 0.5;
                player.y = 0.5;
                player.sprinting = false;
                player.phaseShift = false;
                player.touchDeathActive = false;
                player.touchDeathTimer = 0;
                player.lastStateAt = Date.now();
            } else {
                player.hp = 0;
                player.alive = false;
            }
        }
        const resetPlayers = battlePlayersIn(room);
        for (const [client] of entries) {
            send(client, { type: 'battle-round-reset', players: resetPlayers });
        }
        room.battleRoundTimeout = setTimeout(() => {
            room.battleRoundTimeout = null;
            if (!room.battleEnded && room.players.size >= 2) startBattleRound(room);
        }, BATTLE_ROUND_BREAK_MS - 3000);
    }, 3000);
}

function distanceToSegmentSquared(pointX, pointY, startX, startY, endX, endY) {
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const segmentLengthSquared = segmentX * segmentX + segmentY * segmentY;
    const projection = segmentLengthSquared > 0
        ? Math.max(0, Math.min(1,
            ((pointX - startX) * segmentX + (pointY - startY) * segmentY)
            / segmentLengthSquared))
        : 0;
    const closestX = startX + projection * segmentX;
    const closestY = startY + projection * segmentY;
    return (pointX - closestX) ** 2 + (pointY - closestY) ** 2;
}

function battleShotCanHitTarget(shot, targetX, targetY, radius) {
    const aspectRatio = Number.isFinite(shot.aspectRatio) ? shot.aspectRatio : 1;
    const scaleX = Math.max(1, aspectRatio);
    const scaleY = Math.max(1, 1 / aspectRatio);
    let x = shot.x * scaleX;
    let y = shot.y * scaleY;
    let vx = shot.vx * scaleX;
    let vy = shot.vy * scaleY;
    const scaledTargetX = targetX * scaleX;
    const scaledTargetY = targetY * scaleY;
    const radiusSquared = radius * radius;
    let remaining = 2.5;
    let bounces = 0;

    while (remaining > 0) {
        const timeToVerticalWall = vx > 0
            ? (scaleX - x) / vx
            : vx < 0 ? -x / vx : Infinity;
        const timeToHorizontalWall = vy > 0
            ? (scaleY - y) / vy
            : vy < 0 ? -y / vy : Infinity;
        const timeToWall = Math.min(timeToVerticalWall, timeToHorizontalWall);
        const segmentTime = Math.min(remaining, timeToWall);
        const endX = x + vx * segmentTime;
        const endY = y + vy * segmentTime;

        if (distanceToSegmentSquared(
            scaledTargetX, scaledTargetY, x, y, endX, endY
        ) <= radiusSquared) return true;
        if (!Number.isFinite(timeToWall) || timeToWall > remaining || bounces >= 3) return false;

        x = endX;
        y = endY;
        if (Math.abs(timeToVerticalWall - timeToWall) < 1e-9) vx = -vx;
        if (Math.abs(timeToHorizontalWall - timeToWall) < 1e-9) vy = -vy;
        bounces++;
        remaining -= timeToWall;
    }
    return false;
}

function applyBattleHit(client, message) {
    const room = client.room;
    const shooter = room && room.players.get(client);
    const target = room && [...room.players.entries()]
        .find(([member, player]) => player.id === message.targetId && member !== client);
    if (!room || room.mode !== 'battle' || room.startedAt === null || room.battleEnded
        || room.battleRoundOver || !shooter || !target || shooter.hp <= 0 || target[1].hp <= 0
        || typeof message.shotId !== 'string' || !room.battleShots.has(message.shotId)
        || room.resolvedBattleShots.has(message.shotId)
        || (room.requiredPlayers > 2 && shooter.teamId === target[1].teamId)) return;
    const shot = room.battleShots.get(message.shotId);
    if (shot.client !== client) return;
    const lastHitAt = room.lastBattleHitAt.get(client) || 0;
    if (Date.now() - lastHitAt < BATTLE_HIT_COOLDOWN_MS) return;

    const [targetClient, targetPlayer] = target;
    const radius = Math.max(0.012, Math.min(0.05, Number(message.hitRadius) || 0.03));
    if (!battleShotCanHitTarget(shot, targetPlayer.x, targetPlayer.y, radius)) return;

    room.resolvedBattleShots.add(message.shotId);
    room.lastBattleHitAt.set(client, Date.now());
    targetPlayer.hp = Math.max(0, targetPlayer.hp - BATTLE_HIT_DAMAGE);
    if (targetPlayer.hp === 0) {
        targetPlayer.alive = false;
        shooter.matchScore += 1;
        const remainingTeams = new Set([...room.players.values()]
            .filter(player => player.hp > 0 && player.connected)
            .map(player => player.teamId));
        broadcast(room, {
            type: 'battle-player-eliminated',
            playerId: targetPlayer.id,
            x: targetPlayer.x,
            y: targetPlayer.y,
            remainingPlayers: [...room.players.values()].filter(player => player.hp > 0 && player.connected).length
        });
        if (remainingTeams.size <= 1) {
            finishBattleRound(room, remainingTeams.size ? [...remainingTeams][0] : null);
            return;
        }
    }
    broadcast(room, { type: 'battle-state', players: battlePlayersIn(room), round: room.battleRound });
    send(targetClient, { type: 'battle-hit-confirmed', hp: targetPlayer.hp });
}

socketServer.on('connection', client => {
    client.room = null;
    client.queueKey = null;
    client.on('message', rawMessage => {
        let message;
        try {
            message = JSON.parse(rawMessage.toString());
        } catch {
            send(client, { type: 'error', code: 'invalid-message' });
            return;
        }
        if (!message || typeof message.type !== 'string') return;

        if (message.type === 'ping') {
            send(client, {
                type: 'pong',
                requestId: Number.isSafeInteger(message.requestId) ? message.requestId : null,
                clientTime: Number.isFinite(message.clientTime) ? message.clientTime : null,
                serverTime: Date.now()
            });
        } else if (message.type === 'queue-join') {
            joinMatchmakingQueue(client, message);
        } else if (message.type === 'queue-leave') {
            leaveQueue(client, true);
        } else if (message.type === 'loading-ready') {
            markPlayerLoaded(client);
        } else if (message.type === 'battle-score') {
            return;
        } else if (message.type === 'battle-hit') {
            applyBattleHit(client, message);
        } else if (message.type === 'create-room') {
            leaveQueue(client);
            leaveRoom(client);
            createRoom(client);
        } else if (message.type === 'join-room') {
            leaveQueue(client);
            if (typeof message.code !== 'string' || !/^[A-Z0-9]{5}$/.test(message.code)) {
                send(client, { type: 'error', code: 'invalid-room-code' });
                return;
            }
            leaveRoom(client);
            joinRoom(client, message.code);
        } else if (message.type === 'start-game') {
            if (!client.room || !client.room.matchmade) startGame(client.room);
        } else if (message.type === 'restart-game') {
            const room = client.room;
            if (!room || room.host !== client || room.startedAt === null) return;
            room.oxygen = 35.5;
            room.startedAt = Date.now();
            room.lastTick = room.startedAt;
            broadcast(room, {
                type: 'game-restart',
                oxygen: room.oxygen,
                elapsed: 0,
                startedAt: room.startedAt,
                serverTime: room.startedAt
            });
        } else if (message.type === 'player-state') {
            const room = client.room;
            const player = room && room.players.get(client);
            if (!player || !Number.isFinite(message.x) || !Number.isFinite(message.y)) return;
            if (room.mode === 'battle' && room.battleRoundOver && room.battleRoundReset) return;
            player.x = Math.max(0, Math.min(1, message.x));
            player.y = Math.max(0, Math.min(1, message.y));
            if (Number.isFinite(message.angle)) player.angle = message.angle;
            player.sprinting = message.sprinting === true;
            player.phaseShift = message.phaseShift === true;
            player.touchDeathActive = message.touchDeathActive === true;
            player.touchDeathTimer = Number.isFinite(message.touchDeathTimer)
                ? Math.max(0, Math.min(3, message.touchDeathTimer))
                : 0;
            player.alive = message.alive !== false;
            player.lastStateAt = Date.now();
            broadcast(room, {
                type: 'player-states',
                players: room.mode === 'battle' ? battlePlayersIn(room) : playersIn(room)
            });
        } else if (message.type === 'player-projectile') {
            const room = client.room;
            if (!room || room.startedAt === null
                || !['shot', 'grenade'].includes(message.kind)
                || (room.mode === 'battle' && message.kind !== 'shot')
                || !Number.isFinite(message.x) || !Number.isFinite(message.y)
                || !Number.isFinite(message.vx) || !Number.isFinite(message.vy)
                || (room.mode === 'battle'
                    && (!Number.isFinite(message.aspectRatio)
                        || message.aspectRatio < 0.1 || message.aspectRatio > 10))
                || message.x < 0 || message.x > 1 || message.y < 0 || message.y > 1
                || Math.abs(message.vx) > 5 || Math.abs(message.vy) > 5
                || Math.hypot(message.vx, message.vy) > 5) return;
            if (message.kind === 'grenade'
                && (!Number.isFinite(message.targetX) || !Number.isFinite(message.targetY)
                    || message.targetX < 0 || message.targetX > 1
                    || message.targetY < 0 || message.targetY > 1)) return;
            const forwarded = {
                type: 'player-projectile',
                shooterId: room.players.get(client).id,
                shotId: typeof message.shotId === 'string' && /^[A-Z0-9-]{1,64}$/i.test(message.shotId)
                    ? message.shotId
                    : undefined,
                kind: message.kind,
                x: message.x,
                y: message.y,
                vx: message.vx,
                vy: message.vy
            };
            if (room.mode === 'battle' && message.kind === 'shot') {
                forwarded.aspectRatio = message.aspectRatio;
            }
            if (message.kind === 'grenade') {
                forwarded.targetX = message.targetX;
                forwarded.targetY = message.targetY;
            }
            if (room.mode === 'battle' && message.kind === 'shot' && forwarded.shotId) {
                room.battleShots.set(forwarded.shotId, {
                    client,
                    x: message.x,
                    y: message.y,
                    vx: message.vx,
                    vy: message.vy,
                    aspectRatio: message.aspectRatio,
                    createdAt: Date.now()
                });
                if (room.battleShots.size > 500) {
                    for (const [shotId, shot] of room.battleShots) {
                        if (Date.now() - shot.createdAt > 5000 || room.battleShots.size > 500) {
                            room.battleShots.delete(shotId);
                            room.resolvedBattleShots.delete(shotId);
                        }
                    }
                }
            }
            for (const recipient of room.players.keys()) {
                if (recipient !== client) send(recipient, forwarded);
            }
        } else if (message.type === 'oxygen-event') {
            const room = client.room;
            if (!room || room.startedAt === null || !Number.isFinite(message.amount)) return;
            const amount = Math.max(-100, Math.min(20, message.amount));
            if (amount === 0) return;
            room.oxygen = Math.max(0, Math.min(100, room.oxygen + amount));
            broadcast(room, oxygenState(room));
        } else if (message.type === 'leave-room') {
            leaveQueue(client);
            leaveRoom(client);
        }
    });
    client.on('close', () => {
        leaveQueue(client);
        leaveRoom(client);
    });
    client.on('error', () => {
        leaveQueue(client);
        leaveRoom(client);
    });
});

server.listen(PORT, HOST, () => {
    console.log(`SNIPER CONTAMINATION server listening on http://${HOST}:${PORT}`);
});

function shutdown() {
    for (const room of rooms.values()) {
        clearInterval(room.interval);
        clearTimeout(room.countdownTimeout);
        clearTimeout(room.battleRoundTimeout);
    }
    socketServer.close();
    server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
