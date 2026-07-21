Option Explicit
Dim shell, fso, scriptPath, scriptDir, nodeExe, launcher, cmd
Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
scriptPath = WScript.ScriptFullName
scriptDir = fso.GetParentFolderName(scriptPath)
nodeExe = """" & scriptDir & "\node.exe" & """"
launcher = """" & scriptDir & "\launcher.js" & """"
cmd = nodeExe & " " & launcher
shell.Run cmd, 0, False
Set fso = Nothing
Set shell = Nothing
