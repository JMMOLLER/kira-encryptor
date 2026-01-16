import { createContext, ReactNode, useState } from 'react'
import { Drawer } from 'antd'

const DrawerContext = createContext<DrawerContext | undefined>(undefined)

export const DrawerProvider = ({ children }: { children: ReactNode }) => {
  const [content, setContent] = useState<React.ReactNode>(null)
  const [title, setTitle] = useState('Información del elemento')
  const [open, setOpen] = useState(false)

  const showDrawer: DrawerContext['showDrawer'] = (payload) => {
    if (payload.title) {
      setTitle(payload.title || 'Información del elemento')
    }
    setContent(payload.content)
    setOpen(true)
  }

  const hideDrawer = () => {
    setOpen(false)
    setContent(null)
  }

  return (
    <DrawerContext.Provider value={{ showDrawer, hideDrawer }}>
      {children}
      <Drawer title={title} onClose={hideDrawer} open={open} closable destroyOnHidden>
        {content}
      </Drawer>
    </DrawerContext.Provider>
  )
}

export default DrawerContext
