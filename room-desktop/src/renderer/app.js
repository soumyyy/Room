const MODE_OPTIONS = [
  { value: 0, label: 'Cool' },
  { value: 2, label: 'Auto' },
  { value: 3, label: 'Fan' },
  { value: 4, label: 'Dry' },
];

const FAN_OPTIONS = [
  { value: 0, label: 'Auto' },
  { value: 1, label: 'Low' },
  { value: 2, label: 'Mid' },
  { value: 3, label: 'High' },
];

const DEFAULT_BULB_BRIGHTNESS = 68;

const state = {
  ac: { power: 0, mode: 0, temp: 24, wind: 1 },
  bulbs: [],
  groups: [],
  acPresets: [],
  lightPresets: [],
  selectedColorByGroup: {},
  inRoom: true,
  savedRoomState: null,
  roomBusy: false,
  acBusy: false,
  allLightsBusy: false,
  groupBusyById: {},
  colorSheetGroupId: null,
  sheetBrightness: DEFAULT_BULB_BRIGHTNESS,
};

const elements = {
  toastWrap: document.getElementById('toastWrap'),
  toast: document.getElementById('toast'),
  splash: document.getElementById('splash'),
  roomToggleButton: document.getElementById('roomToggleButton'),
  acPowerButton: document.getElementById('acPowerButton'),
  acTempRow: document.getElementById('acTempRow'),
  tempValue: document.getElementById('tempValue'),
  tempMeta: document.getElementById('tempMeta'),
  tempDownButton: document.getElementById('tempDownButton'),
  tempUpButton: document.getElementById('tempUpButton'),
  acControls: document.getElementById('acControls'),
  acPresetRail: document.getElementById('acPresetRail'),
  modeValue: document.getElementById('modeValue'),
  modeRail: document.getElementById('modeRail'),
  fanValue: document.getElementById('fanValue'),
  fanRail: document.getElementById('fanRail'),
  allLightsButton: document.getElementById('allLightsButton'),
  lightsGrid: document.getElementById('lightsGrid'),
  sheetRoot: document.getElementById('sheetRoot'),
  sheetOverlay: document.getElementById('sheetOverlay'),
  sheetCloseButton: document.getElementById('sheetCloseButton'),
  sheetTitle: document.getElementById('sheetTitle'),
  sheetBrightnessValue: document.getElementById('sheetBrightnessValue'),
  sheetBrightnessRange: document.getElementById('sheetBrightnessRange'),
  sheetVividGrid: document.getElementById('sheetVividGrid'),
  sheetWhiteRow: document.getElementById('sheetWhiteRow'),
  sheetSoftRow: document.getElementById('sheetSoftRow'),
};

let toastTimer = null;

function modeLabel(mode) {
  return MODE_OPTIONS.find((option) => option.value === mode)?.label ?? 'Cool';
}

function fanLabel(wind) {
  return FAN_OPTIONS.find((option) => option.value === wind)?.label ?? 'Auto';
}

function clampTemp(value) {
  return Math.max(16, Math.min(30, Math.round(value)));
}

function clampBrightness(value) {
  return Math.max(10, Math.min(100, Math.round(value)));
}

function bulbsForGroup(groupId) {
  const group = state.groups.find((entry) => entry.id === groupId);
  return state.bulbs.filter((bulb) => group?.bulbIds.includes(bulb.id));
}

function presetById(presetId) {
  return state.lightPresets.find((preset) => preset.id === presetId) ?? null;
}

function mergeBulbs(nextBulbs) {
  state.bulbs = nextBulbs.map((bulb) => ({
    ...bulb,
    brightness:
      Number.isFinite(Number(bulb.brightness)) && bulb.brightness !== null
        ? clampBrightness(Number(bulb.brightness))
        : DEFAULT_BULB_BRIGHTNESS,
  }));
}

function showToast(message) {
  elements.toastWrap.hidden = false;
  elements.toast.textContent = message;

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    elements.toastWrap.hidden = true;
  }, 2600);
}

