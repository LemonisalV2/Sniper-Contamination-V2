# SNIPER CONTAMINATION

## Run the game and online co-op server

1. Install Node.js 18 or later.
2. From this folder, install dependencies with `npm install`.
3. Run `npm start` and open `http://localhost:3000`. In Windows PowerShell, use `npm.cmd install` and `npm.cmd start` if script execution blocks the `npm` command.
4. To play with others, make the server reachable to them (for example, on the same network or through your hosting provider) and share its URL. Players open that URL, choose **Play → Online**, select **Battle** or **Team**, then choose a match size. Matchmaking groups players who selected the same mode and size.

Team matches keep the existing co-op rules: each player runs an independent game world, while oxygen and the survival timer are shared by the room. Choose a team size from 1+1 through 1+4. Battle matches are free-for-all shootouts: every player starts each round with 100 HP and can use only the standard weapon; each confirmed hit deals 1 HP of damage. Eliminated players explode and wait for the round to finish. After a round, players can move freely during a three-second break, followed by a 3-2-1 countdown before the next round. The last player standing wins the round, and the first to five round wins takes the match. Battle sizes range from 1v1 through 5v5. Matches begin after everyone reaches the loading screen and the shared three-second countdown finishes.

The game server supports up to ten players in a match. Allies are shown in purple and blue. Player shots appear white to the shooter and blue to other players in online co-op, where they can hit snipers along their path in each player's local world; solo shots remain white. Grenades are relayed as well. Snipers keep a fixed target assignment per connected player; visible target lines are hidden, and a sniper retargets if its assigned player leaves.

With a controller, use the left/right shoulder buttons to cycle through the visible Play and Online matchmaking controls, A to select, and B to go back or cancel a search.

During solo play, open the pause menu and choose **Settings** to adjust the language, crosshair style and custom color, and preview changes to its size, thickness, center gap, opacity, outline, and center dot. Use **Reset** to restore the crosshair defaults. You can also toggle sprint behavior and the in-game battery display. These preferences are saved on the device.

Set `PORT` to change the listen port. Set `HOST` to change the listen address; it defaults to `0.0.0.0` so other devices can reach it when the network allows.

Multiplayer clients measure ping to the game server directly. The in-game HUD shows only ping: green below 30 ms, yellow from 30 through 100 ms, and red above 100 ms.
