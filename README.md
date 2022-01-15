# automaton-electron

WIP

It's very unstable and not polished

## WebSocket

See [src-renderer/events](./src-renderer/events)

## Use your own fx definitions

Put your fx definition as an esm module with a default export, at `%USERPROFILE%\.automaton\fxs`, as a `.js` extension file.

e.g. put

```js
export default {
  name: 'Add', // display name
  description: 'Example of user-defined fx definition', // description of the fx definition
  params: { // params. can be float, int or boolean
    value: { name: 'Value', type: 'float', default: 1.0 },
  },
  func( context ) { // define your procedure here
    return context.value + context.params.value;
  }
}
```

into

`%USERPROFILE%\.automaton\fxs\0b5vr\add.js`

## Build

```sh
yarn
yarn electron-forge import
yarn build
```
