import encryptorWorker from '@workers/encryptor.worker?nodeWorker'

type RunEncryptorWorkerParams = EncryptFileProps &
  WorkerEncryptProps & {
    onProgress: (data: string) => void
    onError: (data: unknown) => void
    onEnd: (data: EncryptEndEvent) => void
  }

export default function runEncryptorWorker(props: RunEncryptorWorkerParams) {
  const { onProgress, onEnd, onError, ...rest } = props
  const worker = encryptorWorker({
    workerData: { ...rest }
  })

  worker
    .on('message', (message) => {
      switch (message.type) {
        case 'progress':
          onProgress(message)
          break
        case 'end':
          onEnd(message)
          worker.terminate()
          break
        case 'error':
          onError(message)
          worker.terminate()
          break
      }
    })
    .on('error', (err: Error) => {
      console.error('Encryptor worker error:', err)
      onError({
        message: err.message,
        srcPath: rest.srcPath,
        itemId: rest.itemId
      } as ProgressCallbackErrorProps)
    })
    .once('exit', () => {
      console.log('Encryptor worker exited')
    })
}
