import { BrowserWindow, Menu, MenuItem, app, dialog, ipcMain, shell } from 'electron';
import WebSocket, { Server } from 'ws';
import { ToastyParams } from '@fms-cat/automaton-with-gui/types/GUIRemocon';
import fs from 'fs';
import path from 'path';
import recursive from 'recursive-readdir';

// == userdata management ==========================================================================
const dirAutomaton = path.resolve( app.getPath( 'home' ), '.automaton' );
const dirAutomatonFxs = path.resolve( dirAutomaton, 'fxs' );

/**
 * @param {string} path
 */
async function ensureDir( path: string ): Promise<void> {
  await fs.promises.access( path, fs.constants.F_OK ).catch( async ( error ) => {
    if ( error.code === 'ENOENT' ) {
      await fs.promises.mkdir( path );
    } else {
      throw error;
    }
  } );
}

async function ensureAutomatonDirs(): Promise<void> {
  await ensureDir( dirAutomaton );
  await ensureDir( dirAutomatonFxs );
}

async function loadFxDefinitions(): Promise<{ [ name: string ]: string }> {
  await ensureAutomatonDirs();

  const result: { [ name: string ]: string } = {};

  const files = await recursive( dirAutomatonFxs );
  await Promise.all(
    files.map( async ( filepath ) => {
      // ignore files that is not .js
      if ( path.extname( filepath ) !== '.js' ) { return; }

      const key = path
        .relative( dirAutomatonFxs, filepath )
        .replace( /\\/g, '/' )
        .replace( /.js$/, '' );

      result[ key ] = filepath;
    } )
  );

  return result;
}

