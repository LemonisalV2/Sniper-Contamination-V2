; SNIPER CONTAMINATION
; Custom setup UI with progress driven by the NSIS install control.

!ifndef BUILD_UNINSTALLER
  Var scInstallerWindow
  Var scProgressBar
  Var scControl
  Var scTrebuchetFont
  Var scRootWindow

  SetFont "Trebuchet MS" 9

  !ifdef MUI_BGCOLOR
    !undef MUI_BGCOLOR
  !endif
  !define MUI_BGCOLOR "02040A"
  !ifdef MUI_TEXTCOLOR
    !undef MUI_TEXTCOLOR
  !endif
  !define MUI_TEXTCOLOR "DFFFF0"
  !define MUI_INSTALLCOLORS "00FF66 02040A"
  !define MUI_INSTFILESPAGE_COLORS "B9FFD2 02040A"

  !macro customWelcomePage
  !macroend

  !macro customInstall
    WriteINIStr "$PLUGINSDIR\sniper-installer-ui.ready.installcomplete" "Setup" "InstallComplete" "1"
  !macroend

  !macro customFinishPage
    Function customInstFilesLeave
      IfFileExists "$PLUGINSDIR\sniper-installer-ui.ready.complete" 0 customInstFilesLeaveDone
      IfSilent customInstFilesLeaveDone
      ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
      Pop $0
      IntCmp $0 0 customInstFilesLeaveMarkLaunched customInstFilesLeaveDone customInstFilesLeaveDone
    customInstFilesLeaveMarkLaunched:
      WriteINIStr "$PLUGINSDIR\sniper-installer-ui.ready.launched" "Setup" "AppLaunched" "1"
    customInstFilesLeaveDone:
      Quit
    FunctionEnd
  !macroend

  !macro customInstallmode
    StrCpy $isForceCurrentInstall "1"
  !macroend

  !macro customPageAfterChangeDir
    !define MUI_PAGE_CUSTOMFUNCTION_SHOW customInstFilesShow
    !define MUI_PAGE_CUSTOMFUNCTION_LEAVE customInstFilesLeave
  !macroend

  Function customInstFilesShow
    InitPluginsDir
    SetOutPath "$PLUGINSDIR"
    File /oname=sniper-installer-ui.ps1 "${PROJECT_DIR}\sniper-installer-ui.ps1"
    File /oname=sniper-installer-launcher.vbs "${PROJECT_DIR}\sniper-installer-launcher.vbs"
    File /oname=sniper-installer-icon.ico "${PROJECT_DIR}\icon.ico"

    FindWindow $scInstallerWindow "#32770" "" $HWNDPARENT
    StrCmp $scInstallerWindow 0 customInstFilesShowDone

    CreateFont $scTrebuchetFont "Trebuchet MS" 9 "400"
    SetCtlColors $HWNDPARENT "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
    SetCtlColors $scInstallerWindow "${MUI_TEXTCOLOR}" "${MUI_BGCOLOR}"
    SendMessage $scInstallerWindow 0x0030 $scTrebuchetFont 0

    GetDlgItem $scControl $HWNDPARENT 1037
    SetCtlColors $scControl "00FF66" "${MUI_BGCOLOR}"
    GetDlgItem $scControl $HWNDPARENT 1034
    SetCtlColors $scControl "" "${MUI_BGCOLOR}"
    GetDlgItem $scProgressBar $scInstallerWindow 1004
    StrCmp $scProgressBar 0 customInstFilesShowDone

    Delete "$PLUGINSDIR\sniper-installer-ui.ready"
    Delete "$PLUGINSDIR\sniper-installer-ui.ready.complete"
    Delete "$PLUGINSDIR\sniper-installer-ui.ready.error"
    Delete "$PLUGINSDIR\sniper-installer-ui.ready.installcomplete"
    Delete "$PLUGINSDIR\sniper-installer-ui.ready.launched"
    System::Call 'USER32::GetAncestor(p $HWNDPARENT, i 2)p.r0'
    StrCmp $0 0 customInstFilesUseParent
    StrCpy $scRootWindow $0
    Goto customInstFilesRootReady
  customInstFilesUseParent:
    StrCpy $scRootWindow $HWNDPARENT
  customInstFilesRootReady:
    System::Call 'kernel32::GetCurrentProcessId()i.r3'
    Exec '"$SYSDIR\wscript.exe" //B //NoLogo "$PLUGINSDIR\sniper-installer-launcher.vbs" "$PLUGINSDIR\sniper-installer-ui.ps1" "$scRootWindow" "$HWNDPARENT" "$scInstallerWindow" "$scProgressBar" "$PLUGINSDIR\sniper-installer-ui.ready" "$PLUGINSDIR\sniper-installer-icon.ico" "$INSTDIR\${PRODUCT_FILENAME}.exe" "$3"'
    StrCpy $0 0
  customInstFilesShowWaitForRing:
    IfFileExists "$PLUGINSDIR\sniper-installer-ui.ready" customInstFilesShowRingReady
    IfFileExists "$PLUGINSDIR\sniper-installer-ui.ready.error" customInstFilesShowDone
    Sleep 100
    IntOp $0 $0 + 1
    IntCmp $0 300 customInstFilesShowDone customInstFilesShowWaitForRing customInstFilesShowDone
  customInstFilesShowRingReady:
    System::Call 'USER32::GetWindowLongW(p $scRootWindow, i -20)i.r1'
    IntOp $1 $1 | 0x00000080
    IntOp $1 $1 & 0xFFFBFFFF
    System::Call 'USER32::SetWindowLongW(p $scRootWindow, i -20, i $1)i.r2'
    System::Call 'USER32::SetWindowPos(p $scRootWindow, p 0, i 0, i 0, i 0, i 0, i 0x0027)'
    ShowWindow $scRootWindow 0
    ShowWindow $HWNDPARENT 0
    ShowWindow $scInstallerWindow 0
  customInstFilesShowDone:
  FunctionEnd
!endif
