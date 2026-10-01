@echo off
cd /d "%~dp0"
echo ================================================
echo   تشغيل نظام إدارة المشاريع محلياً
echo   افتح المتصفح على العنوان: http://localhost:8000
echo   لإيقاف الخادم: أغلق هذه النافذة
echo ================================================
start http://localhost:8000
python -m http.server 8000 2>nul || py -m http.server 8000 2>nul || python3 -m http.server 8000
pause
