// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The app shares plain files with the server and the web (../src/utils): the money formatter, the API types (types only, erased at
// build time), and the recipe reader's check-screen logic (utils/recipeDraft and what it uses, which reads a constant from
// ../src/types). Metro must be allowed to read those folders. Keep what the app imports from them free of web-only imports.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../src/utils'), path.resolve(__dirname, '../src/types')];

module.exports = config;
