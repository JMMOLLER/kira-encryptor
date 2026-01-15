import { encryptorWorkerPath as workerPath } from '@kira-encryptor/core/workers'
import type { ProgressCallback } from '@kira-encryptor/core/types'
import { parentPort, workerData as wd } from 'worker_threads'
import Encryptor from '@kira-encryptor/core'

type PayloadBase = Partial<FolderEncryptor> &
  Partial<FolderDecryptor> &
  Partial<FileEncryptor> &
  Partial<FileDecryptor>

if (!parentPort) throw new Error('IllegalState')

const workerData = wd as WorkerEncryptProps

async function main() {
  const { srcPath, itemId, extraProps, EncryptorConfig } = workerData
  const PASSWORD = Buffer.from(workerData.password)

  if (!workerPath) {
    throw new Error('Worker path is not defined. Please check your build configuration.')
  }

  console.log('Starting encryptor worker with data:', EncryptorConfig)
  const ENCRYPTOR = await Encryptor.init(PASSWORD, workerPath, EncryptorConfig)

  const sendProgress: ProgressCallback = (processedBytes, totalBytes) => {
    parentPort!.postMessage({
      type: 'progress',
      processedBytes,
      totalBytes,
      itemId
    })
  }

  const onEnd = (error?: Error | null) => {
    parentPort!.postMessage({
      error: error ? error.message : null,
      stack: error ? error.stack : undefined,
      actionFor: workerData.actionFor,
      action: workerData.action,
      type: 'end',
      extraProps,
      itemId
    })
  }

  const payload: PayloadBase = {
    onProgress: sendProgress,
    extraProps,
    onEnd
  }

  if (workerData.actionFor === 'file') {
    payload.filePath = srcPath
  } else if (workerData.actionFor === 'folder') {
    payload.folderPath = srcPath
  } else {
    throw new Error('Invalid actionFor type')
  }

  try {
    if (workerData.action === 'encrypt') {
      workerData.actionFor === 'file'
        ? await ENCRYPTOR.encryptFile(payload as FileEncryptor)
        : await ENCRYPTOR.encryptFolder(payload as FolderDecryptor)
    } else if (workerData.action === 'decrypt') {
      workerData.actionFor === 'file'
        ? await ENCRYPTOR.decryptFile(payload as FileDecryptor)
        : await ENCRYPTOR.decryptFolder(payload as FolderDecryptor)
    } else {
      throw new Error('Acción no válida')
    }
  } catch (err) {
    parentPort!.postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      srcPath,
      itemId
    })
  }
}

main().catch((err) => {
  parentPort!.postMessage({
    type: 'error',
    message: err instanceof Error ? err.message : String(err),
    srcPath: workerData.srcPath,
    itemId: workerData.itemId
  })
})
