$ErrorActionPreference = "Stop"

function ConvertTo-NativeWindowHandle([string]$value) {
    if ($value.StartsWith("0x", [StringComparison]::OrdinalIgnoreCase)) {
        $number = [UInt64]::Parse($value.Substring(2), [Globalization.NumberStyles]::HexNumber)
        return [IntPtr]([Int64]$number)
    }

    return [IntPtr]([Int64]$value)
}

$rootWindow = ConvertTo-NativeWindowHandle $args[0]
$commandWindow = ConvertTo-NativeWindowHandle $args[1]
$pageWindow = ConvertTo-NativeWindowHandle $args[2]
$progressBar = ConvertTo-NativeWindowHandle $args[3]
$readyFile = $args[4]
$iconPath = $args[5]
$launchPath = $args[6]
$installerPid = [UInt32]$args[7]

trap {
    try {
        [System.IO.File]::WriteAllText($readyFile + ".error", ($_ | Out-String))
    } catch {
    }
    exit 1
}

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$frameworkAssemblies = @(
    [System.ComponentModel.Component].Assembly.Location,
    [System.Drawing.Bitmap].Assembly.Location,
    [System.Windows.Forms.Form].Assembly.Location
)

Add-Type -ReferencedAssemblies $frameworkAssemblies -TypeDefinition @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Runtime.InteropServices;
using System.Windows.Forms;

public sealed class SniperInstallerWindow : Form
{
    private const uint PbmGetPos = 0x0408;
    private const uint PbmGetRange = 0x0407;
    private const int BmClick = 0x00F5;
    private const int WmCommand = 0x0111;
    private const int BnClicked = 0;
    private const uint ScClose = 0xF060;
    private const uint MfByCommand = 0x00000000;
    private const uint ProcessTerminate = 0x00000001;
    private const uint ProcessSynchronize = 0x00100000;
    private const uint ProcessQueryLimitedInformation = 0x00001000;
    private const uint WaitTimeout = 0x00000102;

    [DllImport("user32.dll")]
    private static extern IntPtr SendMessage(IntPtr hwnd, uint message, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll")]
    private static extern bool IsWindow(IntPtr hwnd);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern IntPtr OpenProcess(uint access, bool inheritHandle, uint processId);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool TerminateProcess(IntPtr process, uint exitCode);

    [DllImport("kernel32.dll")]
    private static extern uint WaitForSingleObject(IntPtr handle, uint milliseconds);

    [DllImport("kernel32.dll")]
    private static extern bool CloseHandle(IntPtr handle);

    [DllImport("user32.dll")]
    private static extern bool EnumChildWindows(IntPtr parent, EnumWindowProc callback, IntPtr data);

    [DllImport("user32.dll")]
    private static extern int GetDlgCtrlID(IntPtr hwnd);

    private delegate bool EnumWindowProc(IntPtr hwnd, IntPtr data);

    private readonly IntPtr rootWindow;
    private readonly IntPtr commandWindow;
    private readonly IntPtr pageWindow;
    private readonly IntPtr progressBar;
    private readonly IntPtr installerProcess;
    private readonly string readyFile;
    private readonly string launchPath;
    private readonly uint installerPid;
    private readonly Timer progressTimer;
    private int percent;
    private int finishedTicks;
    private bool rootWasValid;
    private bool isSpinning;
    private float spinnerAngle;
    private bool completionSent;
    private bool cancelRequested;
    private bool cancelFailureShown;
    private DateTime cancelRequestedAt;
    private DateTime completionSentAt;
    private DateTime lastCloseAttemptAt;
    private readonly Label cancelLabel;

    [DllImport("user32.dll")]
    private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);

    [DllImport("user32.dll")]
    private static extern bool ShowWindow(IntPtr hwnd, int command);

    [DllImport("user32.dll")]
    private static extern IntPtr GetDlgItem(IntPtr hwnd, int itemId);

    [DllImport("user32.dll")]
    private static extern IntPtr GetSystemMenu(IntPtr hwnd, bool revert);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern bool DeleteMenu(IntPtr menu, uint position, uint flags);

    [DllImport("user32.dll")]
    private static extern bool DrawMenuBar(IntPtr hwnd);

    protected override CreateParams CreateParams
    {
        get
        {
            CreateParams parameters = base.CreateParams;
            parameters.ExStyle |= 0x00000080;
            return parameters;
        }
    }

