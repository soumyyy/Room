import { NativeModules } from 'react-native';

export const scheduleActions = [
  ['acOff', 'AC off'], ['acOn', 'AC on'], ['fanOff', 'Fan off'], ['fanOn', 'Fan on'],
  ['tubeOff', 'Tube light off'], ['tubeOn', 'Tube light on'], ['enter', 'Enter Room'], ['leave', 'Leave Room'], ['reminder', 'Reminder'],
] as const;
export type ScheduleAction = typeof scheduleActions[number][0];
export type ScheduleRecurrence = 'none' | 'daily' | 'weekdays';
export type RoomSchedule = {
  id: string; revision?: number; recurrence?: ScheduleRecurrence; action: ScheduleAction; title?: string; message?: string; runAt: string; timeZone: string;
  status: 'scheduled' | 'running' | 'completed' | 'partial' | 'failed' | 'missed' | 'cancelled';
  results?: { device: string; status: string; error?: string }[];
};
export type ScheduleSettings = { configured: boolean; notificationStatus: string; pushRegistered: boolean };
export type ScheduleList = { schedules: RoomSchedule[]; capabilities: { cloudDevices: boolean; bulbs: boolean; pushConfigured: boolean } };
type Bridge = {
  readScheduleSettings(): Promise<string>;
  listSchedules(): Promise<string>;
  createSchedule(payload: object): Promise<string>;
  cancelSchedule(id: string): Promise<string>;
  retrySchedule(payload: { id: string; requestId: string }): Promise<string>;
  editSchedule(payload: { id: string; runAt: string; revision: number; recurrence: ScheduleRecurrence }): Promise<string>;
  consumeScheduleNotification(): Promise<string | null>;
  requestScheduleNotifications(): Promise<string>;
};
function native(): Bridge {
  const bridge = NativeModules.RoomSnapshotBridge as Bridge | undefined;
  if (!bridge?.readScheduleSettings) throw new Error('Schedules require the updated Room iOS build.');
  return bridge;
}
function parse<T>(raw: string): T { return JSON.parse(raw) as T; }
export async function readScheduleSettings() { return parse<ScheduleSettings>(await native().readScheduleSettings()); }
export async function listSchedules() { return parse<ScheduleList>(await native().listSchedules()); }
export async function requestScheduleNotifications() { return parse<ScheduleSettings>(await native().requestScheduleNotifications()); }
export async function consumeScheduleNotification() { return await native().consumeScheduleNotification(); }
export async function editSchedule(item: RoomSchedule, at: Date, recurrence: ScheduleRecurrence) { return parse<RoomSchedule>(await native().editSchedule({ id: item.id, runAt: at.toISOString(), revision: item.revision ?? 1, recurrence })); }
export async function retrySchedule(id: string, requestId: string) { return parse<RoomSchedule>(await native().retrySchedule({ id, requestId })); }
export async function cancelSchedule(id: string) { return parse<RoomSchedule>(await native().cancelSchedule(id)); }
export async function createSchedule(action: ScheduleAction, runAt: Date, acknowledgePartialScene: boolean, requestId: string, message?: string, recurrence: ScheduleRecurrence = 'none') {
  return parse<RoomSchedule>(await native().createSchedule({
    requestId, message, recurrence,
    action, runAt: runAt.toISOString(), timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    acknowledgePartialScene,
  }));
}
export function actionLabel(action: string) { return scheduleActions.find(([value]) => value === action)?.[1] ?? action; }

export function recurrenceLabel(value?: ScheduleRecurrence) { return value === 'daily' ? 'Daily' : value === 'weekdays' ? 'Weekdays' : 'Once'; }