function renderRoomButton() {
  elements.roomToggleButton.disabled = state.roomBusy;
  elements.roomToggleButton.className = `room-btn ${
    state.inRoom ? 'room-btn-in' : 'room-btn-out'
  }${state.roomBusy ? ' is-busy' : ''}`;
  elements.roomToggleButton.textContent = state.roomBusy
    ? state.inRoom
      ? 'Leaving…'
      : 'Entering…'
    : state.inRoom
      ? 'Leave Room'
      : 'Enter Room';
}

function renderAc() {
  const acDisabled = state.acBusy;
  const isOn = state.ac.power === 1;

  elements.acPowerButton.disabled = acDisabled;
  elements.acPowerButton.className = `power-btn ${isOn ? 'power-btn-on' : 'power-btn-off'}`;
  elements.acTempRow.classList.toggle('is-on', isOn);
  elements.acControls.classList.toggle('is-off', !isOn);
  elements.tempValue.textContent = `${state.ac.temp}°`;
  elements.tempMeta.textContent = `${modeLabel(state.ac.mode)} · ${fanLabel(state.ac.wind)}`;
  elements.modeValue.textContent = modeLabel(state.ac.mode);
  elements.fanValue.textContent = fanLabel(state.ac.wind);
  elements.tempDownButton.disabled = acDisabled || !isOn || state.ac.temp <= 16;
  elements.tempUpButton.disabled = acDisabled || !isOn || state.ac.temp >= 30;

  elements.acPresetRail.innerHTML = '';
  for (const preset of state.acPresets) {
    const button = document.createElement('button');
    button.className = 'preset-pill';
    button.disabled = acDisabled;
    button.innerHTML = `
      <span class="preset-dot" style="background:${preset.accent}"></span>
      <span>
        <span class="preset-name">${preset.name}</span>
        <span class="preset-meta">${preset.scene.temp}° · ${modeLabel(preset.scene.mode)}</span>
      </span>
    `;
    button.addEventListener('click', () => void submitAcScene(preset.scene));
    elements.acPresetRail.appendChild(button);
  }

  elements.modeRail.innerHTML = '';
  for (const option of MODE_OPTIONS) {
    const button = document.createElement('button');
    button.className = `pill${state.ac.mode === option.value ? ' is-active' : ''}`;
    button.textContent = option.label;
    button.disabled = acDisabled || !isOn;
    button.addEventListener('click', () =>
      void submitAcScene({ ...state.ac, power: 1, mode: option.value }),
    );
    elements.modeRail.appendChild(button);
  }

  elements.fanRail.innerHTML = '';
  for (const option of FAN_OPTIONS) {
    const button = document.createElement('button');
    button.className = `pill${state.ac.wind === option.value ? ' is-active' : ''}`;
    button.textContent = option.label;
    button.disabled = acDisabled || !isOn;
    button.addEventListener('click', () =>
      void submitAcScene({ ...state.ac, power: 1, wind: option.value }),
    );
    elements.fanRail.appendChild(button);
  }
}

