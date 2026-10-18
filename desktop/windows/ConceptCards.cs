using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

internal static class Program
{
    internal const string Origin = "https://conceptcards.local";
    internal static readonly string Root = AppDomain.CurrentDomain.BaseDirectory;
    internal static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = 128 * 1024 * 1024 };
    internal static string Profile, StartupCanvas;
    internal static bool TestMode;
    internal static bool TestNextDownload;
    internal static int DebugPort;
    internal static FileRegistry Files;
    internal static CoreWebView2Environment Environment;
    internal static readonly List<CanvasWindow> Children = new List<CanvasWindow>();

    [STAThread]
    private static void Main(string[] args)
    {
        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Profile = Path.Combine(System.Environment.GetFolderPath(System.Environment.SpecialFolder.LocalApplicationData), "ConceptCards");
        foreach (string arg in args) if (arg == "--test-mode") TestMode = true;
        foreach (string arg in args)
        {
            if (TestMode && arg.StartsWith("--profile=")) Profile = Path.GetFullPath(arg.Substring(10));
            else if (TestMode && arg.StartsWith("--debug-port=")) int.TryParse(arg.Substring(13), out DebugPort);
            else if (File.Exists(arg) && String.Equals(Path.GetExtension(arg), ".json", StringComparison.OrdinalIgnoreCase)) StartupCanvas = Path.GetFullPath(arg);
        }
        try
        {
            if (!File.Exists(Path.Combine(Root, "renderer", "index.html"))) throw new FileNotFoundException("Keep ConceptCards.exe together with the renderer folder and the WebView2 DLLs.");
            CoreWebView2Environment.GetAvailableBrowserVersionString();
            Directory.CreateDirectory(Profile);
            Files = new FileRegistry(Path.Combine(Profile, "approved-files.json"));
            Application.Run(new CanvasWindow(true));
        }
        catch (WebView2RuntimeNotFoundException)
        {
            MessageBox.Show("ConceptCards needs Microsoft Edge WebView2 Runtime. It is included with current Windows 10 and 11. Install the Evergreen WebView2 Runtime from https://developer.microsoft.com/microsoft-edge/webview2 and reopen the app.", "WebView2 Runtime needed", MessageBoxButtons.OK, MessageBoxIcon.Information);
        }
        catch (Exception error) { MessageBox.Show(error.Message, "ConceptCards could not start", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    internal static bool IsLocal(string uri)
    {
        Uri parsed;
        return Uri.TryCreate(uri, UriKind.Absolute, out parsed) && parsed.Scheme == "https" && parsed.Host == "conceptcards.local" && parsed.IsDefaultPort;
    }
    internal static void OpenExternal(string uri)
    {
        Uri parsed;
        if (Uri.TryCreate(uri, UriKind.Absolute, out parsed) && (parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "mailto"))
            Process.Start(new ProcessStartInfo(uri) { UseShellExecute = true });
    }
    internal static void Log(string message)
    {
        if (TestMode) File.AppendAllText(Path.Combine(Profile, "desktop-test.log"), DateTime.UtcNow.ToString("o") + " " + message + System.Environment.NewLine);
    }
}

// The renderer can read only file IDs previously approved by the Windows picker
// or passed explicitly to the executable. Paths are never accepted over IPC.
internal sealed class FileRegistry
{
    private readonly string metadata;
    private readonly Dictionary<string, string> paths;
    internal FileRegistry(string file)
    {
        metadata = file;
        try { paths = Program.Json.Deserialize<Dictionary<string, string>>(File.ReadAllText(file)); }
        catch { paths = new Dictionary<string, string>(); }
        if (paths == null) paths = new Dictionary<string, string>();
    }
    internal object Remember(string file)
    {
        string full = Path.GetFullPath(file), id;
        using (SHA256 hash = SHA256.Create()) id = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(full.ToUpperInvariant()))).Replace("-", "").ToLowerInvariant();
        paths[id] = full;
        string temporary = metadata + ".tmp";
        File.WriteAllText(temporary, Program.Json.Serialize(paths), Encoding.UTF8);
        if (File.Exists(metadata)) File.Replace(temporary, metadata, null); else File.Move(temporary, metadata);
        return new { desktopId = id, name = Path.GetFileName(full), kind = "file" };
    }
    internal string Resolve(string id)
    {
        string path;
        if (id == null || !paths.TryGetValue(id, out path)) throw new UnauthorizedAccessException("Open this canvas with the Windows file picker first.");
        return path;
    }
    internal string Folder(string id)
    {
        string path;
        return id != null && paths.TryGetValue(id, out path) ? Path.GetDirectoryName(path) : null;
    }
}

