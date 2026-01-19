"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const api = {
  generateMindmap: (params) => electron.ipcRenderer.invoke("generate-mindmap", params),
  expandNode: (params) => electron.ipcRenderer.invoke("expand-node", params)
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