function renderLights() {
  const anyOn = state.bulbs.some((bulb) => bulb.isOn);
  const anyBusy = state.allLightsBusy || Object.values(state.groupBusyById).some(Boolean);
  elements.allLightsButton.textContent = anyOn ? 'All Off' : 'All On';
  elements.allLightsButton.classList.toggle('is-on', anyOn);
  elements.allLightsButton.disabled = anyBusy;

  elements.lightsGrid.innerHTML = '';

  for (const group of state.groups) {
    const members = bulbsForGroup(group.id);
    const groupOn = members.some((bulb) => bulb.isOn);
    const groupBusy = Boolean(state.groupBusyById[group.id]);
    const allOffline = members.length > 0 && members.every((bulb) => bulb.reachable === false);
    const averageBrightness = members.length
      ? Math.round(
          members.reduce(
            (sum, bulb) =>
              sum + (Number.isFinite(Number(bulb.brightness)) ? Number(bulb.brightness) : 0),
            0,
          ) / members.length,
        )
      : DEFAULT_BULB_BRIGHTNESS;
    const activePreset = presetById(state.selectedColorByGroup[group.id] ?? 'warm-white');

    const card = document.createElement('section');
    card.className = `light-tile${groupOn ? ' is-on' : ''}${groupBusy ? ' is-disabled' : ''}`;
    card.tabIndex = groupBusy ? -1 : 0;

    const top = document.createElement('div');
    top.className = 'light-tile-top';

    if (groupBusy) {
      const spinner = document.createElement('div');
      spinner.className = 'spinner tile-spinner';
      top.appendChild(spinner);
    } else {
      const dot = document.createElement('div');
      dot.className = 'light-tile-dot';
      if (groupOn && activePreset) {
        dot.style.backgroundColor = activePreset.hex;
        dot.style.boxShadow = `0 0 14px ${activePreset.hex}`;
      }
      top.appendChild(dot);

      const tune = document.createElement('button');
      tune.className = 'tile-tune';
      tune.textContent = 'Tune';
      tune.addEventListener('click', (event) => {
        event.stopPropagation();
        openColorSheet(group.id);
      });
      top.appendChild(tune);
    }

    const name = document.createElement('div');
    name.className = 'light-tile-name';
    name.textContent = group.name;

    const status = document.createElement('div');
    status.className = 'light-tile-status';
    status.textContent = allOffline ? 'Offline' : groupOn ? `${averageBrightness}%` : 'Off';

    card.appendChild(top);
    card.appendChild(name);
    card.appendChild(status);

    if (!groupBusy) {
      card.addEventListener('click', () => void toggleGroupPower(group.id));
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          void toggleGroupPower(group.id);
        }
      });
    }

    elements.lightsGrid.appendChild(card);
  }
}

function renderSheet() {
  const groupId = state.colorSheetGroupId;
  if (!groupId) {
    elements.sheetRoot.hidden = true;
    return;
  }

  const group = state.groups.find((entry) => entry.id === groupId);
  if (!group) {
    state.colorSheetGroupId = null;
    elements.sheetRoot.hidden = true;
    return;
  }

  const groupBusy = Boolean(state.groupBusyById[groupId]);
  const activeColorId = state.selectedColorByGroup[groupId] ?? 'warm-white';
  const vivid = state.lightPresets.filter((preset) => preset.category === 'vivid');
  const whites = state.lightPresets.filter((preset) => preset.category === 'white');
  const soft = state.lightPresets.filter((preset) => preset.category === 'soft');

  elements.sheetRoot.hidden = false;
  elements.sheetTitle.textContent = group.name;
  elements.sheetBrightnessValue.textContent = `${state.sheetBrightness}%`;
  elements.sheetBrightnessRange.value = String(state.sheetBrightness);
  elements.sheetBrightnessRange.disabled = groupBusy;
  elements.sheetCloseButton.disabled = groupBusy;

  renderPresetContainer(elements.sheetVividGrid, vivid, activeColorId, groupBusy, 'swatch');
  renderPresetContainer(elements.sheetWhiteRow, whites, activeColorId, groupBusy, 'chip');
  renderPresetContainer(elements.sheetSoftRow, soft, activeColorId, groupBusy, 'chip');
}

function renderPresetContainer(container, presets, activeColorId, groupBusy, variant) {
  container.innerHTML = '';

  for (const preset of presets) {
    const button = document.createElement('button');
    button.disabled = groupBusy;
    button.addEventListener('click', () => void applyLightPreset(state.colorSheetGroupId, preset));

    if (variant === 'swatch') {
      button.className = `color-swatch${activeColorId === preset.id ? ' is-active' : ''}`;
      button.style.backgroundColor = preset.hex;
      button.title = preset.name;
    } else {
      button.className = `color-chip${activeColorId === preset.id ? ' is-active' : ''}`;
      button.innerHTML = `
        <span class="color-chip-dot" style="background:${preset.hex}"></span>
        <span class="color-chip-label">${preset.name}</span>
      `;
    }

    container.appendChild(button);
  }
}

