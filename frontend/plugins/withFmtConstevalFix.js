const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Xcode 26.4 / Apple Clang 21 made consteval stricter, which breaks the `fmt`
// pod (vendored via React Native / folly) at its FMT_STRING call sites
// (facebook/react-native#55601).
//
// fmt 11.0.2's base.h gates consteval on the *compiler identity*
// (__apple_build_version__), NOT the language standard — so compiling fmt at
// C++17 does NOT disable it, and -DFMT_USE_CONSTEVAL=0 fails because base.h
// redefines the macro itself. The only reliable fix is patching the vendored
// header to force FMT_USE_CONSTEVAL 0.
//
// ios/ is gitignored and regenerated on every build, so we inject this as a
// Podfile post_install hook during prebuild. The hook runs at pod-install time,
// after fmt is vendored into Pods/. It is idempotent (guarded by a marker in the
// Podfile, and a no-op re-run once base.h already reads 0) and merges into an
// existing post_install block rather than clobbering one (e.g. Expo's
// react_native_post_install).
const MARKER = '# @koan fmt-consteval-fix';

const FMT_HOOK = (installerVar) => `    ${MARKER}
    fmt_base_h = File.join(${installerVar}.sandbox.root.to_s, 'fmt', 'include', 'fmt', 'base.h')
    if File.exist?(fmt_base_h)
      original = File.read(fmt_base_h)
      patched = original.gsub('define FMT_USE_CONSTEVAL 1', 'define FMT_USE_CONSTEVAL 0')
      if patched != original
        File.write(fmt_base_h, patched)
        Pod::UI.puts '[koan] fmt base.h patched: FMT_USE_CONSTEVAL forced to 0'
      elsif original.include?('define FMT_USE_CONSTEVAL 0')
        Pod::UI.puts '[koan] fmt base.h already patched (FMT_USE_CONSTEVAL 0)'
      else
        Pod::UI.warn '[koan] fmt base.h found but no "define FMT_USE_CONSTEVAL 1" line to patch — fmt layout may have changed'
      end
    end`;

const withFmtConstevalFix = (config) => {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;
      const podfilePath = path.join(projectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf-8');

      // Idempotent: bail if we already injected the hook this prebuild.
      if (contents.includes(MARKER)) {
        return config;
      }

      const postInstallMatch = contents.match(/post_install do \|([^|]+)\|/);
      if (postInstallMatch) {
        // Insert just inside the existing post_install block, preserving the
        // rest of its contents (other hooks stay intact).
        const installerVar = postInstallMatch[1].trim();
        const anchor = postInstallMatch[0];
        contents = contents.replace(anchor, `${anchor}\n${FMT_HOOK(installerVar)}`);
      } else {
        // No post_install block yet — add one at the end of the file.
        contents = `${contents.replace(/\s*$/, '')}\n\npost_install do |installer|\n${FMT_HOOK('installer')}\nend\n`;
      }

      fs.writeFileSync(podfilePath, contents, 'utf-8');
      return config;
    },
  ]);
};

module.exports = withFmtConstevalFix;
