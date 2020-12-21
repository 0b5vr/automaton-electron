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

export type EmittingEvent =
  | EmittingEventPlay
  | EmittingEventPause
  | EmittingEventSeek;
