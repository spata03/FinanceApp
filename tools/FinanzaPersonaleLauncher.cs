using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Threading;
using System.Windows.Forms;

namespace FinanzaPersonaleLauncher
{
    internal static class Program
    {
        private const string AppRoot = @"c:\Users\Andrea Spataro\.gemini\antigravity\scratch\personal-finance-app";
        private const int Port = 8080;
        private static readonly string AppUrl = "http://127.0.0.1:" + Port + "/index.html";

        [STAThread]
        private static void Main()
        {
            if (!Directory.Exists(AppRoot))
            {
                MessageBox.Show(
                    "Cartella dell'app non trovata:\n" + AppRoot,
                    "FinanzaPersonale",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                return;
            }

            if (!IsServerReady())
            {
                if (!StartServer("node.exe", @"backend\server.js"))
                {
                    StartServer("python.exe", "-m http.server " + Port + " --bind 127.0.0.1");
                }

                for (int i = 0; i < 30 && !IsServerReady(); i++)
                {
                    Thread.Sleep(250);
                }
            }

            if (!IsServerReady())
            {
                MessageBox.Show(
                    "Non riesco ad avviare il server locale. Verifica che Python o Node siano disponibili.",
                    "FinanzaPersonale",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            OpenAppWindow();
        }

        private static bool StartServer(string fileName, string arguments)
        {
            try
            {
                var startInfo = new ProcessStartInfo
                {
                    FileName = fileName,
                    Arguments = arguments,
                    WorkingDirectory = AppRoot,
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WindowStyle = ProcessWindowStyle.Hidden
                };
                Process.Start(startInfo);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static void OpenAppWindow()
        {
            if (TryStartAppModeBrowser())
            {
                return;
            }

            Process.Start(new ProcessStartInfo(AppUrl) { UseShellExecute = true });
        }

        private static bool TryStartAppModeBrowser()
        {
            string[] candidates = new string[]
            {
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Microsoft\Edge\Application\msedge.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe"),
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), @"Google\Chrome\Application\chrome.exe"),
                "msedge.exe",
                "chrome.exe"
            };

            foreach (string candidate in candidates)
            {
                if (candidate.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) &&
                    candidate.Contains(@"\") &&
                    !File.Exists(candidate))
                {
                    continue;
                }

                try
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = candidate,
                        Arguments = "--app=\"" + AppUrl + "\" --new-window",
                        UseShellExecute = false
                    });
                    return true;
                }
                catch
                {
                    // Prova il browser candidato successivo.
                }
            }

            return false;
        }

        private static bool IsServerReady()
        {
            try
            {
                var request = (HttpWebRequest)WebRequest.Create(AppUrl);
                request.Method = "GET";
                request.Timeout = 400;
                request.AllowAutoRedirect = false;
                using (var response = (HttpWebResponse)request.GetResponse())
                {
                    return (int)response.StatusCode >= 200 && (int)response.StatusCode < 400;
                }
            }
            catch
            {
                return false;
            }
        }
    }
}
