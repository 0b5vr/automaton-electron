const path = require( 'path' );
const { app, dialog, Menu, MenuItem, ipcMain, shell, BrowserWindow } = require( 'electron' );
const fs = require( 'fs' ).promises;
const { Server } = require( 'ws' );

// == init window ==================================================================================
function createWindow() {
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
  let currentFilePath = null;
  let shouldSave = false;

  // -- helper -------------------------------------------------------------------------------------
  function changeTitle() {
    let str = 'Automaton';

    if ( currentFilePath != null ) {
      str = `${ currentFilePath } - ${ str }`;
    }

    if ( shouldSave ) {
      str = `* ${ str }`;
    }

    window.setTitle( str );
  }

  /**
   * @param { string } message
   */
  function showError( message ) {
    dialog.showMessageBox(
      window,
      {
        type: 'error',
        message
      }
    );
  }

  // -- websocket stuff ----------------------------------------------------------------------------
  let server;
  const sessions = new Set();

  const openWebSocket = ( port ) => {
    if ( server ) {
      showError( 'Server is already running! Close the existing one before opening.' );
      return;
    }

    server = new Server( { port } );

    server.on( 'connection', ( ws ) => {
      sessions.add( ws );

      ws.on( 'message', ( data ) => {
        window.webContents.send( 'ws', data );
      } );

      ws.on( 'close', () => {
        sessions.delete( ws );
      } );
    } );
  };

  const closeWebSocket = () => {
    if ( !server ) {
      showError( 'Server is not running!' );
      return;
    }

    return new Promise( ( resolve ) => {
      server.close( () => {
        server = null;
        sessions.clear();
        resolve();
      } );
    } );
  };

  // -- handle new ---------------------------------------------------------------------------------
  const handleNew = async ( event, message ) => {
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
  };
  ipcMain.handle( 'new', handleNew );

  // -- handle open --------------------------------------------------------------------------------
  const handleOpen = async ( event, message ) => {
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

    let error;
    const data = await fs.readFile( newFilePath, { encoding: 'utf8' } )
      .catch( ( e ) => { error = e; } );

    if ( error ) {
      showError( JSON.stringify( error ) );
      return { canceled: true, data: null };
    }

    currentFilePath = newFilePath;
    changeTitle();

    return { canceled: false, data };
  };
  ipcMain.handle( 'open', handleOpen );

  // -- handle save as -----------------------------------------------------------------------------
  const handleSaveAs = async ( event, message ) => {
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

    let error;
    await fs.writeFile( newFilePath, message.data )
      .catch( ( e ) => { error = e; } );

    if ( error ) {
      showError( JSON.stringify( error ) );
      return { canceled: true };
    }

    currentFilePath = newFilePath;
    changeTitle();

    return { canceled: false };
  };
  ipcMain.handle( 'saveAs', handleSaveAs );

  // -- handle save --------------------------------------------------------------------------------
  const handleSave = async ( event, message ) => {
    if ( event.sender !== content ) { return; }

    if ( currentFilePath == null ) {
      return await handleSaveAs( event, message );
    }

    let error;
    await fs.writeFile( currentFilePath, message.data )
      .catch( ( e ) => { error = e; } );

    if ( error ) {
      showError( JSON.stringify( error ) );
      return { canceled: true };
    }

    changeTitle();

    return { canceled: false };
  };
  ipcMain.handle( 'save', handleSave );

  // -- handle error -------------------------------------------------------------------------------
  const handleError = ( event, message ) => {
    if ( event.sender !== content ) { return; }

    showError( message );
  };
  ipcMain.handle( 'error', handleError );

  // -- handle changeShouldSave --------------------------------------------------------------------
  const handleChangeShouldSave = ( event, message ) => {
    if ( event.sender !== content ) { return; }

    shouldSave = message.shouldSave;
    changeTitle();
  };
  ipcMain.handle( 'changeShouldSave', handleChangeShouldSave );

  // -- handle ws (from renderer) ------------------------------------------------------------------
  const handleWs = ( event, message ) => {
    if ( event.sender !== content ) { return; }

    for ( const session of sessions.values() ) {
      session.send( JSON.stringify( message ) );
    }
  };
  ipcMain.handle( 'ws', handleWs );

  // -- handle open link ---------------------------------------------------------------------------
  const handleOpenLink = ( event, url ) => {
    event.preventDefault();
    shell.openExternal( url );
  };
  window.webContents.on( 'new-window', handleOpenLink );

  // -- handle open server -------------------------------------------------------------------------
  const handleOpenServer = ( event, message ) => {
    if ( event.sender !== content ) { return; }

    openWebSocket( message.port );
  };
  ipcMain.handle( 'openServer', handleOpenServer );

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
      { label: 'haha', type: 'separator' },
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
  const handleClose = async () => {
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
  };
  window.on( 'close', handleClose );
}

app.whenReady().then( createWindow );
