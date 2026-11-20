import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { applyFont } from '../fonts';
import { actionLabel, cancelSchedule, createSchedule, editSchedule, listSchedules, readScheduleSettings, requestScheduleNotifications, retrySchedule, recurrenceLabel, scheduleActions, type RoomSchedule, type ScheduleAction, type ScheduleList, type ScheduleRecurrence, type ScheduleSettings } from '../schedules';
import { styles } from '../styles';
import { theme } from '../theme';

function when(at: string) {
  return new Date(at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function relative(at: string) {
  const minutes = Math.ceil((Date.parse(at) - Date.now()) / 60_000);
  return minutes <= 0 ? 'Due now' : minutes < 60 ? `In ${minutes} min` : `In ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
const messageOf = (error: unknown) => error instanceof Error ? error.message : String(error);

export default function SchedulesSheet({ visible, onClose, onDiagnostics }: { visible: boolean; onClose(): void; onDiagnostics(): void }) {
  const [settings, setSettings] = useState<ScheduleSettings | null>(null);
  const [data, setData] = useState<ScheduleList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<RoomSchedule | null>(null);
  const [action, setAction] = useState<ScheduleAction>('acOff');
  const [mode, setMode] = useState<'duration' | 'date'>('duration');
  const [hours, setHours] = useState('6');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reminder, setReminder] = useState('');
  const [recurrence, setRecurrence] = useState<ScheduleRecurrence>('none');
  const pending = useRef<{ signature: string; at: Date; requestId: string } | null>(null);
  const generation = useRef(0);
  const retryRequests = useRef(new Map<string, string>());
  const scene = action === 'enter' || action === 'leave';

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    setBusy(true); setError('');
    try {
      const current = await readScheduleSettings();
      if (request !== generation.current) return;
      setSettings(current);
      if (current.configured) {
        const next = await listSchedules();
        if (request === generation.current) setData(next);
      } else { setData(null); }
    } catch (error) { if (request === generation.current) setError(messageOf(error)); }
    finally { if (request === generation.current) setBusy(false); }
  }, []);

  useEffect(() => {
    if (!visible) return;
    void refresh();
    const listener = AppState.addEventListener('change', (state) => { if (state === 'active') void refresh(); });
    return () => { generation.current++; listener.remove(); };
  }, [visible, refresh]);

  async function perform(task: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await task(); }
    catch (error) { setError(messageOf(error)); }
    finally { setBusy(false); }
  }

  function beginEdit(item: RoomSchedule) {
    const at = new Date(item.runAt);
    setAction(item.action); setMode('date'); setRecurrence(item.recurrence ?? 'none');
    setDate(`${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`);
    setTime(`${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`);
    setEditing(item); setAdding(true); setError(''); setNotice('');
  }

  function submit() {
    let at: Date;
    if (mode === 'duration') {
      const duration = Number(hours.trim());
      if (!Number.isFinite(duration) || duration <= 0 || duration > 8760) { setError('Enter a duration greater than zero and no more than 8760 hours.'); return; }
      at = new Date(Date.now() + duration * 3_600_000);
    } else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) { setError('Use YYYY-MM-DD and 24-hour HH:MM.'); return; }
      at = new Date(`${date}T${time}:00`);
      const [year, month, day] = date.split('-').map(Number);
      const [hour, minute] = time.split(':').map(Number);
      if (at.getFullYear() !== year || at.getMonth() !== month - 1 || at.getDate() !== day || at.getHours() !== hour || at.getMinutes() !== minute) {
        setError('That date or local time does not exist.'); return;
      }
    }
    const signature = JSON.stringify({ editing: editing?.id, action, mode, hours, date, time, reminder, recurrence });
    if (pending.current?.signature === signature) at = pending.current.at;
    if (!editing && action === 'reminder' && !reminder.trim()) { setError('Enter a reminder message.'); return; }
    if (!Number.isFinite(at.getTime()) || at.getTime() <= Date.now()) { setError('Choose a future date and time.'); return; }
    if (at.getTime() - Date.now() > 8760 * 3_600_000) { setError('Choose a time within the next year.'); return; }
    const save = () => void perform(async () => {
      if (pending.current?.signature !== signature) pending.current = { signature, at, requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}` };
      let created: RoomSchedule;
      try { created = editing ? await editSchedule(editing, pending.current.at, recurrence) : await createSchedule(action, pending.current.at, scene, pending.current.requestId, reminder.trim() || undefined, recurrence); }
      catch (error) { throw new Error(editing ? `${messageOf(error)} Couldn't confirm the update. Refresh and reopen this schedule before retrying.` : `${messageOf(error)} Couldn't confirm creation. Refresh before retrying; retrying this unchanged form uses the same request.`); }
      pending.current = null;
      setAdding(false); setEditing(null);
      await refresh();
      setNotice(`${actionLabel(created.action)} ${editing ? 'updated' : 'scheduled'} for ${when(created.runAt)} · ${recurrenceLabel(created.recurrence)}.`);
    });
    Alert.alert(`${actionLabel(action)} · ${when(at.toISOString())} · ${recurrenceLabel(recurrence)}`, scene
      ? 'Cloud devices will be attempted. WiZ bulbs cannot run through the current cloud connection. Incomplete actions are recorded and a failure alert is sent when available.'
      : action === 'reminder' ? 'This sends an alert without controlling a device. Notifications and server push delivery must be enabled.' : 'This action runs through the scheduling service even when Room is closed.',
    [{ text: 'Back', style: 'cancel' }, { text: editing ? 'Save time' : 'Schedule', onPress: save }]);
  }

  function retry(item: RoomSchedule) {
    Alert.alert('Retry failed steps?', `${actionLabel(item.action)}: successful steps will not be repeated. Local WiZ bulbs remain unavailable through the cloud.`, [
      { text: 'Back', style: 'cancel' },
      { text: 'Retry failed steps', onPress: () => void perform(async () => {
        let requestId = retryRequests.current.get(item.id);
        if (!requestId) {
          requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
          retryRequests.current.set(item.id, requestId);
        }
        try { await retrySchedule(item.id, requestId); }
        catch (error) { throw new Error(`${messageOf(error)} Couldn't confirm the retry. Refresh before retrying; another attempt uses the same request.`); }
        retryRequests.current.delete(item.id);
        await refresh(); setNotice('Failed steps queued for retry.');
      }) },
    ]);
  }

  function cancel(item: RoomSchedule) {
    Alert.alert('Cancel schedule?', `${actionLabel(item.action)} · ${when(item.runAt)}${item.recurrence && item.recurrence !== 'none' ? '\nThis stops this repeating schedule and its future runs.' : ''}`, [
      { text: 'Keep', style: 'cancel' }, { text: 'Cancel schedule', style: 'destructive', onPress: () => void perform(async () => { await cancelSchedule(item.id); await refresh(); }) },
    ]);
  }

  if (!visible) return null;
  const upcoming = (data?.schedules ?? []).filter((item) => item.status === 'scheduled' || item.status === 'running').sort((a, b) => Date.parse(a.runAt) - Date.parse(b.runAt));
  const history = (data?.schedules ?? []).filter((item) => item.status !== 'scheduled' && item.status !== 'running').sort((a, b) => Date.parse(b.runAt) - Date.parse(a.runAt));
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView style={local.modal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Pressable accessible={false} style={styles.sheetOverlay} onPress={onClose} />
        <View style={[styles.sheet, local.sheet]} accessibilityViewIsModal>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Schedules & Alerts</Text>
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.sheetClose}><Text style={styles.sheetCloseText}>Done</Text></Pressable>
          </View>
          <ScrollView style={local.scroll} contentContainerStyle={local.content} keyboardShouldPersistTaps="handled">
            <View style={local.row}>
              <Button label="Refresh" disabled={busy} onPress={() => void refresh()} />
              {settings?.configured ? <Button label={adding ? 'Close form' : 'Add'} disabled={busy} onPress={() => { setAdding(!adding); setEditing(null); setRecurrence('none'); }} /> : null}
              {busy ? <ActivityIndicator color={theme.sand} /> : null}
            </View>
            {error ? <Text accessibilityRole="alert" style={local.error}>{error}{data ? ' Showing the last loaded schedules.' : ''}</Text> : null}
            {notice ? <Text accessibilityLiveRegion="polite" style={local.body}>{notice}</Text> : null}
            {settings?.configured ? <View style={local.section}>
              <Text style={local.caption}>{
                data?.capabilities.pushConfigured === false
                  ? 'Failure alerts are available in Recent activity. Push delivery is pending server setup.'
                  : settings.notificationStatus === 'notDetermined'
                    ? 'Allow notifications to receive failure alerts.'
                    : settings.notificationStatus === 'denied'
                      ? 'Notifications are off. You can allow them in iPhone Settings.'
                      : settings.pushRegistered
                        ? 'This iPhone is registered for failure alerts.'
                        : 'Notifications are allowed. iPhone registration is pending.'
              }</Text>
              {data?.capabilities.pushConfigured !== false ? <View style={local.row}>
                {settings.notificationStatus === 'denied'
                  ? <Button label="Notification settings" disabled={busy} onPress={() => void Linking.openSettings()} />
                  : <Button label={settings.notificationStatus === 'notDetermined' ? 'Enable failure alerts' : 'Register iPhone'} disabled={busy || settings.pushRegistered} onPress={() => void perform(async () => { setSettings(await requestScheduleNotifications()); })} />}
              </View> : null}
            </View> : null}
            {adding && settings?.configured ? <View style={local.section}>
              <Text style={local.heading}>{editing ? `Edit ${actionLabel(editing.action)}` : 'New schedule'}</Text>
              {!editing ? <View style={local.choices}>{scheduleActions.map(([value, label]) => <Choice key={value} label={label} selected={action === value} disabled={busy} onPress={() => setAction(value)} />)}</View> : null}
              {action === 'reminder' && !editing ? <TextInput accessibilityLabel="Reminder message" placeholder="What should Room remind you about?" placeholderTextColor={theme.mute} value={reminder} onChangeText={setReminder} maxLength={240} editable={!busy} style={local.input} /> : null}
              <View style={local.row}>
                <Choice label="After a duration" selected={mode === 'duration'} disabled={busy} onPress={() => setMode('duration')} />
                <Choice label="At a time" selected={mode === 'date'} disabled={busy} onPress={() => setMode('date')} />
              </View>
              {mode === 'duration' ? <>
                <Text style={local.caption}>Hours from now (for example 6, 7, or 0.5)</Text>
                <TextInput accessibilityLabel="Hours from now" value={hours} onChangeText={setHours} keyboardType="decimal-pad" editable={!busy} style={local.input} />
              </> : <>
                <Text style={local.caption}>Local date and 24-hour time · {Intl.DateTimeFormat().resolvedOptions().timeZone}</Text>
                <TextInput accessibilityLabel="Schedule date YYYY-MM-DD" placeholder="YYYY-MM-DD" placeholderTextColor={theme.mute} value={date} onChangeText={setDate} autoCorrect={false} editable={!busy} style={local.input} />
                <TextInput accessibilityLabel="Schedule time HH:MM" placeholder="HH:MM" placeholderTextColor={theme.mute} value={time} onChangeText={setTime} keyboardType="numbers-and-punctuation" editable={!busy} style={local.input} />
              </>}
              <Text style={local.caption}>Repeat</Text>
              <View style={local.row}>{(['none', 'daily', 'weekdays'] as const).map((value) => <Choice key={value} label={recurrenceLabel(value)} selected={recurrence === value} disabled={busy} onPress={() => setRecurrence(value)} />)}</View>
              {recurrence !== 'none' ? <Text style={local.caption}>Repeats at the first run's clock time in {editing?.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone}. Weekdays means Monday–Friday. Cancel the upcoming run to stop repeating.</Text> : null}
              {scene ? <Text style={local.caption}>Room scenes can be incomplete: the current cloud connection cannot control the WiZ bulbs. Enter restores the saved state when available.</Text> : null}
              <Button label="Review schedule" disabled={busy} onPress={submit} />
            </View> : null}
            <Text style={local.heading}>Upcoming</Text>
            {!upcoming.length ? <Text style={local.caption}>{settings?.configured ? 'No upcoming schedules.' : 'Scheduling is unavailable.'}</Text> : null}
            {upcoming.map((item) => <View key={item.id} style={local.item}>
              <Text style={local.body}>{actionLabel(item.action)}</Text>
              {item.message ? <Text style={local.caption}>{item.message}</Text> : null}
              <Text style={local.caption}>{when(item.runAt)} · {item.status === 'running' ? 'Running' : relative(item.runAt)} · {recurrenceLabel(item.recurrence)}</Text>
              {item.status === 'scheduled' ? <View style={local.row}><Button label="Edit" disabled={busy} onPress={() => beginEdit(item)} /><Button label="Cancel" disabled={busy} onPress={() => cancel(item)} /></View> : null}
            </View>)}
            <Text style={local.heading}>Recent activity</Text>
            {!history.length ? <Text style={local.caption}>No completed schedules yet.</Text> : null}
            {history.map((item) => <View key={item.id} style={local.item}>
              <Text style={local.body}>{actionLabel(item.action)} · {item.status}</Text>
              {item.message ? <Text style={local.caption}>{item.message}</Text> : null}
              <Text style={local.caption}>{when(item.runAt)} · {recurrenceLabel(item.recurrence)}</Text>
              {item.results?.map((result, index) => <Text key={`${result.device}-${index}`} style={result.status === 'failed' || result.status === 'unavailable' ? local.error : local.caption}>{result.device}: {result.status === 'command_sent' ? 'command sent' : result.status}{result.error ? ` · ${result.error}` : ''}</Text>)}
              {item.status === 'partial' || item.status === 'failed' ? <Button label="Retry failed steps" disabled={busy} onPress={() => retry(item)} /> : null}
            </View>)}
            <Button label="Diagnostics" onPress={onDiagnostics} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
function Button({ label, onPress, disabled = false }: { label: string; onPress(): void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={[local.button, disabled && local.disabled]}><Text style={local.buttonText}>{label}</Text></Pressable>;
}
function Choice({ label, selected, disabled, onPress }: { label: string; selected: boolean; disabled: boolean; onPress(): void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected, disabled }} disabled={disabled} onPress={onPress} style={[local.choice, selected && local.selected]}><Text style={selected ? local.body : local.caption}>{label}</Text></Pressable>;
}
const local = applyFont(StyleSheet.create({
  modal: { flex: 1 }, sheet: { maxHeight: '86%' }, scroll: { flexGrow: 0 }, content: { padding: 20, gap: 12, paddingBottom: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10 }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  section: { gap: 12, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.dim },
  heading: { color: theme.strong, fontSize: 16, fontWeight: '600', marginTop: 6 }, body: { color: theme.text, fontSize: 14 }, caption: { color: theme.mute, fontSize: 13, lineHeight: 19 },
  error: { color: theme.red, fontSize: 13, lineHeight: 19 }, input: { color: theme.text, borderColor: theme.dim, borderWidth: StyleSheet.hairlineWidth, borderRadius: 8, padding: 12, fontSize: 15, minHeight: 44 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }, buttonText: { color: theme.sand, fontSize: 14, fontWeight: '600' }, disabled: { opacity: 0.4 },
  choice: { padding: 10, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: theme.dim, borderRadius: 8 }, selected: { borderColor: theme.sand, backgroundColor: theme.panel },
  item: { gap: 3, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: theme.line },
}));
