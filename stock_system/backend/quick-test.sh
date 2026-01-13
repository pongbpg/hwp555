#!/bin/bash

# Quick Test Script for Order System
# ทดสอบ Order System แบบง่าย ๆ

echo "🧪 Order System Quick Test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if AUTH_TOKEN is set
if [ -z "$AUTH_TOKEN" ]; then
    echo "❌ Error: AUTH_TOKEN not set"
    echo ""
    echo "📝 วิธีหา Token:"
    echo "1. เปิด Stock System (http://localhost:3001)"
    echo "2. Login เข้าระบบ"
    echo "3. กด F12 เปิด Console"
    echo "4. พิมพ์: localStorage.getItem('token')"
    echo "5. Copy token แล้วรันคำสั่ง:"
    echo ""
    echo "   export AUTH_TOKEN=\"your-token-here\""
    echo "   ./quick-test.sh"
    echo ""
    exit 1
fi

# Check if backend is running
echo "🔍 Checking backend status..."
if curl -s http://localhost:5001/api > /dev/null 2>&1; then
    echo "✅ Backend is running"
else
    echo "⚠️  Backend is not running"
    echo "   Starting backend in background..."
    npm run dev > /dev/null 2>&1 &
    BACKEND_PID=$!
    echo "   Waiting for backend to start..."
    sleep 3
    
    if curl -s http://localhost:5001/api > /dev/null 2>&1; then
        echo "✅ Backend started (PID: $BACKEND_PID)"
    else
        echo "❌ Failed to start backend"
        exit 1
    fi
fi

# Check if axios is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi

# Check if test script exists
if [ ! -f "test-order-system.mjs" ]; then
    echo "❌ test-order-system.mjs not found"
    exit 1
fi

# Check if axios is available
echo "🔍 Checking dependencies..."
if ! node -e "import('axios')" 2>/dev/null; then
    echo "⚠️  axios not found, installing..."
    npm install axios
fi

# Run the test
echo ""
echo "🚀 Running tests..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node test-order-system.mjs

# Show exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "✅ All tests passed!"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
else
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "❌ Some tests failed. Check errors above."
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    exit 1
fi
