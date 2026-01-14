import { Button, FloatButton, Form, Input, InputProps, Modal, Space } from 'antd'
import { usePendingOperation } from '@renderer/hooks/usePendingOperation'
import { FILE_EXTENSION } from '@akira-encryptor/core/constants/base'
import { useNewOperation } from '@renderer/hooks/useNewOperation'
import { useMenuItem } from '@renderer/hooks/useMenuItem'
import { PlusOutlined } from '@ant-design/icons'
import useApp from 'antd/es/app/useApp'
import { useState } from 'react'
import uid from 'tiny-uid'

function NewEncrypt() {
  const [status, setStatus] = useState<{ type: InputProps['status']; message: string }>({
    type: '',
    message: ''
  })
  const { newEncrypt, hasBackupInProgress } = useNewOperation()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const { findByPath } = usePendingOperation()
  const [pathVal, setPathVal] = useState('')
  const { menuItem } = useMenuItem()
  const message = useApp().message

  const showModal = () => {
    if (hasBackupInProgress) {
      message.error({
        key: 'backup-in-progress',
        content: 'Ya hay una copia de seguridad en progreso. Por favor, espere a que finalice.',
        duration: 3
      })
      return
    }
    setIsModalOpen(true)
    handleReset()
  }

  const handleOk = () => {
    if (menuItem === 'settings') {
      message.error('No se puede encriptar desde la pantalla de configuración.')
      return
    }

    const id = uid()

    newEncrypt({
      actionFor: menuItem === 'files' ? 'file' : 'folder',
      srcPath: pathVal,
      id
    })
    setIsModalOpen(false)
  }

  const handleCancel = () => {
    setIsModalOpen(false)
  }

  const resetStatus = () => {
    setStatus({
      type: '',
      message: ''
    })
  }

  const handleReset = () => {
    setPathVal('')
    resetStatus()
  }

  const handleClick = async () => {
    // Reset status
    handleReset()

    // Open file explorer
    const selectedPath = await window.api.openExplorer({
      title: `Seleccionar ${menuItem === 'files' ? 'archivo' : 'carpeta'}`,
      properties: menuItem === 'files' ? ['openFile'] : ['openDirectory']
    })
    if (!selectedPath) {
      setStatus({
        type: 'error',
        message: `Por favor seleccione ${menuItem === 'files' ? 'un archivo.' : 'una carpeta.'}`
      })
    } else if (findByPath(selectedPath)) {
      setStatus({
        type: 'error',
        message: `Ya existe una operación pendiente para el ${menuItem === 'files' ? 'archivo' : 'directorio'} seleccionado.`
      })
    } else if (selectedPath.endsWith(FILE_EXTENSION)) {
      setStatus({
        type: 'error',
        message: `El archivo seleccionado ya esta encriptado. Por favor, seleccione otro.`
      })
    } else {
      setPathVal(selectedPath)
      resetStatus()
    }
  }

  return (
    <>
      <FloatButton
        {...(hasBackupInProgress ? {} : { tooltip: 'Añadir archivo' })}
        icon={<PlusOutlined />}
        onClick={showModal}
        className={`${hasBackupInProgress ? 'opacity-50' : ''}`}
        type="primary"
      />
      <Modal
        title={`Encriptar ${menuItem === 'files' ? 'Nuevo Archivo' : 'Nueva Carpeta'}`}
        okButtonProps={{ disabled: status.type === 'error' || pathVal === '' }}
        onCancel={handleCancel}
        open={isModalOpen}
        onOk={handleOk}
        centered
      >
        <Form name="new-encrypt" className="[&_.ant-form-item-has-error]:mb-0! *:mb-4!">
          <Form.Item
            label={`Ingrese la ruta ${menuItem === 'files' ? 'del archivo' : 'de la carpeta'}::`}
            help={status.type === 'error' ? status.message : ''}
            validateStatus={status.type}
            wrapperCol={{ span: 24 }}
            labelCol={{ span: 24 }}
            className="inline-flex"
            name="path"
          >
            <Space.Compact className="w-full">
              <Input
                placeholder={`Seleccionar ${menuItem === 'files' ? 'archivo' : 'carpeta'}`}
                value={pathVal}
                readOnly
              />
              <Button onClick={handleClick} type="primary">
                Seleccionar
              </Button>
            </Space.Compact>
          </Form.Item>
        </Form>
      </Modal>
    </>
  )
}

export default NewEncrypt
