import type * as KiraTypes from '@kira-encryptor/core/types'
import type { ItemType } from 'antd/es/menu/interface'
import { useAppProps } from 'antd/es/app/context'
import type { OpenDialogOptions } from 'electron'
import { SevenZipOptions } from 'node-7z'

declare global {
  type StorageItem = KiraTypes.StorageItem
  type FolderEncryptor = KiraTypes.FolderEncryptor
  type FolderDecryptor = KiraTypes.FolderDecryptor
  type FileEncryptor = KiraTypes.FileEncryptor
  type FileDecryptor = KiraTypes.FileDecryptor
  type KiraBufferEncoding = KiraTypes.BufferEncoding
  type OpenExplorerProps = {
    title?: string
    properties: OpenDialogOptions['properties']
    filters?: OpenDialogOptions['filters']
  }
  type MenuInfo = {
    key: string
    keyPath: string
  }

  type EncryptFileProps = {
    extraProps?: Record<string, JsonValue>
    action: 'encrypt' | 'decrypt'
    actionFor: 'file' | 'folder'
    srcPath: string
    itemId: string
  }
  type BackupActionProps = Omit<EncryptFileProps, 'action' | 'actionFor'> & {
    action: 'create' | 'delete'
  }

  // Define this function in the preload.ts file
  interface ElectronIpcAPI {
    changeVisibility: (props: VisibilityActions) => Promise<IpcResponseStatus>
    openExplorer: (props: OpenExplorerProps) => Promise<string | null>
    backupAction: (props: BackupActionProps) => Promise<IpcResponseStatus & { dest: string }>
    getEncryptedContent: () => Promise<[string, StorageItem][] | Error>
    deleteStorageItem: (itemId: string) => Promise<StorageItem | null>
    initEncryptor: (password: string) => Promise<IpcResponseStatus>
    encryptorAction: (props: EncryptFileProps) => Promise<void>
    calculateUsageFromThreads: (threads: number) => number
    resetAction: (action: ResetActions) => Promise<void>
    calculateThreads: (usage: number) => number
    showFolder: (folderPath: string) => void
    openPath: (targetPath: string) => void
    existStorage: () => Promise<boolean>
    openDevTools: () => void
  }

  interface DrawerContext {
    showDrawer: (_: { title?: string; content: React.ReactNode }) => void
    hideDrawer: () => void
  }

  type MenuItemOptions = 'files' | 'folders' | 'settings'

  interface MenuItemContextType {
    menuItem: MenuItemOptions
    setMenuItem: (val?: MenuItemOptions) => void
  }

  type CustomItemType = ItemType & {
    danger?: boolean
    icon?: React.ReactNode
    title?: string
    key?: MenuItemOptions
  }

  interface EncryptedItemContextType {
    encryptedItems: Map<string, StorageItem> | undefined
    setItems: React.Dispatch<React.SetStateAction<EncryptedItemContextType['encryptedItems']>>
  }

  interface PendingItem {
    type: 'file' | 'folder'
    status: 'loading' | 'error'
    percent: number
    message?: string
    srcPath?: string
  }
  type PendingStorage = Map<string, PendingItem>
  interface PendingEncryptContextType {
    pendingItems: PendingStorage
    removePendingItem: (id: string) => void
    addPendingItem: (id: string, item: PendingItem) => void
    findByPath: (srcPath: string) => PendingItem | undefined
  }

  interface ProgressCallbackProps {
    processedFiles: number
    totalFiles: number
    processedBytes: number
    totalBytes: number
    itemId: string
  }
  interface ProgressCallbackErrorProps {
    srcPath: string
    message: string
    itemId: string
  }

  interface ConfStoreType {
    userConfig: UserConfig
  }
  interface UserConfig {
    compressionAlgorithm: CompressionAlgorithm
    compressionLvl: CompressionLvl
    showDecryptedItem: boolean
    hashedPassword?: string
    hideItemName: boolean
    autoBackup: boolean
    backupPath: string
    coreReady: boolean
    encryptorConfig: KiraTypes.EncryptorOptions
  }
  interface UserConfigContext {
    userConfig: UserConfig & { isLoggedIn: boolean }
    updateUserConfig: (newConfig: Partial<UserConfig>) => void
  }

  type PrevModalType = ReturnType<useAppProps['modal']['info']>

  type EncryptEndEvent = {
    extraProps?: Record<string, JsonValue>
    error: string | null
    actionFor: CliType
    action: CliAction
    srcPath?: string
    itemId: string
  }

  type VisibilityActions = {
    action: 'show' | 'hide'
    itemId: string
  }
  type IpcResponseStatus = {
    error: string | null
    success: boolean
  }

  type CompressionLvl = '-mx=0' | '-mx=1' | '-mx=3' | '-mx=5' | '-mx=7' | '-mx=9'
  type CompressionAlgorithm =
    | '-m0=copy'
    | '-m0=lzma'
    | '-m0=lzma2'
    | '-m0=ppmd'
    | '-m0=bzip2'
    | '-m0=deflate'
    | '-m0=bcj'
    | '-m0=bcj2'

  interface BackupWorkerProps {
    node7zOptions: Omit<SevenZipOptions, '$bin' | 'password'>
    /**
     * @note Node.js worker threads do not support `Buffer` directly,
     * so Node.js casts `Buffer` to `Uint8Array`.
     */
    password: Uint8Array
    /**
     * Path to the 7z binary.
     * @note This is used by the `node-7z` library.
     */
    $bin: string
    dest: string
    src: string
  }

  type WorkerEncryptProps = EncryptFileProps & {
    /**
     * @note Node.js worker threads do not support `Buffer` directly,
     * so Node.js casts `Buffer` to `Uint8Array`.
     */
    password: Uint8Array
    EncryptorConfig?: KiraTypes.EncryptorOptions
  }

  type ResetActions = 'reset-storage' | 'reset-pwd' | 'reset-config'

  interface OperationProps {
    actionFor: EncryptFileProps['actionFor']
    extraProps?: Record<string, KiraTypes.JsonValue>
    srcPath: string
    id: string
  }

  interface OperationContextValue {
    hasBackupInProgress: boolean
    newEncrypt: (props: OperationProps) => Promise<void>
    newDecrypt: (props: OperationProps) => void
  }
}
