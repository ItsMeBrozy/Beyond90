@echo off
cd /d "%~dp0"
echo === Beyond90 Deploy ===
git add -A
git diff --cached --quiet
if %errorlevel%==0 (
    echo Nothing to commit.
    goto :eof
)
set /p msg="Commit message: "
git commit -m "%msg%"
git push origin master
echo === Done! ===
