const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('roomApi', {
  bootstrap: () => ipcRenderer.invoke('room:bootstrap'),
  refresh: () => ipcRenderer.invoke('room:refresh'),
  setAcScene: (scene) => ipcRenderer.invoke('room:ac:set-scene', scene),
  toggleLightGroup: (groupId) => ipcRenderer.invoke('room:lights:toggle-group', groupId),
  setGroupPower: (groupId, isOn) =>
    ipcRenderer.invoke('room:lights:set-group-power', { groupId, isOn }),
  setAllLightsPower: (isOn) => ipcRenderer.invoke('room:lights:set-all-power', { isOn }),
  applyLightPreset: (groupId, params) =>
    ipcRenderer.invoke('room:lights:apply-preset', { groupId, params }),
  setLightBrightness: (groupId, dimming) =>
    ipcRenderer.invoke('room:lights:set-brightness', { groupId, dimming }),
});