    public SniperInstallerWindow(IntPtr rootWindow, IntPtr commandWindow, IntPtr pageWindow, IntPtr progressBar, string readyFile, string iconPath, string launchPath, uint installerPid)
    {
        this.rootWindow = rootWindow;
        this.commandWindow = commandWindow;
        this.pageWindow = pageWindow;
        this.progressBar = progressBar;
        this.readyFile = readyFile;
        this.launchPath = launchPath;
        this.installerPid = installerPid;
        installerProcess = OpenProcess(ProcessTerminate | ProcessSynchronize | ProcessQueryLimitedInformation, false, installerPid);
        rootWasValid = IsWindow(rootWindow);

        FormBorderStyle = FormBorderStyle.FixedSingle;
        Text = "Sniper Contamination Setup";
        ControlBox = true;
        MinimizeBox = true;
        MaximizeBox = false;
        StartPosition = FormStartPosition.CenterScreen;
        ShowInTaskbar = false;
        TopMost = true;
        MinimumSize = new Size(560, 500);
        ClientSize = new Size(560, 500);
        BackColor = Color.FromArgb(2, 4, 10);
        DoubleBuffered = true;
        if (!String.IsNullOrEmpty(iconPath) && System.IO.File.Exists(iconPath))
            Icon = new Icon(iconPath);

        cancelLabel = new Label
        {
            AutoSize = true,
            BackColor = Color.Transparent,
            Cursor = Cursors.Hand,
            Font = new Font("Trebuchet MS", 12, FontStyle.Regular, GraphicsUnit.Point),
            ForeColor = Color.FromArgb(185, 255, 210),
            Text = "Cancel",
            UseMnemonic = false
        };
        PositionCancelLabel();
        cancelLabel.Click += delegate { CancelInstallation(); };
        cancelLabel.MouseEnter += delegate { cancelLabel.ForeColor = Color.FromArgb(0, 255, 102); };
        cancelLabel.MouseLeave += delegate { cancelLabel.ForeColor = Color.FromArgb(185, 255, 210); };
        Controls.Add(cancelLabel);
        Resize += delegate { PositionCancelLabel(); Invalidate(); };
        FormClosing += delegate(object sender, FormClosingEventArgs e)
        {
            if (!completionSent && !cancelRequested)
            {
                e.Cancel = true;
                CancelInstallation();
            }
        };

        progressTimer = new Timer { Interval = 60 };
        progressTimer.Tick += UpdateProgress;
        Shown += delegate
        {
            IntPtr systemMenu = GetSystemMenu(Handle, false);
            if (systemMenu != IntPtr.Zero)
            {
                DeleteMenu(systemMenu, ScClose, MfByCommand);
                DrawMenuBar(Handle);
            }
            HideInstallerWindow();
            System.IO.File.WriteAllText(this.readyFile, "ready");
            progressTimer.Start();
        };
        FormClosed += delegate
        {
            progressTimer.Stop();
            if (installerProcess != IntPtr.Zero)
                CloseHandle(installerProcess);
        };
    }

    private void UpdateProgress(object sender, EventArgs e)
    {
        bool installerRunning = IsInstallerRunning();
        if (cancelRequested)
        {
            if (!installerRunning)
                Close();
            else if (!cancelFailureShown && DateTime.UtcNow - cancelRequestedAt >= TimeSpan.FromSeconds(1) &&
                !ForceTerminateInstaller())
            {
                cancelFailureShown = true;
                cancelRequested = false;
            }
            return;
        }

        if (completionSent)
        {
            if (!installerRunning)
            {
                EnsureAppStarted();
                Close();
            }
            else
            {
                if (DateTime.UtcNow - lastCloseAttemptAt >= TimeSpan.FromSeconds(1))
                    ClickInstallerCloseButton();
                if (DateTime.UtcNow - completionSentAt >= TimeSpan.FromSeconds(10) &&
                    ForceTerminateInstaller() && !IsInstallerRunning())
                {
                    EnsureAppStarted();
                    Close();
                }
            }
            return;
        }

        if (!installerRunning && rootWasValid)
        {
            if (System.IO.File.Exists(readyFile + ".installcomplete"))
                EnsureAppStarted();
            Close();
            return;
        }

        HideInstallerWindow();
        if (System.IO.File.Exists(readyFile + ".installcomplete"))
        {
            percent = 100;
        }
        else if (IsWindow(progressBar))
        {
            int position = SendMessage(progressBar, PbmGetPos, IntPtr.Zero, IntPtr.Zero).ToInt32();
            int maximum = SendMessage(progressBar, PbmGetRange, new IntPtr(1), IntPtr.Zero).ToInt32();
            if (maximum <= 0)
                maximum = position > 100 ? 10000 : 100;
            if (maximum > 0)
                percent = Math.Max(percent, Math.Min(100, position * 100 / maximum));
        }
        if (percent >= 100)
        {
            finishedTicks++;
            if (finishedTicks >= 9)
            {
                isSpinning = true;
                spinnerAngle = (spinnerAngle + 24f) % 360f;
                if (finishedTicks >= 17 && System.IO.File.Exists(readyFile + ".installcomplete"))
                    CompleteInstallation();
            }
        } else {
            finishedTicks = 0;
        }

        Invalidate();
    }

