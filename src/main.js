import { AutomatonWithGUI } from '@fms-cat/automaton-with-gui';
import { ipcRenderer } from 'electron';

// == init automaton ===============================================================================
const divAutomaton = document.getElementById( 'divAutomaton' );

const automaton = new AutomatonWithGUI(
  undefined,
  { gui: divAutomaton }
);

// == commands =====================================================================================
async function newFile() {
  const { canceled } = await ipcRenderer.invoke(
    'new',
    { shouldSave: automaton.shouldSave }
  );

  if ( !canceled ) {
    automaton.deserialize();
  }
}

async function openFile() {
  const { canceled, data } = await ipcRenderer.invoke(
    'open',
    { shouldSave: automaton.shouldSave }
  );

  if ( !canceled ) {
    try {
      automaton.deserialize( JSON.parse( data ) );
    } catch ( e ) {
      ipcRenderer.invoke( 'error', `An error has occured while opening the file:\n${ e }` );
    }
  }
}

async function saveFile() {
  const data = JSON.stringify( automaton.serialize() );

  const { canceled } = await ipcRenderer.invoke( 'save', { data } );

  if ( !canceled ) {
    automaton.shouldSave = false;
  }
}

async function saveFileAs() {
  const data = JSON.stringify( automaton.serialize() );

  const { canceled } = await ipcRenderer.invoke( 'saveAs', { data } );

  if ( !canceled ) {
    automaton.shouldSave = false;
  }
}

automaton.overrideSave = () => saveFile();

automaton.saveContextMenuCommands = [
  {
    name: 'New',
    description: 'Begin from scratch.',
    callback: () => newFile()
  },
  {
    name: 'Open',
    description: 'Open a file.',
    callback: () => openFile()
  },
  {
    name: 'Save',
    description: 'Overwrite the currently editing file.',
    callback: () => saveFile()
  },
  {
    name: 'Save As...',
    description: 'Save the file with a new name.',
    callback: () => saveFileAs()
  }
];

// == port dialog ==================================================================================
const dialogPort = document.getElementById( 'dialogPort' );
const inputPort = document.getElementById( 'inputPort' );

function showPortDialog() {
  dialogPort.showModal();
}

dialogPort.addEventListener( 'close', () => {
  if ( dialogPort.returnValue === 'ok' ) {
    ipcRenderer.invoke(
      'openServer',
      { port: parseInt( inputPort.value ) }
    );
  }
} );

// == websocket ====================================================================================
function processWs( raw ) {
  const data = JSON.parse( raw );
  if ( data.type === 'update' ) {
    if ( !isNaN( data.time ) ) {
      automaton.reset();
      automaton.update( data.time );
    }
  }
}

// == ipc -> command ===============================================================================
ipcRenderer.on( 'new', () => newFile() );
ipcRenderer.on( 'open', () => openFile() );
ipcRenderer.on( 'save', () => saveFile() );
ipcRenderer.on( 'saveAs', () => saveFileAs() );
ipcRenderer.on( 'undo', () => automaton.undo() );
ipcRenderer.on( 'redo', () => automaton.redo() );
ipcRenderer.on( 'ws', ( event, data ) => processWs( data ) );
ipcRenderer.on( 'showPortDialog', () => showPortDialog() );
ipcRenderer.on( 'openAbout', () => automaton.openAbout() );

// == listener -> ipc ==============================================================================
automaton.on( 'changeShouldSave', ( event ) => {
  ipcRenderer.invoke( 'changeShouldSave', event );
} );

automaton.on( 'play', () => {
  ipcRenderer.invoke( 'ws', { type: 'play' } );
} );

automaton.on( 'pause', () => {
  ipcRenderer.invoke( 'ws', { type: 'pause' } );
} );

automaton.on( 'seek', ( event ) => {
  ipcRenderer.invoke( 'ws', { type: 'seek', ...event } );
} );
