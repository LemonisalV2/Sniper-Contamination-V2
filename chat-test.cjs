
const { WebSocket } = require('ws');

const url = 'ws://127.0.0.1:3000/multiplayer';
const players = [new WebSocket(url), new WebSocket(url)];
const received = [[], []];

let chatSent = false;
let finished = false;

function fail(message) {
    if (finished) return;
    finished = true;
    console.error('\nFAILED:', message);
    players.forEach(player => player.close());
    process.exit(1);
}

function checkChat() {
    if (finished || !chatSent) return;

    const success = received.every(list =>
        list.some(message =>
            message.type === 'chat-message' &&
            message.text === 'Hello from Player 1!'
        )
    );

    if (success) {
        finished = true;
        console.log('\nSUCCESS: Both players received the chat message!');
        players.forEach(player => {
            player.send(JSON.stringify({ type: 'leave-room' }));
            player.close();
        });
        process.exit(0);
    }
}

players.forEach((player, index) => {
    player.on('message', raw => {
        const message = JSON.parse(raw.toString());
        received[index].push(message);

        if (message.type === 'match-found') {
            console.log(`Player ${index + 1}: joined match`);
            player.send(JSON.stringify({ type: 'loading-ready' }));
        }

        if (message.type === 'match-countdown') {
            console.log(`Player ${index + 1}: countdown started`);
        }

        if (message.type === 'game-start') {
            console.log(`Player ${index + 1}: game started`);
        }

        if (message.type === 'chat-message') {
            console.log(
                `Player ${index + 1} received from ${message.senderName}: ${message.text}`
            );
            checkChat();
        }
    });

    player.on('error', error => fail(error.message));
});

Promise.all(players.map(player => new Promise((resolve, reject) => {
    player.once('open', resolve);
    player.once('error', reject);
}))).then(() => {
    console.log('Both players connected');

    players.forEach(player => {
        player.send(JSON.stringify({
            type: 'queue-join',
            mode: 'team',
            requiredPlayers: 2
        }));
    });
}).catch(error => fail(error.message));

const timeout = setTimeout(() => {
    if (!received.every(list => list.some(m => m.type === 'game-start'))) {
        fail('The two-player match did not start');
    } else if (!chatSent) {
        fail('Chat message was not sent');
    } else {
        fail('One or both players did not receive the chat message');
    }
}, 12000);

const startCheck = setInterval(() => {
    if (finished || chatSent) return;

    const bothStarted = received.every(list =>
        list.some(message => message.type === 'game-start')
    );

    if (bothStarted) {
        chatSent = true;
        console.log('\nSending chat message...');

        players[0].send(JSON.stringify({
            type: 'chat-message',
            text: 'Hello from Player 1!'
        }));

        checkChat();
    }
}, 100);

process.on('exit', () => {
    clearTimeout(timeout);
    clearInterval(startCheck);
});