function render() {
  renderRoomButton();
  renderAc();
  renderLights();
  renderSheet();
}

async function refreshDashboard() {
  const response = await window.roomApi.refresh();
  state.ac = response.ac;
  mergeBulbs(response.bulbs);
  render();
  return response;
}

async function submitAcScene(scene) {
  const previous = { ...state.ac };
  if (
    previous.power === scene.power &&
    previous.mode === scene.mode &&
    previous.temp === scene.temp &&
    previous.wind === scene.wind
  ) {
    return;
  }

  state.acBusy = true;
  state.ac = { ...scene };
  renderAc();

  try {
    const response = await window.roomApi.setAcScene(scene);
    state.ac = response.ac;
  } catch (error) {
    state.ac = previous;
    showToast(error.message || 'AC update failed');
  } finally {
    state.acBusy = false;
    renderAc();
  }
}

async function toggleGroupPower(groupId) {
  state.groupBusyById[groupId] = true;
  renderLights();
  renderSheet();

  try {
    const response = await window.roomApi.toggleLightGroup(groupId);
    mergeBulbs(response.bulbs);
  } catch (error) {
    showToast(error.message || 'Light update failed');
  } finally {
    state.groupBusyById[groupId] = false;
    renderLights();
    renderSheet();
  }
}

async function setGroupPower(groupId, isOn) {
  state.groupBusyById[groupId] = true;
  renderLights();
  renderSheet();

  try {
    const response = await window.roomApi.setGroupPower(groupId, isOn);
    mergeBulbs(response.bulbs);
  } catch (error) {
    showToast(error.message || 'Light update failed');
  } finally {
    state.groupBusyById[groupId] = false;
    renderLights();
    renderSheet();
  }
}

async function toggleAllLights() {
  state.allLightsBusy = true;
  renderLights();

  try {
    const live = await window.roomApi.refresh();
    mergeBulbs(live.bulbs);
    renderLights();

    const shouldTurnOn = !live.bulbs.some((bulb) => bulb.isOn);
    const response = await window.roomApi.setAllLightsPower(shouldTurnOn);
    mergeBulbs(response.bulbs);
  } catch (error) {
    showToast(error.message || 'Unable to update all lights');
  } finally {
    state.allLightsBusy = false;
    renderLights();
  }
}

function openColorSheet(groupId) {
  const members = bulbsForGroup(groupId);
  const averageBrightness = members.length
    ? Math.round(
        members.reduce(
          (sum, bulb) =>
            sum + (Number.isFinite(Number(bulb.brightness)) ? Number(bulb.brightness) : 0),
          0,
        ) / members.length,
      )
    : DEFAULT_BULB_BRIGHTNESS;

  state.sheetBrightness = averageBrightness || DEFAULT_BULB_BRIGHTNESS;
  state.colorSheetGroupId = groupId;
  renderSheet();
}

function closeColorSheet() {
  state.colorSheetGroupId = null;
  renderSheet();
}

async function applyLightPreset(groupId, preset) {
  if (!groupId) {
    return;
  }

  state.groupBusyById[groupId] = true;
  renderLights();
  renderSheet();

  try {
    const response = await window.roomApi.applyLightPreset(groupId, {
      dimming: clampBrightness(state.sheetBrightness),
      ...preset.params,
    });
    mergeBulbs(response.bulbs);
    state.selectedColorByGroup[groupId] = preset.id;
  } catch (error) {
    showToast(error.message || 'Unable to apply light colour');
  } finally {
    state.groupBusyById[groupId] = false;
    renderLights();
    renderSheet();
  }
}

