<p>
  <a href="https://docs.expo.dev/modules/">
    <img
      src="https://raw.githubusercontent.com/expo/expo-modules-macros/main/.github/resources/expo-modules-macros.svg"
      alt="expo-modules-macros"
      height="64" />
  </a>
</p>

# @expo/modules-macros-win32-x64

The Windows x64 build of the `expo-modules-macros` compiler plugin and scanner (`ExpoModulesMacros.exe`).

Don't install this package directly. `expo-modules-macros` lists it as an optional dependency, and package managers install it only on Windows x64, because of its `os` and `cpu` fields. `getScannerBinaryPath()` in `expo-modules-macros` returns the path of the executable in it.

The Swift runtime is linked in statically, so the executable runs without a Swift toolchain. It needs only Windows system libraries and the Microsoft Visual C++ runtime.
