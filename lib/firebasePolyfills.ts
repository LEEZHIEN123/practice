/**
 * Crypto polyfill for Firebase Auth on React Native. Safe if the package is not installed yet.
 */
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("react-native-get-random-values");
} catch {
  /* optional — install with: npx expo install react-native-get-random-values */
}
