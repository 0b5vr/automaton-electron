/**
 * An event that will be emitted when the user presses the play button.
 */
export interface EmittingEventPlay {
  type: 'play';
}

/**
 * An event that will be emitted when the user presses the pause button.
 */
export interface EmittingEventPause {
  type: 'pause';
}

/**
 * An event that will be emitted when the user seeks the time by the GUI.
 */
export interface EmittingEventSeek {
  type: 'seek';
  time: number;
}

/**
 * An event that will be emitted when the user saves the data.
 */
export interface EmittingEventSave {
  type: 'save';
  data: string;
}

export type EmittingEvent =
  | EmittingEventPlay
  | EmittingEventPause
  | EmittingEventSeek
  | EmittingEventSave;
