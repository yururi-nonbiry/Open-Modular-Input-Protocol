using System;
using System.IO;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using pc_software_cs.Services;

namespace pc_software_cs
{
    public partial class MainWindow : Window
    {
        private AppController? _appController;
        private SerialDeviceManager? _serialManager;
        private JoyConDeviceManager? _joyconManager;

        public MainWindow()
        {
            InitializeComponent();
            InitializeWebView();
        }

        private async void InitializeWebView()
        {
            var env = await CoreWebView2Environment.CreateAsync(null, Path.Combine(Path.GetTempPath(), "OmipWebView2"));
            await webView.EnsureCoreWebView2Async(env);
            
            bool isDev = Environment.GetCommandLineArgs().Contains("--dev");
            
            if (!isDev)
            {
                string appDir = AppDomain.CurrentDomain.BaseDirectory;
                string wwwrootDir = Path.Combine(appDir, "wwwroot");

                webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                    "app.local",
                    wwwrootDir,
                    CoreWebView2HostResourceAccessKind.Allow);
            }

            // Initialize backend services
            _serialManager = new SerialDeviceManager();
            _joyconManager = new JoyConDeviceManager();
            _appController = new AppController(_serialManager, _joyconManager);

            // Forward messages from WebView2 to the AppController
            webView.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;
            
            // Forward messages from AppController to WebView2
            _appController.OnWebMessageResponse += jsonMsg => 
            {
                // Must be executed on UI Thread
                Dispatcher.InvokeAsync(() => 
                {
                    webView.CoreWebView2.PostWebMessageAsString(jsonMsg);
                });
            };

            // Start JoyCon Scanning
            _joyconManager.StartScanning();

            isDev = Environment.GetCommandLineArgs().Contains("--dev");
            if (isDev)
            {
                webView.CoreWebView2.Navigate("http://localhost:5173");
            }
            else
            {
                webView.CoreWebView2.Navigate("https://app.local/index.html");
            }
        }

        private void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            string message = e.TryGetWebMessageAsString();
            System.Diagnostics.Debug.WriteLine($"[Web -> C#] {message}");
            _appController?.ProcessWebMessage(message);
        }

        protected override void OnClosed(EventArgs e)
        {
            _appController?.Dispose();
            base.OnClosed(e);
        }
    }
}