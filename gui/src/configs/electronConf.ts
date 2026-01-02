import ensureBackupFolder from '@utils/ensureBackupFolder'
import calculateThreads from '@utils/calculateThreads'
import { updatedDiff } from 'deep-object-diff'
import { Conf } from 'electron-conf/main'
import { app } from 'electron'
import { join } from 'path'

const dbPath = join(app.getPath('userData'), 'storage.bin')

const CONF = new Conf<Partial<ConfStoreType>>({
  defaults: {
    userConfig: {
      coreReady: false,
      autoBackup: true,
      backupPath: ensureBackupFolder(),
      compressionAlgorithm: '-m0=lzma2',
      hashedPassword: undefined,
      compressionLvl: '-mx=5',
      hideItemName: false,
      encryptorConfig: {
        maxThreads: calculateThreads(50),
        allowExtraProps: true,
        enableLogging: false,
        minDelayPerStep: 0,
        encoding: 'base64',
        silent: true,
        dbPath
      }
    }
  },

  schema: {
    type: 'object',
    properties: {
      userConfig: {
        type: 'object',
        nullable: true,
        properties: {
          hashedPassword: {
            type: 'string',
            nullable: true
          },
          coreReady: {
            type: 'boolean',
            default: false
          },
          autoBackup: {
            type: 'boolean',
            default: true
          },
          backupPath: {
            type: 'string',
            default: ensureBackupFolder()
          },
          hideItemName: {
            type: 'boolean',
            default: false
          },
          encryptorConfig: {
            type: 'object',
            nullable: false,
            properties: {
              maxThreads: {
                type: 'number',
                nullable: true,
                default: calculateThreads(50)
              },
              allowExtraProps: {
                type: 'boolean',
                nullable: true,
                default: true
              },
              enableLogging: {
                type: 'boolean',
                nullable: true,
                default: false
              },
              encoding: {
                type: 'string',
                nullable: true,
                default: 'base64'
              },
              minDelayPerStep: {
                type: 'number',
                default: 0,
                nullable: true
              },
              silent: {
                type: 'boolean',
                nullable: true,
                default: true
              },
              dbPath: {
                type: 'string',
                nullable: true,
                default: dbPath
              }
            }
          },
          compressionAlgorithm: {
            type: 'string',
            default: '-m0=lzma2'
          },
          compressionLvl: {
            type: 'string',
            default: '-mx=5'
          }
        },
        required: ['coreReady', 'autoBackup', 'backupPath', 'encryptorConfig']
      }
    }
  }
}) // --> Que dolor de cabeza es definir esta vaina. 🫠

// set initial values
CONF.set('userConfig.coreReady', false)
// debug configuration changes
CONF.onDidAnyChange((newValue, oldValue) => {
  const oldCfg = oldValue?.userConfig ?? {}
  const newCfg = newValue?.userConfig ?? {}

  const resultado = updatedDiff(oldCfg, newCfg)

  console.log('[electronConf] Changes detected: ', JSON.stringify(resultado, null, 2))
})
// register the renderer listener
CONF.registerRendererListener()

export default CONF as Conf<ConfStoreType>