internal sealed class CanvasWindow : Form
{
    internal readonly WebView2 View = new WebView2();
    private readonly bool main;
    private readonly Dictionary<string, string> resources;
    private readonly List<Stream> responseStreams = new List<Stream>();
    private FormBorderStyle previousBorder;
    private Rectangle previousBounds;
    private FormWindowState previousState;
    private string downloadFolder;
    private bool closing;

    internal CanvasWindow(bool isMain)
    {
        main = isMain;
        if (!main) Program.Children.Add(this);
        Text = "ConceptCards";
        Icon = Icon.ExtractAssociatedIcon(Path.Combine(Program.Root, "ConceptCards.exe"));
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(1280, 860);
        MinimumSize = new Size(500, 360);
        View.Dock = DockStyle.Fill;
        View.DefaultBackgroundColor = Color.FromArgb(245, 244, 240);
        Controls.Add(View);
        resources = Program.Json.Deserialize<Dictionary<string, string>>(File.ReadAllText(Path.Combine(Program.Root, "remote-resources.json")));
        if (main) Shown += async delegate { try { await Initialize(); View.CoreWebView2.Navigate(Program.Origin + "/index.html"); } catch (Exception error) { MessageBox.Show(this, error.Message, "Could not open ConceptCards", MessageBoxButtons.OK, MessageBoxIcon.Error); Close(); } };
        FormClosed += delegate { Program.Children.Remove(this); View.Dispose(); foreach (Stream stream in responseStreams) stream.Dispose(); };
    }

    protected override async void OnFormClosing(FormClosingEventArgs e)
    {
        if (main && !closing && View.CoreWebView2 != null)
        {
            e.Cancel = true;
            try { await Task.WhenAny(View.CoreWebView2.ExecuteScriptAsync("window.dispatchEvent(new Event('pagehide'))"), Task.Delay(250)); }
            catch { }
            closing = true;
            if (!IsDisposed) Close();
            return;
        }
        base.OnFormClosing(e);
    }

