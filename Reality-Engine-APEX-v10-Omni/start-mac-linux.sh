#!/bin/bash
cd "$(dirname "$0")"
echo "================================================"
echo "  تشغيل نظام إدارة المشاريع محلياً"
echo "  افتح المتصفح على العنوان: http://localhost:8000"
echo "  لإيقاف الخادم: اضغط Ctrl+C"
echo "================================================"
( sleep 1 ; open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null ) &
python3 -m http.server 8000 2>/dev/null || python -m http.server 8000