// == init window ==================================================================================
function createWindow(): void {
  const window = new BrowserWindow( {
    width: 1280,
    height: 320,
    title: 'Automaton',
    minWidth: 480,
    minHeight: 240,
    webPreferences: {
      nodeIntegration: true
    }
  } );

  const content = window.webContents;

  // -- state --------------------------------------------------------------------------------------
  let currentFilePath: string | null = null;
  let shouldSave = false;

  // -- helper -------------------------------------------------------------------------------------
  function changeTitle(): void {
    let str = 'Automaton';

    if ( currentFilePath != null ) {
      str = `${ currentFilePath } - ${ str }`;
    }

    if ( shouldSave ) {
      str = `* ${ str }`;
    }

    window.setTitle( str );
  }

  async function showError( message: string ): Promise<void> {
    await dialog.showMessageBox(
      window,
      {
        type: 'error',
        message
      }
    );
  }

  function toasty( params: ToastyParams ): void {
    window.webContents.send( 'toasty', params );
  }

  // -- websocket stuff ----------------------------------------------------------------------------
  let server: Server | null = null;
  const sessions = new Set<WebSocket>();

  function openWebSocket( port: number ): void {
    if ( server ) {
      toasty( {
        kind: 'error',
        message: 'WebSocket server is already running! Close the existing one before opening.'
      } );
      return;
    }

    server = new Server( { port } );

    toasty( {
      kind: 'info',
      message: `WebSocket server is running @ port ${ port }`,
      timeout: 5
    } );

    server.on( 'connection', ( ws ) => {
      sessions.add( ws );

      toasty( {
        kind: 'info',
        message: 'Someone connects to the WebSocket server',
        timeout: 2
      } );

      ws.on( 'message', ( data ) => {
        window.webContents.send( 'ws', data );
      } );

      ws.on( 'close', () => {
        sessions.delete( ws );

        toasty( {
          kind: 'info',
          message: 'Someone left the WebSocket session',
          timeout: 2
        } );
      } );
    } );
  }

  function closeWebSocket(): void {
    if ( !server ) {
      toasty( {
        kind: 'error',
        message: 'WebSocket server is not running!'
      } );
      return;
    }

    server.close( () => {
      server = null;
      sessions.clear();

      toasty( {
        kind: 'info',
        message: 'Closed WebSocket server',
        timeout: 2
      } );
    } );
  }

  // -- handle new ---------------------------------------------------------------------------------
  async function handleNew(
    event: Electron.IpcMainInvokeEvent,
    message: { shouldSave: boolean }
  ): Promise<{ canceled: boolean } | void> {
    if ( event.sender !== content ) { return; }

    if ( message.shouldSave ) {
      const { response } = await dialog.showMessageBox(
        window,
        {
          type: 'warning',
          message: 'You are going to make a new project.\nAre you sure? You are going to lose your current changes!',
          buttons: [ 'Discard Changes', 'Nope Nope Nope' ]
        }
      );

      return { canceled: response !== 0 };
    }

    currentFilePath = null;
    changeTitle();

    return { canceled: false };
  }

  ipcMain.handle( 'new', handleNew );

  // -- handle open --------------------------------------------------------------------------------
  async function handleOpen(
    event: Electron.IpcMainInvokeEvent,
    message: { shouldSave: boolean }
  ): Promise<{ canceled: boolean; data: string | null } | void> {
    if ( event.sender !== content ) { return; }

    if ( message.shouldSave ) {
      const { response } = await dialog.showMessageBox(
        window,
        {
          type: 'warning',
          message: 'You are going to open a file.\nAre you sure? You will lose your current changes after opening a file!',
          buttons: [ 'Discard Changes', 'Nope Nope Nope' ]
        }
      );

      if ( response === 1 ) {
        return { canceled: true, data: null };
      }
    }

    const { canceled, filePaths } = await dialog.showOpenDialog(
      window,
      {
        properties: [ 'openFile' ],
        filters: [ { name: 'Automaton JSON File', extensions: [ 'json' ] } ]
      }
    );

    if ( canceled ) {
      return { canceled: true, data: null };
    }

    const newFilePath = filePaths[ 0 ];

    let error: any;
    const data = await fs.promises.readFile( newFilePath, { encoding: 'utf8' } )
      .catch( ( e ) => { error = e; return null; } );

    if ( error ) {
      showError( JSON.stringify( error ) );
      return { canceled: true, data: null };
    }

    currentFilePath = newFilePath;
    changeTitle();

    return { canceled: false, data };
  }

  ipcMain.handle( 'open', handleOpen );

  // -- handle save as -----------------------------------------------------------------------------
  async function handleSaveAs(
    event: Electron.IpcMainInvokeEvent,
    message: { data: string }
  ): Promise<{ canceled: boolean } | void> {
    if ( event.sender !== content ) { return; }

    const { canceled, filePath: newFilePath } = await dialog.showSaveDialog(
      window,
      {
        filters: [ { name: 'Automaton JSON File', extensions: [ 'json' ] } ]
      }
    );

    if ( canceled ) {
      return { canceled: true };
    }

    let error: any;
    await fs.promises.writeFile( newFilePath!, message.data )
      .catch( ( e ) => { error = e; } );

    if ( error ) {
      showError( JSON.stringify( error ) );
      return { canceled: true };
    }

    currentFilePath = newFilePath ?? null;
    changeTitle();

    return { canceled: false };
  }

  ipcMain.handle( 'saveAs', handleSaveAs );

  // -- handle save --------------------------------------------------------------------------------
  async function handleSave(
    event: Electron.IpcMainInvokeEvent,
    message: { data: string }
  ): Promise<{ canceled: boolean } | void> {
    if ( event.sender !== content ) { return; }

    if ( currentFilePath == null ) {
      return await handleSaveAs( event, message );
    }

    let error: any;
    await fs.promises.writeFile( currentFilePath, message.data )
      .catch( ( e ) => { error = e; } );

    if ( error ) {
      showError( JSON.stringify( error ) );
      return { canceled: true };
    }

    changeTitle();

    return { canceled: false };
  }

  ipcMain.handle( 'save', handleSave );

  // -- handle error -------------------------------------------------------------------------------
  function handleError(
    event: Electron.IpcMainInvokeEvent,
    message: any
  ): void {
    if ( event.sender !== content ) { return; }

    showError( message );
  }

  ipcMain.handle( 'error', handleError );

  // -- handle changeShouldSave --------------------------------------------------------------------
  function handleChangeShouldSave(
    event: Electron.IpcMainInvokeEvent,
    message: { shouldSave: boolean }
  ): void {
    if ( event.sender !== content ) { return; }

    shouldSave = message.shouldSave;
    changeTitle();
  }

  ipcMain.handle( 'changeShouldSave', handleChangeShouldSave );

  // -- handle changeShouldSave --------------------------------------------------------------------
  async function handleLoadFxDefinitions(
    event: Electron.IpcMainInvokeEvent
  ): Promise<{ [ name: string ]: string } | void> {
    if ( event.sender !== content ) { return; }

    const fxDefinitions = await loadFxDefinitions();

    return fxDefinitions;
  }

  ipcMain.handle( 'loadFxDefinitions', handleLoadFxDefinitions );

  // -- handle ws (from renderer) ------------------------------------------------------------------
  function handleWs(
    event: Electron.IpcMainInvokeEvent,
    message: any
  ): void {
    if ( event.sender !== content ) { return; }

    for ( const session of sessions.values() ) {
      session.send( JSON.stringify( message ) );
    }
  }

  ipcMain.handle( 'ws', handleWs );

  // -- handle open server -------------------------------------------------------------------------
  function handleOpenServer(
    event: Electron.IpcMainInvokeEvent,
    message: { port: number }
  ): void {
    if ( event.sender !== content ) { return; }

    openWebSocket( message.port );
  }

  ipcMain.handle( 'openServer', handleOpenServer );

  // -- handle open link ---------------------------------------------------------------------------
  function handleOpenLink(
    event: Electron.Event,
    url: string
  ): void {
    event.preventDefault();
    shell.openExternal( url );
  }

  window.webContents.on( 'new-window', handleOpenLink );

  // -- menu ---------------------------------------------------------------------------------------
  const menu = new Menu();

  menu.append( new MenuItem( {
    label: 'File',
    submenu: [
      {
        label: 'New',
        click: () => window.webContents.send( 'new' )
      },
      {
        label: 'Open',
        click: () => window.webContents.send( 'open' )
      },
      {
        label: 'Save',
        accelerator: 'CmdOrCtrl+S',
        click: () => window.webContents.send( 'save' )
      },
      {
        label: 'Save As',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: () => window.webContents.send( 'saveAs' )
      },
      { type: 'separator' },
      {
        label: 'Reload Fx Definitions',
        click: () => window.webContents.send( 'reloadFxDefinitions' )
      },
      { type: 'separator' },
      {
        role: 'close',
        accelerator: 'CmdOrCtrl+W'
      },
      {
        role: 'quit',
        accelerator: 'CmdOrCtrl+Q'
      },
    ]
  } ) );

  menu.append( new MenuItem( {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => window.webContents.send( 'undo' )
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => window.webContents.send( 'redo' )
      },
      {
        label: 'Redo',
        visible: false,
        accelerator: 'CmdOrCtrl+Y',
        click: () => window.webContents.send( 'redo' )
      }
    ]
  } ) );

  menu.append( new MenuItem( {
    label: 'View',
    submenu: [
      {
        role: 'reload'
      },
      {
        role: 'toggleDevTools',
        accelerator: 'CmdOrCtrl+Shift+I'
      }
    ]
  } ) );

  menu.append( new MenuItem( {
    label: 'Connect',
    submenu: [
      {
        label: 'Open WebSocket Server',
        click: () => window.webContents.send( 'showPortDialog' )
      },
      {
        label: 'Close WebSocket Server',
        click: () => closeWebSocket()
      }
    ]
  } ) );

  menu.append( new MenuItem( {
    label: 'Help',
    submenu: [
      {
        label: 'About',
        click: () => window.webContents.send( 'openAbout' )
      }
    ]
  } ) );

  window.setMenu( menu );

  // -- open the document --------------------------------------------------------------------------
  window.loadFile( path.resolve( __dirname, '../dist-renderer/index.html' ) );

  // -- handle close -------------------------------------------------------------------------------
  async function handleClose(): Promise<void> {
    if ( shouldSave ) {
      const { response } = await dialog.showMessageBox(
        window,
        {
          type: 'warning',
          message: 'You are going to close the window.\nAre you sure? You are going to lose your current changes!',
          buttons: [ 'Discard Changes', 'Nope Nope Nope' ]
        }
      );

      if ( response === 1 ) {
        return;
      }
    }

    window.destroy();
  }

  window.on( 'close', handleClose );
}

app.whenReady().then( createWindow );
