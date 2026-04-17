const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell } = require('electron');

const { APP_NAME, AC_PRESETS, BULB_GROUPS, LIGHT_PRESETS } = require('./config.cjs');
const { getAcStatus, sendAcScene } = require('./tuya.cjs');
const {
  applyGroupPreset,
  readAllBulbStatuses,
  setAllGroupsPower,
  setGroupBrightness,
  setGroupPower,
  toggleGroup,
} = require('./wiz.cjs');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 440,
    height: 920,
    minWidth: 410,
    maxWidth: 560,
    minHeight: 760,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#000000',
    show: false,
    icon: path.join(__dirname, '../../assets/Icon-1024.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

async function readDashboardState() {
  const [ac, bulbs] = await Promise.all([getAcStatus(), readAllBulbStatuses()]);
  return { ac, bulbs };
}

ipcMain.handle('room:bootstrap', async () => ({
  appName: APP_NAME,
  groups: BULB_GROUPS,
  acPresets: AC_PRESETS,
  lightPresets: LIGHT_PRESETS,
  state: await readDashboardState(),
}));

ipcMain.handle('room:refresh', async () => readDashboardState());

ipcMain.handle('room:ac:set-scene', async (_event, scene) => ({
  ac: await sendAcScene(scene),
}));

ipcMain.handle('room:lights:toggle-group', async (_event, groupId) => toggleGroup(groupId));

ipcMain.handle('room:lights:set-group-power', async (_event, { groupId, isOn }) =>
  setGroupPower(groupId, isOn),
);

ipcMain.handle('room:lights:set-all-power', async (_event, { isOn }) =>
  setAllGroupsPower(isOn),
);

ipcMain.handle('room:lights:apply-preset', async (_event, { groupId, params }) =>
  applyGroupPreset(groupId, params),
);

ipcMain.handle('room:lights:set-brightness', async (_event, { groupId, dimming }) =>
  setGroupBrightness(groupId, dimming),
);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
