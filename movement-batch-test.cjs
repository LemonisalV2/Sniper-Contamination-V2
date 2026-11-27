const { WebSocket } = require('ws');

const url = 'ws://127.0.0.1:3000/multiplayer';
const players = [new WebSocket(url), new WebSocket(url)];
const received = [[], []];

let finished = false;
let started = 0;
let burstSent = false;

function cleanup(success, message) {
    if (finished) return;
    finished = true;

    console.log(message);

    players.forEach(player => {
        if (player.readyState === WebSocket.OPEN) {
            player.send(JSON.stringify({ type: 'leave-room' }));
            player.close();
        }
    });

    process.exit(success ? 0 : 1);
}

function fail(message) {
    cleanup(false, '\nFAILED: ' + message);
}

players.forEach((player, index) => {
    player.on('message', raw => {
        const message = JSON.parse(raw.toString());
        received[index].push(message);

        if (message.type === 'match-found') {
            player.send(JSON.stringify({ type: 'loading-ready' }));
        }

        if (message.type === 'game-start') {
            started++;

            if (started === 2 && !burstSent) {
                burstSent = true;
                console.log('Both players started.');

                players.forEach((client, playerIndex) => {
                    for (let i = 0; i < 20; i++) {
                        client.send(JSON.stringify({
                            type: 'player-state',
                            x: 0.3 + playerIndex * 0.2 + i * 0.001,
                            y: 0.5,
                            angle: 0,
                            sprinting: false,
                            phaseShift: false,
                            touchDeathActive: false,
                            touchDeathTimer: 0,
                            alive: true
                        }));
                    }
                });

                console.log('Sent 40 movement updates.');

                setTimeout(() => {
                    const counts = received.map(list =>
                        list.filter(message => message.type === 'player-states').length
                    );

                    console.log('Player 1 received broadcasts:', counts[0]);
                    console.log('Player 2 received broadcasts:', counts[1]);

                    if (counts.every(count => count > 0 && count < 40)) {
                        cleanup(true,
                            '\nSUCCESS: Movement updates were batched!');
                    } else {
                        fail('Unexpected broadcast counts. Batching may not be working.');
                    }
                }, 500);
            }
        }
    });

    player.on('error', error => fail(error.message));
});

Promise.all(players.map(player => new Promise((resolve, reject) => {
    player.once('open', resolve);
    player.once('error', reject);
}))).then(() => {
    console.log('Both players connected.');

    players.forEach(player => {
        player.send(JSON.stringify({
            type: 'queue-join',
            mode: 'team',
            requiredPlayers: 2
        }));
    });
}).catch(error => fail(error.message));

setTimeout(() => {
    if (!finished) fail('Test timed out.');
}, 15000);
