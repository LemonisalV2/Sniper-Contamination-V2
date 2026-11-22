Option Explicit

Dim shell, scriptPath, rootWindow, commandWindow, pageWindow, progressBar, readyFile, iconPath, launchPath, installerPid, powershell, command
Set shell = CreateObject("WScript.Shell")

scriptPath = WScript.Arguments(0)
rootWindow = WScript.Arguments(1)
commandWindow = WScript.Arguments(2)
pageWindow = WScript.Arguments(3)
progressBar = WScript.Arguments(4)
readyFile = WScript.Arguments(5)
iconPath = WScript.Arguments(6)
launchPath = WScript.Arguments(7)
installerPid = WScript.Arguments(8)
powershell = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

command = QuoteArgument(powershell) & " -STA -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File " & _
    QuoteArgument(scriptPath) & " " & QuoteArgument(rootWindow) & " " & _
    QuoteArgument(commandWindow) & " " & QuoteArgument(pageWindow) & " " & _
    QuoteArgument(progressBar) & " " & QuoteArgument(readyFile) & " " & QuoteArgument(iconPath) & " " & _
    QuoteArgument(launchPath) & " " & QuoteArgument(installerPid)
shell.Run command, 0, False

Function QuoteArgument(value)
    QuoteArgument = """" & Replace(value, """", """""") & """"
End Function
