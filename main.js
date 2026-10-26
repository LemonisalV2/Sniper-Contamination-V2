
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const net = require('node:net');

app.setName('SNIPER CONTAMINATION');
app.setAppUserModelId('com.yourname.snipercontamination');

let serverProcess = null;
let mainWindow = null;
let quitting = false;

const HOST = '127.0.0.1';
const PORT = 3000;
const SERVER_URL = `http://${HOST}:${PORT}`;

const SERVER_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server.js')
  : path.join(__dirname, 'server.js');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isServerReady() {
  return new Promise(resolve => {
    const socket = net.createConnection({
      host: HOST,
      port: PORT
    });

    let settled = false;

    function finish(ready) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ready);
    }

    socket.setTimeout(1000);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (quitting) {
      throw new Error('App is shutting down.');
    }

    if (await isServerReady()) {
      return;
    }

    await sleep(250);
  }

  throw new Error(
    `Game server did not start on port ${PORT}.`
  );
}

function startServer() {
  if (!fs.existsSync(SERVER_PATH)) {
    throw new Error(`Cannot find server.js: ${SERVER_PATH}`);
  }

  console.log('Starting server:', SERVER_PATH);

  serverProcess = spawn(
    process.execPath,
    [SERVER_PATH],
    {
      cwd: path.dirname(SERVER_PATH),
     env: {
  ...process.env,
  ELECTRON_RUN_AS_NODE: '1',
  NODE_PATH: app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules')
    : path.join(__dirname, 'node_modules'),
  HOST: '0.0.0.0',
  PORT: String(PORT)
},
      stdio: 'ignore',
      windowsHide: true
    }
  );

  serverProcess.on('error', error => {
    console.error('Server startup error:', error);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log('Server exited:', code, signal);
    serverProcess = null;
  });
}

async function createWindow() {
  const alreadyRunning = await isServerReady();

  if (!alreadyRunning) {
    startServer();
  }

  await waitForServer();

  if (quitting) return;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    backgroundColor: '#02040a',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on(
    'did-fail-load',
    (event, errorCode, errorDescription, validatedURL) => {
      console.error('Page failed to load:', {
        errorCode,
        errorDescription,
        validatedURL
      });
    }
  );

  await mainWindow.loadURL(SERVER_URL);
}

ipcMain.on('quit-app', () => {
  app.quit();
});

app.whenReady()
  .then(createWindow)
  .catch(error => {
    console.error('Failed to launch SNIPER CONTAMINATION:', error);
    app.quit();
  });

app.on('before-quit', () => {
  quitting = true;

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});
