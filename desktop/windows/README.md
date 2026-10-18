# ConceptCards for Windows — portable

Extract the whole folder, then double-click **ConceptCards.exe**. Keep the renderer
folder and the DLLs next to the executable. You can move this folder or put a
shortcut to the executable on your desktop. No installer or administrator rights
are needed.

Requires 64-bit Windows 10/11, .NET Framework 4.8 or newer, and Microsoft's
Evergreen WebView2 Runtime, normally already present on current Windows systems.
If WebView2 is missing, get it from
https://developer.microsoft.com/microsoft-edge/webview2 . The runtime is shared
with other Windows apps instead of bundling another browser.

The existing canvas runs in a GPU-accelerated Windows window. Markdown, equations,
Markmaps, code highlighting, fonts and backgrounds are included for offline use.
Images hosted on the web still require an internet connection. External links
open in your default browser. Card and Markmap views open in separate app windows.

**Open** uses the native Windows file picker. Recent canvases reopen directly from
their approved paths, including after restarting the app. You can also drag a
canvas JSON file onto ConceptCards.exe or pass it as a command-line argument.
**Save** / **Ctrl+S** uses the native Save dialog to export JSON. **Save card as PDF**
opens the print preview; choose **Save as PDF**. No canvas file is overwritten
automatically. Local recovery and preferences are kept in
`%LOCALAPPDATA%\ConceptCards`, independently of the portable folder. Browser data
from the web version is separate; open a saved JSON canvas to bring it here.

## Rebuilding from source

From the repository root, with Node.js and the `sharp` module available:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File desktop/windows/build.ps1 -Fetch -Zip
```

The first build downloads the pinned libraries and WebView2 SDK to
`.desktop-cache/`. Subsequent builds can omit `-Fetch` and work offline. Build
output goes to `dist/ConceptCards-Windows/` and optionally the adjacent ZIP.
Dependency licenses and SHA-256 manifests are included in the build. The C# host
compiles with the Windows .NET Framework compiler; no .NET SDK, Rust or Electron
installation is needed.

The executable is unsigned. Windows may show the standard unknown-publisher
prompt on machines where the downloaded ZIP has an internet security mark.

Automated integration checks use `tests/windows-desktop.cjs`. They launch an
isolated test profile and enable a local debugging port only with `--test-mode`.
Normal launches do not expose that port or enable browser developer tools.