    private bool IsInstallerRunning()
    {
        if (installerProcess != IntPtr.Zero)
            return WaitForSingleObject(installerProcess, 0) == WaitTimeout;
        return IsWindow(rootWindow);
    }

    private void HideInstallerWindow()
    {
        if (IsWindow(rootWindow))
            ShowWindow(rootWindow, 0);
        if (IsWindow(commandWindow))
            ShowWindow(commandWindow, 0);
        if (IsWindow(pageWindow))
            ShowWindow(pageWindow, 0);
    }

    private void CancelInstallation()
    {
        if (cancelRequested || completionSent)
            return;

        cancelRequested = true;
        cancelFailureShown = false;
        cancelRequestedAt = DateTime.UtcNow;
        IntPtr cancelButton = FindButton(commandWindow, 2);
        if (cancelButton == IntPtr.Zero)
            cancelButton = FindButton(pageWindow, 2);
        if (cancelButton == IntPtr.Zero)
            cancelButton = FindButton(rootWindow, 2);

        if (cancelButton != IntPtr.Zero)
        {
            SendMessage(cancelButton, BmClick, IntPtr.Zero, IntPtr.Zero);
        }
        else if (IsWindow(commandWindow))
        {
            SendMessage(commandWindow, WmCommand, new IntPtr(2 | (BnClicked << 16)), IntPtr.Zero);
        }
        else if (!ForceTerminateInstaller())
        {
            cancelRequested = false;
        }
    }

    private void CompleteInstallation()
    {
        completionSent = true;
        completionSentAt = DateTime.UtcNow;
        System.IO.File.WriteAllText(readyFile + ".complete", "complete");
        ClickInstallerCloseButton();
    }

    private void ClickInstallerCloseButton()
    {
        lastCloseAttemptAt = DateTime.UtcNow;
        IntPtr closeButton = FindButton(commandWindow, 1);
        if (closeButton == IntPtr.Zero)
            closeButton = FindButton(pageWindow, 1);
        if (closeButton == IntPtr.Zero)
            closeButton = FindButton(rootWindow, 1);

        if (closeButton != IntPtr.Zero)
            SendMessage(closeButton, BmClick, IntPtr.Zero, IntPtr.Zero);
        else if (IsWindow(commandWindow))
            SendMessage(commandWindow, WmCommand, new IntPtr(1 | (BnClicked << 16)), IntPtr.Zero);
    }

