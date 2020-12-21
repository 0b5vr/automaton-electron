export interface ReceivingEventUpdate {
  type: 'update';
  time: number;
}

export type ReceivingEvent =
  | ReceivingEventUpdate;
