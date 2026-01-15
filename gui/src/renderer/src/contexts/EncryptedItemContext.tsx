import { createContext, useState, ReactNode, useEffect, useCallback } from 'react'
import { useUserConfig } from '@renderer/hooks/useUserConfig'
import { delay } from '@kira-encryptor/core/utils'
import useApp from 'antd/es/app/useApp'

// Initialize the type for the context
const EncryptedItemContext = createContext<EncryptedItemContextType | undefined>(undefined)

// Provider component for the context
export function EncryptedItemProvider({ children }: { children: ReactNode }) {
  const [encryptedItems, setItems] = useState<EncryptedItemContextType['encryptedItems']>(undefined)
  const { userConfig } = useUserConfig()
  const { message } = useApp()

  const fetchEncryptedItems = useCallback(async () => {
    try {
      const [res] = await Promise.all([window.api.getEncryptedContent(), delay(250)])
      if (res instanceof Error) {
        throw new Error(res.message)
      }
      const parsed = new Map(res)
      console.log('Encrypted items loaded:', Array.from(parsed.values()))
      setItems(parsed)
    } catch (error) {
      console.error('Error loading encrypted items:', error)
      message.error('Ocurrió un error al cargar los elementos cifrados')
    }
  }, [message])

  useEffect(() => {
    if (!userConfig.isLoggedIn) return
    if (encryptedItems === undefined && userConfig.coreReady) {
      fetchEncryptedItems()
    }
  }, [encryptedItems, fetchEncryptedItems, userConfig])

  return (
    <EncryptedItemContext.Provider value={{ encryptedItems, setItems }}>
      {children}
    </EncryptedItemContext.Provider>
  )
}

export default EncryptedItemContext
