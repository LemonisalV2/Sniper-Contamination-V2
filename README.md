# SNIPER CONTAMINATION

A neon, top-down arena shooter that runs entirely in the browser on an HTML5 canvas. Play solo and survive for as long as you can while your oxygen drains and waves of coloured snipers close in, or jump online for team co-op and competitive battle matches of up to 5v5.

The game supports keyboard and mouse, touch screens, and gamepads (with rumble), and ships with a full settings screen: dozens of interface languages, performance and graphics options, volume sliders, and a complete crosshair editor with live preview.

---

## Table of contents

1. [Quick start](#quick-start)
2. [Requirements](#requirements)
3. [Project files](#project-files)
4. [Server configuration](#server-configuration)
5. [How to play (solo)](#how-to-play-solo)
6. [Online play](#online-play)
7. [Controls](#controls)
8. [Settings](#settings)
9. [Saving and loading a run](#saving-and-loading-a-run)
10. [Networking notes](#networking-notes)
11. [Troubleshooting](#troubleshooting)

---

## Quick start

1. Install **Node.js 18 or later**.
2. From this folder, install dependencies:
   ```bash
   npm install
   ```
3. Start the server:
   ```bash
   npm start
   ```
4. Open `http://localhost:3000` in your browser and press **Play**.

> **Windows PowerShell:** if script execution blocks the `npm` command, use `npm.cmd install` and `npm.cmd start` instead.

Solo mode only needs the page to load. The Node.js server is required for anything online (matchmaking, Battle, and Team modes).

### Playing with other people

To play with others, make the server reachable to them, for example on the same local network or through your hosting provider, and share its URL. Everyone opens that URL, then:

1. Chooses **Play → Online**.
2. Selects **Battle** or **Team**.
3. Picks a match size.

Matchmaking groups together players who selected the **same mode and size**. When enough players are queued, a match is found and everyone is taken to a shared loading screen.

---

## Requirements

| Requirement | Details |
| --- | --- |
| Node.js | Version 18 or later, used to run the game and multiplayer server |
| Browser | A modern browser with Canvas, Web Audio, and WebSocket support |
| Network | Needed for online play only. Solo play works without a connection |
| Optional | A gamepad (Gamepad API with `dual-rumble` for vibration), or a touch screen |

The game also uses the Battery Status API where the browser provides it, to show a battery widget and to adjust performance mode automatically.

---

## Project files

The game itself is a single HTML file containing all of the markup, styles, and scripts. It loads a few media assets by relative path, so keep these next to the HTML file:

| Asset | Used for |
| --- | --- |
| `Glowing Green Energy Orb.png` | Reward orbs dropped by defeated snipers and the orbs earned on the death screen |
| `Verdant Gun Shot sound.mp3` | Green sniper gunshot |
| `Crimson Executioner Gun shot.mp3` | Red sniper gunshot |
| `Assault Rifle Gun sound.mp3` | Orange sniper gunshot |

If an asset is missing, the game still runs. The affected effect or sound is simply skipped, and a message appears in the browser console.

---

## Server configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `HOST` | `0.0.0.0` | Address the server listens on. The default lets other devices reach it when your network allows |

Example (macOS / Linux):

```bash
PORT=8080 HOST=0.0.0.0 npm start
```

Example (Windows PowerShell):

```powershell
$env:PORT = 8080
npm.cmd start
```

The browser connects to the multiplayer server over a WebSocket at the `/multiplayer` path of the same host that served the page (`ws://` for `http://` pages and `wss://` for `https://` pages). If you put the game behind a reverse proxy, make sure it forwards WebSocket upgrades for that path.

The game server supports **up to ten players in a match**.

---

## How to play (solo)

### Goal

Survive as long as possible. Your survival time is shown on the stopwatch at the top of the screen. When you die, you earn reward orbs equal to the number of whole seconds you survived.

### Oxygen

- You start with **35.5% oxygen**, and it drains steadily every second.
- **Oxygen orbs** spawn periodically. Collect one to restore **20%** oxygen (up to a maximum of 100%).
- Running out of oxygen starts a roughly ten-second fade to black with a red warning vignette, a heartbeat, and a rising tone. Collect an oxygen orb in time to recover.
- Getting hit by sniper fire also drains oxygen (see below).

### Snipers

Snipers spawn around the edge of the arena on timers. Each type has more health, a different weapon, and a bigger reward than the last.

| Sniper | Shape | Spawns every | Health | Shot effect |
| --- | --- | --- | --- | --- |
| Green | Circle | 10 s | 100 | Fires every second; each hit costs 5% oxygen |
| Red | Circle | 20 s | 150 | Fires every second; each hit costs 100% oxygen |
| Orange | Circle | 30 s | 200 | Rapid fire every 0.1 s; each hit costs 1% oxygen |
| Purple | Triangle | 60 s | 250 | Slow shot every 3 s; a hit electrocutes you |
| Blue | Circle | 70 s | 300 | Heavy shot every 5 s; costs 30% oxygen and launches you with massive knockback |
| Yellow | Star | 80 s | 350 | Fires a burst of five projectiles every 2 s; each hit costs 10% oxygen |

Additional rules:

- **Touching any sniper electrocutes you.** You freeze, flash, shatter, and the run ends.
- Snipers are knocked back when hit and bounce off the arena walls.
- Defeated snipers shatter into fragments and drop a **reward orb** worth the same number of orbs as their spawn interval (for example, 10 for a green sniper and 80 for a yellow one). Walk over it to collect it.
- Health bars and floating damage numbers show how much damage you are dealing.

### Your arsenal

Select a weapon or ability with the number keys `1`–`4`, or with the shoulder buttons on a controller.

| Slot | Name | Cooldown | Description |
| --- | --- | --- | --- |
| 1 | **Supernova Pistol** | 0.06 s between shots | Your standard weapon. Each bullet deals 1 damage and can bounce off walls up to three times |
| 2 | **Grenade** | 30 s | Thrown toward your aim point and detonates there, destroying every sniper in a 155-pixel blast radius. On touch devices it detonates at your feet |
| 3 | **EMP Pulse** | 25 s | Releases a 360-pixel pulse that stuns snipers for 3.5 seconds and wipes enemy projectiles from the screen |
| 4 | **Phase Shift** | 35 s | For 5 seconds you become intangible: bullets and snipers can't hurt you, and snipers stop shooting |

Cooldowns are shown in the ability list at the bottom right (desktop) or on the round buttons (touch).

### Sprinting

Holding sprint boosts your speed by 75% while draining a stamina bar that floats above your character. Stamina lasts about 10 seconds of sprinting and fully recovers in about 20 seconds of rest. The bar changes from green to yellow, orange, and red as it empties.

### Dying

You can die from running out of oxygen or from being electrocuted. The death screen shows how long you survived and how many orbs you earned, then offers **Restart**, **Settings**, or **Main Menu**.

---

## Online play

Choose **Play → Online**, then pick a mode and a size. Matches start once every player has reached the loading screen and the shared three-second countdown finishes.

### Team mode (co-op)

Team matches keep the co-op rules: each player runs an independent game world, while **oxygen and the survival timer are shared** by the whole room. If the shared oxygen runs out, the team suffers together.

- Team sizes range from **1+1 through 1+4**.
- Teammates appear as purple and blue avatars.
- Your shots appear **white to you** and **blue to other players**. They can hit snipers along their path in each player's local world. Grenades are relayed to teammates too.
- Snipers keep a **fixed target assignment** per connected player. Visible target lines are hidden, and a sniper retargets if its assigned player leaves.
- Only the room host can restart after a defeat.

### Battle mode (free-for-all and team shootouts)

Battle matches are competitive shootouts.

- Battle sizes range from **1v1 through 5v5**.
- Every player starts each round with **100 HP** and can use **only the standard weapon**. Abilities and grenades are disabled, and there are no snipers.
- Each confirmed hit deals **1 HP** of damage.
- Eliminated players explode and wait for the round to finish.
- After a round, players can move freely during a **three-second break**, followed by a **3-2-1 countdown** before the next round begins.
- The last player (or team) standing wins the round. The **first to five round wins** takes the match.
- Hold **Tab** to show the scoreboard with each team's round wins and the health of every player. Disconnected players are marked with a Wi-Fi icon.
- A health bar replaces the oxygen bar at the bottom of the screen, and enemy health is shown above their avatars.

### Multiplayer rules to remember

- **There is no pause in online matches.** The pause button, `Esc`, and controller pause buttons are disabled so everyone stays in sync.
- Leaving a match mid-game returns you to the main menu. If the connection drops, you'll see a notice and be taken back to the menu.
- Matchmaking can be cancelled at any time while searching.

---

## Controls

### Keyboard and mouse

| Action | Input |
| --- | --- |
| Move | `W` `A` `S` `D` or arrow keys |
| Aim | Mouse |
| Fire / use selected ability | Left mouse button (hold to keep firing the pistol) |
| Select weapon or ability | `1` `2` `3` `4` |
| Sprint | `Shift` (hold, or toggle if **Toggle Sprint** is enabled) |
| Pause (solo only) | `Esc`, `+`, or `-` |
| Scoreboard (Battle) | Hold `Tab` |
| Settings navigation | `W` / `S` to move between sections, `A` / `D` to change the focused control |

### Touch

| Action | Input |
| --- | --- |
| Move | Touch and drag anywhere to place a floating virtual joystick |
| Fire | Hold the **Supernova Pistol** button (auto-targets the nearest opponent in Battle, otherwise fires in your movement direction) |
| Grenade / EMP / Phase Shift | Tap the matching round buttons |
| Sprint | Tap the **Sprint** button to toggle sprinting while the joystick is held |
| Pause | Tap the **II** button (solo only) |

The interface switches automatically between touch, keyboard, and controller layouts as you use each input.

### Gamepad

A standard-layout controller is detected automatically, and a notification appears when one connects or disconnects.

| Action | Input |
| --- | --- |
| Move | Left stick |
| Aim | Right stick |
| Fire / use selected ability | Right trigger (`ZR`) |
| Cycle weapon or ability | Left / right shoulder buttons (`L` / `R`) |
| Sprint | `X` or `Y` |
| Pause (solo only) | `+` or `-` |

In menus, use the left and right shoulder buttons to cycle through the visible controls, **A** to select, and **B** to go back or cancel. This includes the Play and Online matchmaking screens. A **Rumble Test** button appears on the main menu when a controller is connected, which lets you check vibration. Hold **A** or **B** while it is focused.

---

## Settings

Open **Settings** from the main menu, the pause menu, or the death screen. Changes are applied immediately and saved on your device.

| Section | What it does |
| --- | --- |
| **Language** | Choose from dozens of interface languages. Menus, HUD text, tutorials, and multiplayer messages are localised |
| **Performance Mode** | **Power Saving** caps the game at about 30 FPS to conserve battery. **High Performance** matches your display's refresh rate. Performance mode can't be changed using a controller |
| **Volume Control** | Three sliders for low (60 Hz), mid (200 Hz), and high (20 kHz) sound frequencies such as heartbeat, impact sounds, and gunfire |
| **Graphics Quality** | Scales glow and shadow effects from low to high |
| **Gameplay** | Crosshair and gameplay options, described below |

### Crosshair editor

The crosshair editor includes a live preview and these options:

- **Style:** cross, dot, or circle.
- **Colour:** green, white, cyan, or yellow presets, plus a custom colour picker and hex code field.
- **Size** (8–32), **thickness** (1–8), **centre gap** (0–12), and **opacity** (20–100%).
- **Outline** toggle with adjustable outline thickness (1–6).
- **Center dot** toggle.
- **Reset** to restore every crosshair setting to its default.

### Other gameplay options

- **Toggle Sprint:** press the sprint key once to start sprinting and again to stop, instead of holding it.
- **Show Battery In-Game:** display the battery level and charging state during play.

### Automatic power saving

When the Battery Status API is available, the game switches to Power Saving mode when your battery drops below **20%** and you aren't charging, and switches back to High Performance when you plug in. A notification tells you when this happens, along with charger connect and disconnect notices.

---

## Saving and loading a run

Solo runs can be saved and resumed:

1. Open the pause menu and choose **Quit**.
2. Pick **Save and Quit** to store your current run, or **Quit** to discard it.
3. Next time you choose **Play → Solo**, you'll be asked whether to continue the saved game or start a new one. Starting a new game erases the saved one.

Saved runs are stored in your browser's local storage, so they stay on the device and browser where you saved them. Online matches can't be saved. Solo runs also pause automatically if you switch tabs or minimise the window.

---

## Networking notes

- Clients measure **ping directly to the game server**. The in-game HUD shows only ping, coloured **green below 30 ms**, **yellow from 30 through 100 ms**, and **red above 100 ms**.
- Player position and state are sent roughly ten times per second, and remote players are smoothed with a short interpolation delay so movement looks fluid.
- Server and client clocks are synchronised through the ping exchange so the shared survival timer and match countdown stay aligned.
- Online play is disabled when your device reports no internet connection, unless you are connecting to a local or private-network address (for example `localhost` or `192.168.x.x`), where LAN play still works.

---

## Troubleshooting

| Problem | What to try |
| --- | --- |
| `npm` is blocked in PowerShell | Use `npm.cmd install` and `npm.cmd start` |
| "Could not reach the multiplayer server" | Confirm `npm start` is running and the page was loaded from that same server (not opened as a local file) |
| Friends can't connect | Check that `HOST` is `0.0.0.0`, the port is open in your firewall or router, and they use your reachable address instead of `localhost` |
| The multiplayer server doesn't respond | Check the server console for errors, and make sure any reverse proxy forwards WebSocket traffic to `/multiplayer` |
| Matchmaking never finds a game | Everyone must pick the same mode **and** the same size |
| Controller isn't detected | Press any button on the controller after the page has loaded, then check browser Gamepad API support |
| No sound until I click | Browsers block audio until the first interaction. Click or tap **Play** to start audio |
| Game runs slowly | Switch to **Power Saving** mode or lower **Graphics Quality** in Settings |
| Saved run disappeared | Saves live in browser local storage. Clearing site data or using a different browser or profile removes them |
