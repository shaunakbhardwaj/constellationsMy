"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  generateMindmap: (params) => electron.ipcRenderer.invoke("generate-mindmap", params),
  expandNode: (params) => electron.ipcRenderer.invoke("expand-node", params),
  memory: {
    list: () => electron.ipcRenderer.invoke("memory:list"),
    get: (id) => electron.ipcRenderer.invoke("memory:get", { id }),
    create: (params) => electron.ipcRenderer.invoke("memory:create", params),
    update: (params) => electron.ipcRenderer.invoke("memory:update", params),
    delete: (id) => electron.ipcRenderer.invoke("memory:delete", { id })
  }
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electron", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("api", api);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electron = preload.electronAPI;
  window.api = api;
}
