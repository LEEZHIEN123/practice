const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

/** Metro often fails to resolve package subpaths like `pkg/jsx-runtime` from inside `react-native`; Node resolves them fine. */
const CSS_INTEROP_JSX_RUNTIME = require.resolve(
  "react-native-css-interop/jsx-runtime",
);
const CSS_INTEROP_JSX_DEV_RUNTIME = require.resolve(
  "react-native-css-interop/jsx-dev-runtime",
);

function withCssInteropJsxRuntimeResolution(config) {
  const upstream = config.resolver?.resolveRequest;
  return {
    ...config,
    resolver: {
      ...config.resolver,
      resolveRequest(context, moduleName, platform) {
        if (moduleName === "react-native-css-interop/jsx-runtime") {
          return { type: "sourceFile", filePath: CSS_INTEROP_JSX_RUNTIME };
        }
        if (moduleName === "react-native-css-interop/jsx-dev-runtime") {
          return { type: "sourceFile", filePath: CSS_INTEROP_JSX_DEV_RUNTIME };
        }
        if (upstream) {
          return upstream(context, moduleName, platform);
        }
        return context.resolveRequest(context, moduleName, platform);
      },
    },
  };
}

const config = getDefaultConfig(__dirname);

// Expo SDK 53+ / RN 0.79+: Firebase Auth needs the RN bundle + .cjs resolution (not browser ESM).
// Without this, auth often fails with auth/network-request-failed on Android/iOS.
// https://docs.expo.dev/guides/using-firebase/#configure-metro
config.resolver.sourceExts.push("cjs");
config.resolver.unstable_enablePackageExports = false;

module.exports = withCssInteropJsxRuntimeResolution(
  withNativeWind(config, {
    input: path.join(__dirname, "app/global.css"),
  }),
);