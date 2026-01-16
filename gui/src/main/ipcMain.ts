import { BrowserWindow, dialog, ipcMain, IpcMainInvokeEvent, shell } from 'electron'
import deleteStorageAndReload from '@utils/deleteStorageAndReload'
import type { BasicEncryptor } from '@kira-encryptor/core/types'
import runEncryptorWorker from './helpers/runEncryptorWorker'
import runBackupWorker from './helpers/runBackupWorker'
import Encryptor from '@kira-encryptor/core'
import CONF from '@configs/electronConf'
import moment from 'moment'
import path from 'path'
import fs from 'fs'

const getUserConfig = () => CONF.get('userConfig')
let EncryptorConfig = getUserConfig().encryptorConfig

CONF.onDidChange('userConfig', async (newConfig, oldValue) => {
  if (!newConfig) {
    console.warn('No userConfig found, using default EncryptorConfig')
    return
  }
  console.log('[ipcMain] UserConfing has been updated')
  EncryptorConfig = newConfig.encryptorConfig

  // We check if config for the Encryptor class has changed.
  const newConfString = JSON.stringify(newConfig.encryptorConfig)
  const oldConfString = JSON.stringify(oldValue?.encryptorConfig)
  if (ENCRYPTOR && newConfString !== oldConfString) {
    await initializeEncryptor().then(() =>
      console.log('[ipcMain] Basic ENCRYPTOR instance has been updated')
    )
  }
})

let isDialogOpen = false
let ENCRYPTOR: BasicEncryptor
let PASSWORD: Buffer

async function initializeEncryptor() {
  ENCRYPTOR = await Encryptor.init(Buffer.from(PASSWORD), undefined, {
    dbPath: EncryptorConfig.dbPath,
    encoding: EncryptorConfig.encoding
  }) // This is a basic instance of the Encryptor class
}