    internal async Task Initialize()
    {
        if (Program.Environment == null)
        {
            string arguments = "--autoplay-policy=no-user-gesture-required";
            if (Program.TestMode && Program.DebugPort > 0 && Program.DebugPort < 65536) arguments += " --remote-debugging-port=" + Program.DebugPort;
            Program.Environment = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Program.Profile, "WebView2"), new CoreWebView2EnvironmentOptions(arguments));
        }
        await View.EnsureCoreWebView2Async(Program.Environment);
        CoreWebView2 core = View.CoreWebView2;
        core.SetVirtualHostNameToFolderMapping("conceptcards.local", Path.Combine(Program.Root, "renderer"), CoreWebView2HostResourceAccessKind.DenyCors);
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.IsPinchZoomEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDevToolsEnabled = Program.TestMode;
        core.Settings.IsGeneralAutofillEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        // GPU compositing remains enabled; the app owns all canvas zoom gestures.
        await core.AddScriptToExecuteOnDocumentCreatedAsync(File.ReadAllText(Path.Combine(Program.Root, "desktop-bridge.js")));
        core.AddWebResourceRequestedFilter("https://fonts.googleapis.com/*", CoreWebView2WebResourceContext.All);
        core.AddWebResourceRequestedFilter("https://cdn.jsdelivr.net/*", CoreWebView2WebResourceContext.All);
        core.AddWebResourceRequestedFilter("https://cdnjs.cloudflare.com/*", CoreWebView2WebResourceContext.All);
        core.WebResourceRequested += LocalResource;
        core.NavigationStarting += delegate(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            Program.Log((main ? "Main" : "Child") + " navigation " + e.Uri);
            if (e.Uri == "about:blank" || Program.IsLocal(e.Uri)) return;
            e.Cancel = true;
            try { Program.OpenExternal(e.Uri); } catch (Exception error) { MessageBox.Show(this, error.Message, "Could not open link"); }
        };
        core.NewWindowRequested += NewWindow;
        core.WebMessageReceived += NativeRequest;
        core.DocumentTitleChanged += delegate { Program.Log((main ? "Main" : "Child") + " title " + core.DocumentTitle); if (!String.IsNullOrWhiteSpace(core.DocumentTitle)) Text = core.DocumentTitle; };
        core.WindowCloseRequested += delegate { Close(); };
        core.ContainsFullScreenElementChanged += delegate { SetFullScreen(core.ContainsFullScreenElement); };
        core.DownloadStarting += Download;
        core.PermissionRequested += delegate(object sender, CoreWebView2PermissionRequestedEventArgs e)
        {
            // Clipboard reads originate from the app's explicit paste interaction.
            if (Program.IsLocal(e.Uri) && e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead) e.State = CoreWebView2PermissionState.Allow;
        };
        core.ProcessFailed += delegate(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            if (e.ProcessFailedKind == CoreWebView2ProcessFailedKind.RenderProcessExited)
                MessageBox.Show(this, "The canvas renderer stopped. Close and reopen ConceptCards to restore your local canvas backup.", "Canvas renderer stopped", MessageBoxButtons.OK, MessageBoxIcon.Warning);
        };
    }

    private void LocalResource(object sender, CoreWebView2WebResourceRequestedEventArgs e)
    {
        string relative;
        if (!resources.TryGetValue(e.Request.Uri, out relative))
        {
            // An unknown font falls back immediately instead of waiting offline.
            e.Response = Program.Environment.CreateWebResourceResponse(new MemoryStream(), 404, "Not bundled", "Content-Type: text/plain");
            return;
        }
        string path = Path.GetFullPath(Path.Combine(Program.Root, "renderer", relative));
        if (!path.StartsWith(Path.GetFullPath(Path.Combine(Program.Root, "renderer")) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)) return;
        // Only a handful of CSS/JS resources are requested; retain their streams
        // until this WebView is disposed, as WebView2 reads responses asynchronously.
        MemoryStream stream = new MemoryStream(File.ReadAllBytes(path));
        responseStreams.Add(stream);
        string mime = Path.GetExtension(path) == ".css" ? "text/css" : "text/javascript";
        e.Response = Program.Environment.CreateWebResourceResponse(stream, 200, "OK", "Content-Type: " + mime + "\r\nCache-Control: public, max-age=31536000");
    }

    private async void NewWindow(object sender, CoreWebView2NewWindowRequestedEventArgs e)
    {
        Program.Log("Popup requested " + e.Uri);
        if (!(e.Uri == "about:blank" || String.IsNullOrEmpty(e.Uri) || Program.IsLocal(e.Uri)))
        {
            e.Handled = true;
            try { Program.OpenExternal(e.Uri); } catch (Exception error) { MessageBox.Show(this, error.Message, "Could not open link"); }
            return;
        }
        CoreWebView2Deferral deferral = e.GetDeferral();
        CanvasWindow child = new CanvasWindow(false);
        try
        {
            child.Show();
            await child.Initialize();
            Program.Log("Popup initialized");
            // The same environment preserves opener access for document.write().
            e.NewWindow = child.View.CoreWebView2;
            e.Handled = true;
            Program.Log("Popup assigned");
        }
        catch (Exception error) { Program.Log("Popup failed " + error); e.Handled = true; child.Close(); MessageBox.Show(this, error.Message, "Could not open new window"); }
        finally { deferral.Complete(); }
    }

    private async void NativeRequest(object sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        if (!main || !Program.IsLocal(e.Source)) return;
        string payload = e.WebMessageAsJson;
        await Task.Yield(); // Leave the WebView callback before native modal UI.
        int id = 0;
        try
        {
            Dictionary<string, object> request = Program.Json.Deserialize<Dictionary<string, object>>(payload);
            id = Convert.ToInt32(request["id"]);
            string method = Convert.ToString(request["method"]);
            Dictionary<string, object> args = request.ContainsKey("args") ? request["args"] as Dictionary<string, object> : null;
            object result;
            if (method == "openCanvas")
            {
                using (OpenFileDialog picker = new OpenFileDialog())
                {
                    picker.Title = "Open ConceptCards canvas";
                    picker.Filter = "ConceptCards canvas (*.json)|*.json";
                    picker.Multiselect = false;
                    string folder = Program.Files.Folder(Value(args, "startIn"));
                    if (folder != null && Directory.Exists(folder)) picker.InitialDirectory = folder;
                    if (picker.ShowDialog(this) != DialogResult.OK) { Reply(id, null, "Opening canceled.", "AbortError"); return; }
                    result = Program.Files.Remember(picker.FileName);
                }
            }
            else if (method == "readCanvas")
            {
                string file = Program.Files.Resolve(Value(args, "id"));
                string text = await Task.Run(() => File.ReadAllText(file, Encoding.UTF8));
                result = new { name = Path.GetFileName(file), text = text };
            }
            else if (method == "startupCanvas")
            {
                result = Program.StartupCanvas == null ? null : Program.Files.Remember(Program.StartupCanvas);
                Program.StartupCanvas = null;
            }
            else if (Program.TestMode && method == "testCaptureWindow")
            {
                CanvasWindow child = Program.Children[0];
                string folder = Path.Combine(Program.Profile, "captures");
                Directory.CreateDirectory(folder);
                bool pdf = Value(args, "format") == "pdf";
                string file = Path.Combine(folder, pdf ? "card.pdf" : "window.png");
                if (pdf)
                {
                    CoreWebView2PrintSettings settings = Program.Environment.CreatePrintSettings();
                    settings.ShouldPrintBackgrounds = true;
                    if (!await child.View.CoreWebView2.PrintToPdfAsync(file, settings)) throw new IOException("PDF printing failed.");
                }
                else using (FileStream stream = File.Create(file)) await child.View.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png, stream);
                result = new { path = file };
            }
            else if (Program.TestMode && method == "testSaveNextDownload") { Program.TestNextDownload = true; result = true; }
            else throw new InvalidOperationException("Unknown desktop request.");
            Reply(id, result, null, null);
        }
        catch (Exception error) { Reply(id, null, error.Message, error is UnauthorizedAccessException ? "NotAllowedError" : "Error"); }
    }
    private static string Value(Dictionary<string, object> args, string key) { return args != null && args.ContainsKey(key) ? Convert.ToString(args[key]) : null; }
    private void Reply(int id, object result, string error, string name)
    {
        if (!IsDisposed && View.CoreWebView2 != null) View.CoreWebView2.PostWebMessageAsJson(Program.Json.Serialize(new { id = id, result = result, error = error, name = name }));
    }
    private async void Download(object sender, CoreWebView2DownloadStartingEventArgs e)
    {
        CoreWebView2Deferral deferral = e.GetDeferral();
        await Task.Yield();
        try
        {
            if (Program.TestMode && Program.TestNextDownload)
            {
                Program.TestNextDownload = false;
                Directory.CreateDirectory(Path.Combine(Program.Profile, "captures"));
                e.ResultFilePath = Path.Combine(Program.Profile, "captures", "saved-canvas.json");
                e.Handled = true;
                return;
            }
            using (SaveFileDialog picker = new SaveFileDialog())
            {
                picker.Title = "Save ConceptCards file";
                picker.FileName = Path.GetFileName(e.ResultFilePath);
                picker.Filter = picker.FileName.EndsWith(".json", StringComparison.OrdinalIgnoreCase) ? "ConceptCards canvas (*.json)|*.json" : "All files (*.*)|*.*";
                picker.DefaultExt = Path.GetExtension(picker.FileName).TrimStart('.');
                picker.InitialDirectory = downloadFolder ?? System.Environment.GetFolderPath(System.Environment.SpecialFolder.MyDocuments);
                if (picker.ShowDialog(this) != DialogResult.OK) { e.Cancel = true; e.Handled = true; return; }
                e.ResultFilePath = picker.FileName;
                downloadFolder = Path.GetDirectoryName(picker.FileName);
                e.Handled = true;
                e.DownloadOperation.StateChanged += delegate
                {
                    if (e.DownloadOperation.State == CoreWebView2DownloadState.Interrupted && !IsDisposed)
                        BeginInvoke((Action)delegate { MessageBox.Show(this, "The file could not be saved: " + e.DownloadOperation.InterruptReason, "Save interrupted", MessageBoxButtons.OK, MessageBoxIcon.Warning); });
                };
            }
        }
        catch (Exception error) { e.Cancel = true; Program.Log("Download failed " + error); MessageBox.Show(this, error.Message, "Could not save file"); }
        finally { deferral.Complete(); }
    }
    private void SetFullScreen(bool full)
    {
        if (full)
        {
            previousBorder = FormBorderStyle; previousBounds = Bounds; previousState = WindowState;
            WindowState = FormWindowState.Normal; FormBorderStyle = FormBorderStyle.None; Bounds = Screen.FromControl(this).Bounds;
        }
        else { FormBorderStyle = previousBorder; Bounds = previousBounds; WindowState = previousState; }
    }
}
