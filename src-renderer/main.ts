import * as AutomatonFxs from '@fms-cat/automaton-fxs';
import { AutomatonWithGUI } from '@fms-cat/automaton-with-gui';
import { FxDefinition } from '@fms-cat/automaton';
import { ipcRenderer } from 'electron';

// == init automaton ===============================================================================
const divAutomaton = document.getElementById( 'divAutomaton' ) as HTMLDivElement;

const automaton = new AutomatonWithGUI(
  undefined,
  {
    gui: divAutomaton,
    fxDefinitions: AutomatonFxs,
    disableChannelNotUsedWarning: true,
  }
);

// == commands =====================================================================================
async function newFile(): Promise<void> {
  const { canceled } = await ipcRenderer.invoke(
    'new',
    { shouldSave: automaton.shouldSave }
  );

  if ( !canceled ) {
    automaton.deserialize( AutomatonWithGUI.compat() );
  }
}

async function openFile(): Promise<void> {
  const { canceled, data } = await ipcRenderer.invoke(
    'open',
    { shouldSave: automaton.shouldSave }
  );

  if ( !canceled ) {
    try {
      automaton.deserialize( AutomatonWithGUI.compat( JSON.parse( data ) ) );
    } catch ( e ) {
      ipcRenderer.invoke( 'error', `An error has occured while opening the file:\n${ e }` );
      console.error( e );
    }
  }
}

async function saveFile(): Promise<void> {
  const data = JSON.stringify( automaton.serialize() );

  const { canceled } = await ipcRenderer.invoke( 'save', { data } );

  if ( !canceled ) {
    automaton.shouldSave = false;
    automaton.toasty( {
      kind: 'info',
      message: 'Saved!',
      timeout: 2
    } );
  }
}

async function saveFileAs(): Promise<void> {
  const data = JSON.stringify( automaton.serialize() );

  const { canceled } = await ipcRenderer.invoke( 'saveAs', { data } );

  if ( !canceled ) {
    automaton.shouldSave = false;
    automaton.toasty( {
      kind: 'info',
      message: 'Saved!',
      timeout: 2
    } );
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
const dialogPort = document.getElementById( 'dialogPort' ) as HTMLDialogElement;
const inputPort = document.getElementById( 'inputPort' ) as HTMLInputElement;

function showPortDialog(): void {
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
function processWs( raw: string ): void {
  const data = JSON.parse( raw );
  if ( data.type === 'update' ) {
    if ( !isNaN( data.time ) ) {
      automaton.reset();
      automaton.update( data.time );
    }
  }
}

// == load fx definitions ==========================================================================
async function loadFxDefinitions(): Promise<void> {
  const nameCodeMap: { [ name: string ]: string }
    = await ipcRenderer.invoke( 'loadFxDefinitions' );

  const fxDefinitions: { [ name: string ]: FxDefinition } = {};
  await Promise.all(
    Object.entries( nameCodeMap ).map( async ( [ name, url ] ) => {
      const m = await import( url ).catch( ( error ) => {
        automaton.toasty( {
          kind: 'error',
          message: `Failed to load the user defined fx "${ name }" !`
        } );
        console.error( error );
        return null;
      } );

      if ( m != null ) {
        fxDefinitions[ name ] = m.default;
      }
    } )
  );
  automaton.addFxDefinitions( fxDefinitions );
}
loadFxDefinitions();

// == ipc -> command ===============================================================================
ipcRenderer.on( 'new', () => newFile() );
ipcRenderer.on( 'open', () => openFile() );
ipcRenderer.on( 'save', () => saveFile() );
ipcRenderer.on( 'saveAs', () => saveFileAs() );
ipcRenderer.on( 'reloadFxDefinitions', () => loadFxDefinitions() );
ipcRenderer.on( 'undo', () => automaton.undo() );
ipcRenderer.on( 'redo', () => automaton.redo() );
ipcRenderer.on( 'ws', ( event, data ) => processWs( data ) );
ipcRenderer.on( 'showPortDialog', () => showPortDialog() );
ipcRenderer.on( 'openAbout', () => automaton.openAbout() );
ipcRenderer.on( 'toasty', ( event, params ) => automaton.toasty( params ) );

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
