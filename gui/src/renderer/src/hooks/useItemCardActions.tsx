import { delay, generateUID, formatBytes } from '@kira-encryptor/core/utils'
import { useEncryptedItems } from '@renderer/hooks/useEncryptedItems'
import { FILE_EXTENSION } from '@kira-encryptor/core/constants/base'
import { useNewOperation } from '@renderer/hooks/useNewOperation'
import getSanitizedFilePath from '../utils/getSanitizedFilePath'
import { Button, Popconfirm, Tag, Tooltip } from 'antd'
import * as Icons from '@ant-design/icons'
import useApp from 'antd/es/app/useApp'
import { useDrawer } from './useDrawer'

interface Props {
  item: StorageItem
}

const useItemCardActions = ({ item }: Props) => {
  const { showDrawer, hideDrawer } = useDrawer()
  const { newDecrypt } = useNewOperation()
  const { setItems } = useEncryptedItems()
  const { message, modal } = useApp()

  const toggleVisibility = async () => {
    const id = generateUID()
    message.open({
      type: 'loading',
      content: 'Alternando visibilidad del contenido...',
      key: `toggle-visibility-${id}`
    })

    const [res] = await Promise.all([
      window.api.changeVisibility({
        action: item.isHidden ? 'show' : 'hide',
        itemId: item._id
      }),
      delay(500)
    ])

    message.destroy(`toggle-visibility-${id}`)

    if (res.error) {
      message.error('Error al alternar la visibilidad del contenido.')
    } else {
      message.success('Contenido alternado con éxito.')
      setItems(undefined)
    }
  }

  const decryptItem = () => {
    if (item.isHidden) {
      message.info('Cambia la visibilidad del elemento antes de desencriptarlo.')
      return
    }

    const lastSlash = Math.max(item.path.lastIndexOf('/'), item.path.lastIndexOf('\\')) + 1
    if (lastSlash <= 0) {
      message.error('Ruta de archivo no válida.')
      return
    }

    const basePath = item.path.substring(0, lastSlash)
    const fileName = item._id + (item.type === 'file' ? FILE_EXTENSION : '')
    const srcPath = `${basePath}${fileName}`

    newDecrypt({
      actionFor: item.type,
      id: item._id,
      srcPath
    })
  }

  const deleteElement = async () => {
    return await Promise.all([window.api.deleteStorageItem(item._id), delay(500)]).then(([res]) => {
      if (res === null) {
        message.error('Error al eliminar el elemento.')
      } else {
        message.success('Elemento eliminado con éxito.')
        setItems(undefined)
        hideDrawer()
      }
    })
  }

  const openInfoDrawer = () => {
    showDrawer({
      title: 'Información del archivo',
      content: (
        <ul className="space-y-3! text-sm text-gray-700 select-text cursor-default [&>li>p:nth-child(2)]:text-[#888]">
          <li>
            <h3 className="text-base font-semibold text-gray-900">ID</h3>
            <p className="break-all">{item._id}</p>
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Nombre original</h3>
            <p>{item.originalName || 'Desconocido'}</p>
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Nombre encriptado</h3>
            <p className="break-all">{item.encryptedName}</p>
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Ruta original</h3>
            <a className="break-all opacity-50 cursor-not-allowed!" href="#">
              {item.path}
            </a>
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Ruta actual</h3>
            {(() => {
              const { currentPath, hiddenPath } = getSanitizedFilePath(item)

              return (
                <a
                  className="break-all hover:underline"
                  onClick={() => {
                    window.api.openPath(item.isHidden ? hiddenPath : currentPath)
                  }}
                  href="#"
                >
                  {currentPath}
                </a>
              )
            })()}
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Oculto</h3>
            <Tag color={item.isHidden ? 'blue' : 'gold'}>{item.isHidden ? 'Sí' : 'No'}</Tag>
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Tamaño</h3>
            <p>{item.size ? `${formatBytes(item.size)}` : 'No disponible'}</p>
          </li>

          <li>
            <h3 className="text-base font-semibold text-gray-900">Fecha de encriptación</h3>
            <p>
              {item.encryptedAt ? new Date(item.encryptedAt).toLocaleString() : 'No disponible'}
            </p>
          </li>

          {item.extraProps?.backupPath && (
            <li>
              <h3 className="text-base font-semibold text-gray-900">
                Ubicacion de copia de seguridad
              </h3>
              <a
                className="break-all hover:underline!"
                onClick={() => {
                  window.api.openPath(item.extraProps!.backupPath as string)
                }}
                href="#"
              >
                {item.extraProps.backupPath as string}
              </a>
            </li>
          )}

          <Button
            color="danger"
            variant="solid"
            className="w-full"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              modal.confirm({
                title: 'Eliminar elemento',
                content: (
                  <>
                    <p>
                      ¿Estás seguro de que quieres eliminar este elemento? Esta acción no eliminará
                      el archivo físico, solo su registro en la aplicación.
                    </p>
                    <small className="block mt-3! text-gray-500">
                      Nota: Esta acción está pensada para eliminar registros obsoletos o
                      incorrectos.
                    </small>
                  </>
                ),
                okButtonProps: { danger: true },
                onOk: deleteElement,
                okText: 'Eliminar',
                centered: true
              })
            }}
          >
            Eliminar elemento
          </Button>
        </ul>
      )
    })
  }

  return [
    <Tooltip
      title={item.isHidden ? 'Mostrar elemento' : 'Ocultar elemento'}
      destroyOnHidden
      mouseEnterDelay={1}
      key="visibility"
    >
      {item.isHidden ? (
        <Icons.EyeInvisibleOutlined onClick={toggleVisibility} />
      ) : (
        <Icons.EyeOutlined onClick={toggleVisibility} />
      )}
    </Tooltip>,
    <Tooltip mouseEnterDelay={1} destroyOnHidden title="Desencriptar" key="decrypt">
      <Popconfirm title="¿Estás seguro de que quieres continuar?" onConfirm={decryptItem}>
        <Icons.KeyOutlined />
      </Popconfirm>
    </Tooltip>,
    <Tooltip mouseEnterDelay={1} destroyOnHidden title="Información" key="info">
      <Icons.InfoCircleOutlined onClick={openInfoDrawer} />
    </Tooltip>
  ]
}

export default useItemCardActions
