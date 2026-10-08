/**
 * app.config.js
 *
 * Adds to app.json what belongs to one person's setup and so is not committed: the Firebase file that lets Android
 * receive push notifications (`google-services.json`, put in this folder) and the Expo project id the push service
 * needs (`EXPO_PUBLIC_EAS_PROJECT_ID`, in `.env`). With neither, the app builds exactly as app.json says, so CI and
 * anyone who does not use notifications are unaffected.
 */
const fs = require('fs');
const path = require('path');

/** app.json's config plus whichever of the two local settings are present. Pure, so it can be tested. */
function withLocalSettings(config, { hasGoogleServices, projectId }) {
  const id = typeof projectId === 'string' ? projectId.trim() : '';
  return {
    ...config,
    ...(hasGoogleServices && { android: { ...config.android, googleServicesFile: './google-services.json' } }),
    ...(id && { extra: { ...config.extra, eas: { ...config.extra?.eas, projectId: id } } }),
  };
}

module.exports = ({ config }) => withLocalSettings(config, {
  hasGoogleServices: fs.existsSync(path.join(__dirname, 'google-services.json')),
  projectId: process.env.EXPO_PUBLIC_EAS_PROJECT_ID,
});
module.exports.withLocalSettings = withLocalSettings;
