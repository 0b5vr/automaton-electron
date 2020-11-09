# automaton-electron

WIP

It's very unstable and not polished

## WebSocket

- Can send:
  - `play`: When the play button is pressed
  - `pause`: When the pause button is pressed
  - `seek`: When seeking operation happened
    - `time`: `number`, indicates the seeking destination
- Can receive:
  - `update`: Send when updating operation is happened
    - `time`: `number`, specify the current time
