// The only bridge between the windows and the main process. Windows can call these names and nothing else.
const {contextBridge, ipcRenderer} = require('electron');

const calls = ['state', 'overlay:ignore', 'overlay:focus', 'overlay:hide', 'photos:keep', 'photos:kept', 'pet:needs', 'pet:event', 'chat', 'listen', 'speak',
  'photos:pick', 'traits:describe', 'traits:save', 'settings:save', 'personality:read', 'personality:pick', 'personality:reset',
  'memory:add', 'memory:delete', 'memory:clear', 'history:clear', 'panel:open', 'quit',
  'real:status', 'real:reference', 'real:clips', 'real:clip', 'real:sheet', 'real:load', 'real:use', 'real:stamp', 'bowl:make', 'bowl:save', 'bowl:reset', 'bowl:load', 'pets:switch', 'pets:add', 'pets:remove', 'pets:picture', 'debug:note'];
const events = ['state:changed', 'command', 'real:progress', 'bowls:changed'];

contextBridge.exposeInMainWorld('petHost', {
  call: (name, ...args) => calls.includes(name) ? ipcRenderer.invoke(name, ...args) : Promise.reject(new Error(`Unknown call: ${name}`)),
  on(name, listener) {
    if (!events.includes(name)) throw new Error(`Unknown event: ${name}`);
    ipcRenderer.on(name, (_event, payload) => listener(payload));
  }
});
