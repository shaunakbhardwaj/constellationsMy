import { ElectronAPI } from '@electron-toolkit/preload'
import type { BrainAPI } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: BrainAPI
  }
}
