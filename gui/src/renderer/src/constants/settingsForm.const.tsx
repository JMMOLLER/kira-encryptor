import { SliderSingleProps } from 'antd'

type EncodingOptions = { value: KiraBufferEncoding; label: string }[]

const algorithmOptions = [
  { value: '-m0=copy', label: 'Ninguno' },
  { value: '-m0=lzma', label: 'LZMA' },
  { value: '-m0=lzma2', label: 'LZMA2' },
  { value: '-m0=ppmd', label: 'PPMD' },
  { value: '-m0=bzip2', label: 'BZIP2' },
  { value: '-m0=deflate', label: 'Deflate' },
  { value: '-m0=bcj', label: 'BCJ' },
  { value: '-m0=bcj2', label: 'BCJ2' }
]
const compressionLevels = [
  { value: '-mx=0', label: 'Ninguno' },
  { value: '-mx=1', label: 'Bajo' },
  { value: '-mx=3', label: 'Medio' },
  { value: '-mx=5', label: 'Alto' },
  { value: '-mx=7', label: 'Muy alto' },
  { value: '-mx=9', label: 'Máximo' }
]
const marks: SliderSingleProps['marks'] = {
  10: {
    style: {
      color: '#1890ff'
    },
    label: <strong>10%</strong>
  },
  50: {
    style: {
      color: '#87d068'
    },
    label: <strong>50%</strong>
  },
  100: {
    style: {
      color: '#e87266'
    },
    label: <strong>100%</strong>
  }
}
const encodingOptions: EncodingOptions = [
  { value: 'base64', label: 'Base64' },
  { value: 'hex', label: 'Hexadecimal' },
  { value: 'base64url', label: 'Base64url' },
  { value: 'latin1', label: 'Latin1 - No recomendado' }
]

export { algorithmOptions, compressionLevels, encodingOptions, marks }