async function setLightBrightness(groupId, dimming) {
  if (!groupId) {
    return;
  }

  state.groupBusyById[groupId] = true;
  renderLights();
  renderSheet();

  try {
    const response = await window.roomApi.setLightBrightness(groupId, dimming);
    mergeBulbs(response.bulbs);
  } catch (error) {
    showToast(error.message || 'Unable to change brightness');
  } finally {
    state.groupBusyById[groupId] = false;
    renderLights();
    renderSheet();
  }
}

async function leaveRoom() {
  state.roomBusy = true;
  renderRoomButton();

  state.savedRoomState = {
    ac: { ...state.ac },
    activeGroupIds: state.groups
      .filter((group) => bulbsForGroup(group.id).some((bulb) => bulb.isOn))
      .map((group) => group.id),
  };

  try {
    if (state.ac.power) {
      const acResponse = await window.roomApi.setAcScene({ ...state.ac, power: 0 });
      state.ac = acResponse.ac;
    }

    await window.roomApi.setAllLightsPower(false).then((response) => {
      mergeBulbs(response.bulbs);
    });
    state.inRoom = false;
  } catch (error) {
    showToast(error.message || 'Unable to leave the room');
  } finally {
    state.roomBusy = false;
    render();
  }
}

async function enterRoom() {
  state.roomBusy = true;
  renderRoomButton();

  try {
    state.inRoom = true;
    const saved = state.savedRoomState;

    if (saved?.ac?.power) {
      const acResponse = await window.roomApi.setAcScene(saved.ac);
      state.ac = acResponse.ac;
    }

    if (saved?.activeGroupIds?.length) {
      for (const groupId of saved.activeGroupIds) {
        const response = await window.roomApi.setGroupPower(groupId, true);
        mergeBulbs(response.bulbs);
      }
    }
  } catch (error) {
    showToast(error.message || 'Unable to enter the room');
  } finally {
    state.roomBusy = false;
    render();
  }
}

async function bootstrap() {
  try {
    const bootstrapPayload = await window.roomApi.bootstrap();
    document.title = bootstrapPayload.appName;
    state.groups = bootstrapPayload.groups;
    state.acPresets = bootstrapPayload.acPresets;
    state.lightPresets = bootstrapPayload.lightPresets;
    state.ac = bootstrapPayload.state.ac;
    mergeBulbs(bootstrapPayload.state.bulbs);

    for (const group of state.groups) {
      state.selectedColorByGroup[group.id] ||= 'warm-white';
    }

    render();
  } catch (error) {
    showToast(error.message || 'Unable to start Room');
  } finally {
    setTimeout(() => {
      elements.splash.classList.add('is-hidden');
    }, 1100);
  }
}

elements.roomToggleButton.addEventListener('click', () =>
  void (state.inRoom ? leaveRoom() : enterRoom()),
);
elements.acPowerButton.addEventListener('click', () =>
  void submitAcScene({ ...state.ac, power: state.ac.power ? 0 : 1 }),
);
elements.tempDownButton.addEventListener('click', () =>
  void submitAcScene({ ...state.ac, power: 1, temp: clampTemp(state.ac.temp - 1) }),
);
elements.tempUpButton.addEventListener('click', () =>
  void submitAcScene({ ...state.ac, power: 1, temp: clampTemp(state.ac.temp + 1) }),
);
elements.allLightsButton.addEventListener('click', () => void toggleAllLights());
elements.sheetOverlay.addEventListener('click', closeColorSheet);
elements.sheetCloseButton.addEventListener('click', closeColorSheet);
elements.sheetBrightnessRange.addEventListener('input', () => {
  state.sheetBrightness = clampBrightness(Number(elements.sheetBrightnessRange.value));
  elements.sheetBrightnessValue.textContent = `${state.sheetBrightness}%`;
});
elements.sheetBrightnessRange.addEventListener('change', () =>
  void setLightBrightness(state.colorSheetGroupId, Number(elements.sheetBrightnessRange.value)),
);

void bootstrap();
