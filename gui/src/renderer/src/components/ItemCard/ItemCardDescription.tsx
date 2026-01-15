import { useUserConfig } from '@renderer/hooks/useUserConfig'
import { formatBytes } from '@kira-encryptor/core/utils'
import { Tooltip } from 'antd'

const ItemCardDescription = ({ item }: { item: StorageItem }) => {
  const { userConfig } = useUserConfig()
  const itemCopy = structuredClone(item)

  if (userConfig.hideItemName) {
    itemCopy.originalName = '*****'
  }

  return (
    <ul>
      <li className="truncate">
        <span className="font-semibold">Nombre:</span>{' '}
        {itemCopy.originalName && itemCopy.originalName.length > 28 ? (
          <Tooltip title={itemCopy.originalName}>
            <span>{itemCopy.originalName}</span>
          </Tooltip>
        ) : (
          <span>{itemCopy.originalName}</span>
        )}
      </li>
      <li>
        <span className="font-semibold">Tamaño:</span> {formatBytes(itemCopy.size || 0)}
      </li>
    </ul>
  )
}

export default ItemCardDescription
