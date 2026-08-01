Option Explicit
Dim shell, fso, scriptPath, scriptDir, nodeExe, launcher, cmd, exitCode, message
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)
nodeExe = """" & scriptDir & "\node.exe" & """"
launcher = """" & scriptDir & "\launcher.js" & """"
cmd = nodeExe & " " & launcher
exitCode = shell.Run(cmd, 0, True)
If exitCode <> 0 Then
  Select Case exitCode
    Case 2
      message = "The editor did not become ready in time. Restart Windows and try again."
    Case 3
      message = "Port 3000 is already in use by another application. Close it, then launch the editor again."
    Case 4
      message = "The editor could not safely stop its installed server process."
    Case Else
      message = "FW OCTO Editor could not start (error " & exitCode & ")."
  End Select
  shell.Popup message, 0, "FW OCTO Editor", 16
End If
Set fso = Nothing
Set shell = Nothing
