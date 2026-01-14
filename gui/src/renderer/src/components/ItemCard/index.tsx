import getSanitizedFilePath from '@renderer/utils/getSanitizedFilePath'
import useItemCardActions from '@renderer/hooks/useItemCardActions'
import ItemCardDescription from './ItemCardDescription'
import { ExportOutlined } from '@ant-design/icons'
import ItemCardAvatar from './ItemCardAvatar'
import { Card } from 'antd'

interface ItemCardProps {
  item: StorageItem
}

const ItemCard = ({ item }: ItemCardProps) => {
  const actions = useItemCardActions({ item })

  const { currentPath, hiddenPath } = getSanitizedFilePath(item)

  const itemLink = (
    <a
      href="#"
      onClick={(e) => {
        e.preventDefault()
        if (item.type === 'folder') window.api.showFolder(item.isHidden ? hiddenPath : currentPath)
        else window.api.openPath(item.isHidden ? hiddenPath : currentPath)
      }}
    >
      <ExportOutlined />
    </a>
  )

  return (
    <Card className="w-87.5 h-min" actions={actions}>
      <Card.Meta
        title={
          item.type === 'file' ? (
            <span className="inline-flex gap-2">
              <h3 className="font-medium!">Archivo Encriptado</h3>
              {itemLink}
            </span>
          ) : (
            <span className="inline-flex gap-2">
              <h3 className="font-medium!">Carpeta Encriptada</h3>
              {itemLink}
            </span>
          )
        }
        description={<ItemCardDescription item={item} />}
        avatar={<ItemCardAvatar item={item} />}
      />
    </Card>
  )
}

export default ItemCard
