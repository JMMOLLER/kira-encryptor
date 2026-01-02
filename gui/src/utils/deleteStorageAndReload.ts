import { app, dialog } from 'electron'
import { rm, rmdir } from 'fs/promises'

export default async function deleteStorageAndReload(userConfig: UserConfig) {
  const { encryptorConfig } = userConfig

  try {
    await rm(encryptorConfig.dbPath!, { force: true, maxRetries: 3 })
    await rm(userConfig.backupPath, { recursive: true, maxRetries: 3 })
  } catch (error) {
    dialog.showErrorBox('Error al eliminar archivos', String(error))
  } finally {
    app.relaunch({ args: process.argv.slice(1) })
    app.quit()
  }
}