    private bool ForceTerminateInstaller()
    {
        if (!IsInstallerRunning())
            return true;

        if (installerProcess != IntPtr.Zero && TerminateProcess(installerProcess, 1))
            return true;

        try
        {
            System.Diagnostics.Process.GetProcessById((int)installerPid).Kill();
            return true;
        }
        catch (Exception error)
        {
            MessageBox.Show(this, "The installer could not be closed.\r\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
            return false;
        }
    }

    private void EnsureAppStarted()
    {
        string launchedFile = readyFile + ".launched";
        if (System.IO.File.Exists(launchedFile))
            return;

        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
            {
                FileName = launchPath,
                UseShellExecute = true
            });
            System.IO.File.WriteAllText(launchedFile, "launched");
        }
        catch (Exception error)
        {
            MessageBox.Show(this, "Installation finished, but the game could not be opened.\r\n" + error.Message,
                Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }

    private IntPtr FindButton(IntPtr parent, int controlId)
    {
        if (!IsWindow(parent))
            return IntPtr.Zero;

        IntPtr direct = GetDlgItem(parent, controlId);
        if (direct != IntPtr.Zero)
            return direct;

        IntPtr found = IntPtr.Zero;
        EnumChildWindows(parent, delegate(IntPtr child, IntPtr data)
        {
            if (GetDlgCtrlID(child) == controlId)
            {
                found = child;
                return false;
            }
            return true;
        }, IntPtr.Zero);
        return found;
    }

    private void PositionCancelLabel()
    {
        cancelLabel.Location = new Point((ClientSize.Width - cancelLabel.PreferredWidth) / 2, ClientSize.Height - 58);
    }

    protected override void OnPaint(PaintEventArgs e)
    {
        base.OnPaint(e);
        Graphics g = e.Graphics;
        g.SmoothingMode = SmoothingMode.AntiAlias;
        g.PixelOffsetMode = PixelOffsetMode.HighQuality;

        using (Font titleFont = new Font("Trebuchet MS", 22, FontStyle.Bold, GraphicsUnit.Point))
        using (Brush titleBrush = new SolidBrush(Color.FromArgb(217, 255, 231)))
        {
            StringFormat centered = new StringFormat { Alignment = StringAlignment.Center };
            g.DrawString(isSpinning ? "Almost done" : "Installing", titleFont, titleBrush, new RectangleF(0, 38, ClientSize.Width, 38), centered);
            centered.Dispose();
        }

        float centerX = ClientSize.Width / 2f;
        float centerY = ClientSize.Height * 0.5f;
        float radius = Math.Min(110f, Math.Min((ClientSize.Width - 100f) / 2f, (ClientSize.Height - 180f) / 2f));
        RectangleF ring = new RectangleF(centerX - radius, centerY - radius, radius * 2, radius * 2);

        using (Pen baseRing = new Pen(Color.FromArgb(115, 125, 132), 8f))
        {
            baseRing.StartCap = LineCap.Round;
            baseRing.EndCap = LineCap.Round;
            g.DrawEllipse(baseRing, ring);
        }

        float sweep = 360f * percent / 100f;
        if (sweep > 0)
        {
            DrawArcGlow(g, ring, sweep, 25f, 20);
            DrawArcGlow(g, ring, sweep, 15f, 65);
            DrawArcGlow(g, ring, sweep, 9f, 150);
            using (Pen completed = new Pen(Color.FromArgb(0, 255, 102), 5f))
            {
                completed.StartCap = LineCap.Round;
                completed.EndCap = LineCap.Round;
                g.DrawArc(completed, ring, -90f, sweep);
            }
        }

        double angle = (-90.0 + (isSpinning ? spinnerAngle : sweep)) * Math.PI / 180.0;
        float tipX = centerX + (float)Math.Cos(angle) * radius;
        float tipY = centerY + (float)Math.Sin(angle) * radius;

        using (Pen needleGlow = new Pen(Color.FromArgb(55, 0, 255, 102), 14f))
        using (Pen needle = new Pen(Color.FromArgb(0, 255, 102), 3f))
        {
            needleGlow.StartCap = LineCap.Round;
            needleGlow.EndCap = LineCap.Round;
            needle.StartCap = LineCap.Round;
            needle.EndCap = LineCap.Round;
            g.DrawLine(needleGlow, centerX, centerY, tipX, tipY);
            g.DrawLine(needle, centerX, centerY, tipX, tipY);
        }

        using (Brush tipGlow = new SolidBrush(Color.FromArgb(55, 0, 255, 102)))
        using (Brush tip = new SolidBrush(Color.FromArgb(0, 255, 102)))
        using (Brush tipCore = new SolidBrush(Color.FromArgb(225, 225, 255, 235)))
        {
            g.FillEllipse(tipGlow, tipX - 18, tipY - 18, 36, 36);
            g.FillEllipse(tip, tipX - 9, tipY - 9, 18, 18);
            g.FillEllipse(tipCore, tipX - 3, tipY - 3, 6, 6);
        }

        using (Brush centerGlow = new SolidBrush(Color.FromArgb(70, 0, 255, 102)))
        using (Brush center = new SolidBrush(Color.FromArgb(0, 255, 102)))
        {
            g.FillEllipse(centerGlow, centerX - 13, centerY - 13, 26, 26);
            g.FillEllipse(center, centerX - 6, centerY - 6, 12, 12);
        }
    }

    private static void DrawArcGlow(Graphics g, RectangleF ring, float sweep, float width, int alpha)
    {
        using (Pen glow = new Pen(Color.FromArgb(alpha, 0, 255, 102), width))
        {
            glow.StartCap = LineCap.Round;
            glow.EndCap = LineCap.Round;
            g.DrawArc(glow, ring, -90f, sweep);
        }
    }
}
'@

$form = [SniperInstallerWindow]::new($rootWindow, $commandWindow, $pageWindow, $progressBar, $readyFile, $iconPath, $launchPath, $installerPid)
[System.Windows.Forms.Application]::Run($form)
