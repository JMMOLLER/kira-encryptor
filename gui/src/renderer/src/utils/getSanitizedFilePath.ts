import { FILE_EXTENSION } from '@kira-encryptor/core/constants/base'

export default function getSanitizedFilePath(item: StorageItem) {
  const basePath = item.path.substring(
    0,
    Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\'))
  )
  const currentName = item._id + (item.type === 'file' ? FILE_EXTENSION : '')

  const currentPath = `${basePath}\\${currentName}`
  const hiddenPath = `${basePath}\\.${currentName}`

  return {
    /**
     * Path of the item (visible).
     */
    currentPath,
    /**
     * Path of the hidden item (prefixed with a dot).
     */
    hiddenPath,
    /**
     * Current name of the item (ID with file extension if file).
     */
    currentName
  }
}
