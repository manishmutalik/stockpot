// Learn more https://docs.expo.dev/guides/customizing-metro
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// The app shares a few plain files with the server (../src/utils): the money formatter, and the API types (types only, erased at
// build time). Metro must be allowed to read that folder. Keep what the app imports from it free of other imports.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../src/utils')];

module.exports = config;
