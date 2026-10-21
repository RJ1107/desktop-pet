// Where the installed app keeps its data, on each system, for the test tools that work on a copy of it.
// (The app itself asks Electron: app.getPath('userData').)
const path = require('path'), os = require('os');
module.exports = () => process.platform === 'win32' ? path.join(process.env.APPDATA, 'desktop-pet')
  : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support', 'desktop-pet')
  : path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'desktop-pet');
