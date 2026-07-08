@echo off
echo ============================================
echo   OpenCode MCP Approval Server Setup
echo ============================================
echo.
echo Step 1: Adding MCP server (interactive)...
echo   Name: approver
echo   Type: Local
echo   Command: node
echo.
opencode mcp add

echo.
echo Step 2: Updating config with full parameters...
node -e "const fs=require('fs');const f=(process.env.USERPROFILE+'/.config/opencode/opencode.json').replace(/\\/g,'/');const c=JSON.parse(fs.readFileSync(f,'utf8'));c.mcp=c.mcp||{};c.mcp.approver={type:'local',command:['node','D:/projects/claude-approver/mcp-server.js'],environment:{MCP_MODE:'1',PORT:'8765',NGROK_AUTHTOKEN:'your_ngrok_token',MIAOTIXING_ID:'your_miao_code',DISABLE_PUSH:'false'}};fs.writeFileSync(f,JSON.stringify(c,null,2));console.log('Config updated!');"

echo.
echo Setup complete! Run: opencode
pause