export default function registerIpcMain() {
  ipcMain.handle('initialize-encryptor', async (_event: IpcMainInvokeEvent, password: string) => {
    try {
      // Using a buffer to have better memory control of the password.
      PASSWORD = Buffer.from(password, 'utf-8')
      await initializeEncryptor()
      return { error: null, success: true }
    } catch (error) {
      console.error('Error initializing encryptor:', error)
      return { error: (error as Error).message, success: false }
    }
  })

  ipcMain.handle('delete-storage-item', async (_event: IpcMainInvokeEvent, itemId: string) => {
    try {
      await ENCRYPTOR.refreshStorage()
      return await ENCRYPTOR.deleteStoredItem(itemId)
    } catch (error) {
      return error as Error
    }
  })

  ipcMain.handle('backup-action', async (_event, props: BackupActionProps) => {
    const src = String(props.srcPath)
    const { itemId, action } = props

    if (action === 'create') {
      const dest = path.join(
        getUserConfig().backupPath,
        `backup_${itemId}_${moment().format('DD-MM-YYYY_HH-mm-ss')}.7z`
      )
      console.log('Generate backup:', { src, dest })

      try {
        const result = await runBackupWorker({ src, dest, password: PASSWORD })
        return { error: null, success: true, dest: result.dest }
      } catch (error) {
        console.error(error)
        return { error: (error as Error).message, success: false, dest: null }
      }
    } else {
      try {
        console.log('Remove backup:', { src })
        fs.rmSync(src, { force: true, maxRetries: 3 })
        return { error: null, success: true, dest: null }
      } catch (error) {
        console.error('Error removing backup:', error)
        return { error: (error as Error).message, success: false }
      }
    }
  })

  ipcMain.on('encryptor-action', async (_event: IpcMainInvokeEvent, props: EncryptFileProps) => {
    try {
      const mainWindow = BrowserWindow.getAllWindows()[0]

      const onProgress = (progressData: string) => {
        mainWindow?.webContents.send('onProgress', progressData)
      }
      const onEnd = (endData: EncryptEndEvent) => {
        const lastSlash =
          Math.max(props.srcPath.lastIndexOf('/'), props.srcPath.lastIndexOf('\\')) + 1
        if (lastSlash > 0) {
          endData.srcPath = props.srcPath.substring(0, lastSlash)
        } else {
          console.error('Ruta de archivo no válida.')
        }
        mainWindow?.webContents.send('onOperationEnd', endData)
      }
      const onError = (errorData: unknown) => {
        mainWindow?.webContents.send('onProgressError', errorData)
        console.error(errorData)
      }

      // This function runs the encryptor worker but no uses the basic ENCRYPTOR instance.
      // Basic Encryptor instance is only used to manage the storage in the main process.
      // For that reason, we create a new worker that creates its own Encryptor instance.
      runEncryptorWorker({
        ...props,
        password: PASSWORD,
        EncryptorConfig,
        onProgress,
        onError,
        onEnd
      })
    } catch (error) {
      console.error('Error in encryptor action:', error)
      const mainWindow = BrowserWindow.getAllWindows()[0]
      mainWindow?.webContents.send('onProgressError', {
        message: (error as Error).message,
        srcPath: props.srcPath,
        itemId: props.itemId
      } as ProgressCallbackErrorProps)
    }
  })

  ipcMain.handle('open-explorer', async (event: IpcMainInvokeEvent, props: OpenExplorerProps) => {
    if (isDialogOpen) return null
    isDialogOpen = true
    const {
      filters = [{ name: 'Todos los archivos', extensions: ['*'] }],
      title = 'Selecciona un archivo',
      properties
    } = props

    try {
      const win = BrowserWindow.fromWebContents(event.sender)
      const result = await dialog.showOpenDialog(win!, {
        properties,
        filters,
        title
      })

      if (result.canceled) return null
      return result.filePaths.toString()
    } catch (error) {
      console.error('Error opening file dialog:', error)
      return null
    } finally {
      isDialogOpen = false
    }
  })

  ipcMain.handle('get-storage-content', async (_event: IpcMainInvokeEvent) => {
    try {
      await ENCRYPTOR.refreshStorage()
      const content = await ENCRYPTOR.getStorage()
      return Array.from(content.entries())
    } catch (error) {
      return error
    }
  })

  ipcMain.on('open-devtools', (_event) => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (mainWindow) {
      mainWindow.webContents.openDevTools()
    }
  })

  ipcMain.handle(
    'visibility-action',
    async (_event: IpcMainInvokeEvent, props: VisibilityActions) => {
      const { action, itemId } = props
      let success = false
      try {
        const storage = await ENCRYPTOR.getStorage()
        const item = storage.get(itemId)
        if (!item) {
          throw new Error('Item not found')
        }
        if (action === 'show') {
          success = await ENCRYPTOR.revealStoredItem(itemId)
        } else {
          success = await ENCRYPTOR.hideStoredItem(itemId)
        }
        return { error: null, success }
      } catch (error) {
        console.error('Error in visibility action:', error)
        return {
          error: (error as Error).message,
          success
        }
      }
    }
  )

  ipcMain.on('open-path', (_event: IpcMainInvokeEvent, targetPath: string) => {
    if (!fs.existsSync(targetPath)) {
      console.error('Ruta no encontrada:', targetPath)
      return
    }

    if (fs.statSync(targetPath).isDirectory()) {
      shell.openPath(path.resolve(targetPath))
    } else {
      shell.showItemInFolder(path.resolve(targetPath))
    }
  })

  ipcMain.on('show-folder', (_event: IpcMainInvokeEvent, folderPath: string) => {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      console.error('Folder path is invalid:', folderPath)
      return
    }
    shell.showItemInFolder(path.resolve(folderPath))
  })

  ipcMain.on('reset-action', async (_event: IpcMainInvokeEvent, action: ResetActions) => {
    const userConfig = getUserConfig()
    switch (action) {
      case 'reset-storage': {
        try {
          await deleteStorageAndReload(userConfig)
          break
        } catch (error) {
          console.error('Error resetting storage:', error)
          break
        }
      }
      case 'reset-pwd': {
        try {
          const conf = CONF.get('userConfig')
          delete conf.hashedPassword
          CONF.set('userConfig', conf)
          await deleteStorageAndReload(userConfig)
          break
        } catch (error) {
          console.error('Error resetting config:', error)
          break
        }
      }
      default: {
        console.warn('Acción no reconocida:', action)
        break
      }
    }
  })

  ipcMain.handle('exist-storage', async () => {
    try {
      const storageExists = fs.existsSync(EncryptorConfig.dbPath!)
      return storageExists
    } catch (error) {
      console.error('Error checking storage existence:', error)
      return false
    }
  })
}
