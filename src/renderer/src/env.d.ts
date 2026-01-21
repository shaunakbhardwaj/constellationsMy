/// <reference types="vite/client" />

interface Window {
    electron: any
    api: {
        generateMindmap: (params: any) => Promise<any>
        expandNode: (params: any) => Promise<any>
        memory: {
            list: () => Promise<any>
            get: (id: string) => Promise<any>
            create: (params: any) => Promise<any>
            update: (params: any) => Promise<any>
            delete: (id: string) => Promise<any>
        }
    }
}

interface ImportMetaEnv {
    readonly VITE_DEFAULT_MODEL: string
    readonly VITE_OPENROUTER_API_KEY: string
}

interface ImportMeta {
    readonly env: ImportMetaEnv
}
