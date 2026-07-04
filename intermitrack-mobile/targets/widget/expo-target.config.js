/** @type {import('@bacons/apple-targets/app.plugin').ConfigFunction} */
module.exports = (config) => ({
  type: "widget",
  name: "Intermitrack",
  colors: {
    $accent: "#1F4E5F",
    $widgetBackground: "#FFFFFF",
  },
  entitlements: {
    "com.apple.security.application-groups": ["group.fr.intermitrack.app"],
  },
});
