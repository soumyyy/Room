import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { applyFont } from '../fonts';
import { clearActionLog, readActionLog, type ActionRecord } from '../roomSnapshot';
import { styles } from '../styles';
import { theme } from '../theme';

/** An entry with no duration this long after it started will never finish. */
const IN_FLIGHT_GRACE_MS = 60_000;

type Status = 'ok' | 'failed' | 'interrupted' | 'running';

function statusOf(entry: ActionRecord, now: number): Status {
  if (entry.error) return 'failed';
  if (entry.milliseconds == null) return now - entry.at > IN_FLIGHT_GRACE_MS ? 'interrupted' : 'running';
  return 'ok';
}

function formatTime(at: number, now: number) {
  const date = new Date(at);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return new Date(now).toDateString() === date.toDateString()
    ? time
    : `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}

function formatDuration(ms: number | null | undefined) {
  if (ms == null) return '';
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function describe(entry: ActionRecord, now: number) {
  const status = statusOf(entry, now);
  const detail =
    status === 'failed' ? `failed: ${entry.error}` :
    status === 'interrupted' ? 'never finished (process ended)' :
    status === 'running' ? 'running' : 'ok';
  return `${formatTime(entry.at, now)}  ${entry.action}  [${entry.source}]  ${formatDuration(entry.milliseconds)}  ${detail}`;
}

/**
 * Every action the app, widget and Siri ran, newest first, with how long it
 * took and why it failed. "Never finished" marks an action whose process the
 * system ended mid-way, which is how a widget tap usually dies.
 */
export default function DiagnosticsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [entries, setEntries] = useState<ActionRecord[]>([]);
  const now = Date.now();

  useEffect(() => {
    if (visible) void readActionLog().then(setEntries);
  }, [visible]);

  if (!visible) return null;

  const newest = [...entries].reverse();
  const failed = entries.filter((entry) => statusOf(entry, now) === 'failed').length;
  const interrupted = entries.filter((entry) => statusOf(entry, now) === 'interrupted').length;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessible={false} style={styles.sheetOverlay} onPress={onClose} />
      <View style={[styles.sheet, local.sheet]} accessibilityViewIsModal>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Diagnostics</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => void Share.share({ message: newest.map((entry) => describe(entry, now)).join('\n') || 'No actions logged.' })}
            style={styles.sheetClose}
            hitSlop={12}
          >
            <Text style={styles.sheetCloseText}>Share</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => { clearActionLog(); setEntries([]); }}
            style={[styles.sheetClose, local.gap]}
            hitSlop={12}
          >
            <Text style={styles.sheetCloseText}>Clear</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onClose} style={[styles.sheetClose, local.gap]} hitSlop={12}>
            <Text style={styles.sheetCloseText}>Done</Text>
          </Pressable>
        </View>

        <Text style={local.summary}>
          {entries.length} actions · {failed} failed · {interrupted} never finished
        </Text>

        <ScrollView style={local.list} contentContainerStyle={local.listContent}>
          {newest.length === 0 ? <Text style={local.empty}>Nothing logged yet.</Text> : null}
          {newest.map((entry) => {
            const status = statusOf(entry, now);
            return (
              <View key={entry.id} style={local.row}>
                <View style={local.rowTop}>
                  <Text style={local.action} numberOfLines={2}>{entry.action}</Text>
                  <Text style={local.time}>{formatTime(entry.at, now)}</Text>
                </View>
                <Text style={local.meta}>
                  {entry.source}{entry.milliseconds != null ? ` · ${formatDuration(entry.milliseconds)}` : ''}
                </Text>
                {status === 'failed' ? <Text style={local.error}>{entry.error}</Text> : null}
                {status === 'interrupted' ? <Text style={local.error}>Never finished: the system ended the process.</Text> : null}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const local = applyFont(StyleSheet.create({
  sheet: { maxHeight: '80%' },
  gap: { marginLeft: 16 },
  summary: { color: theme.mute, fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 20, paddingBottom: 12 },
  empty: { color: theme.mute, fontSize: 14, paddingVertical: 16 },
  row: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#2a2a2a', gap: 2 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  action: { color: theme.strong, fontSize: 14, fontWeight: '600', flex: 1 },
  time: { color: theme.mute, fontSize: 12, fontVariant: ['tabular-nums'] },
  meta: { color: theme.mute, fontSize: 12 },
  error: { color: theme.red, fontSize: 12 },
}));
