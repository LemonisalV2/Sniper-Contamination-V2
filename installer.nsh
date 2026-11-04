
; SNIPER CONTAMINATION
; Neon installer palette and rounded live progress bar.

!ifndef BUILD_UNINSTALLER
  Var scInstallerWindow
  Var scProgressBar
!endif

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "SNIPER CONTAMINATION"
  !define MUI_WELCOMEPAGE_TEXT "Welcome to SNIPER CONTAMINATION!$\r$\n$\r$\nChoose your language, then prepare to install the game."
  !define MUI_BGCOLOR "02040A"
  !define MUI_TEXTCOLOR "DFFFF0"
  !define MUI_INSTFILESPAGE_COLORS "DFFFF0 02040A"
  !define MUI_INSTFILESPAGE_PROGRESSBAR "colored"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customPageAfterChangeDir
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW customInstFilesShow
!macroend

!ifndef BUILD_UNINSTALLER
Function customInstFilesShow
  FindWindow $scInstallerWindow "#32770" "" $HWNDPARENT
  GetDlgItem $scProgressBar $scInstallerWindow 1004
  StrCmp $scProgressBar "" customInstFilesShowDone

  System::Store "S"
  System::Call 'USER32::GetClientRect(p $scProgressBar, @r1)'
  System::Call '*$1(i,i,i.r2,i.r3)'
  IntCmp $2 0 customInstFilesShowRestore customInstFilesShowRestore customInstFilesShowWidthReady
customInstFilesShowWidthReady:
  IntCmp $3 0 customInstFilesShowRestore customInstFilesShowRestore customInstFilesShowHeightReady
customInstFilesShowHeightReady:
  System::Call 'GDI32::CreateRoundRectRgn(i 0, i 0, i $2, i $3, i $3, i $3) p .r4'
  System::Call 'USER32::SetWindowRgn(p $scProgressBar, p $4, i 1) i.r5'
  IntCmp $5 0 customInstFilesShowDeleteRegion customInstFilesShowRestore customInstFilesShowRestore
customInstFilesShowDeleteRegion:
  System::Call 'GDI32::DeleteObject(p $4)'
customInstFilesShowRestore:
  System::Store "L"

customInstFilesShowDone:
FunctionEnd
!endif
