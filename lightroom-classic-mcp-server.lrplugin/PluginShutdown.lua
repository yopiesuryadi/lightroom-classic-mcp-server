if _G.LightroomClassicMcpServer ~= nil then
  if _G.LightroomClassicMcpServer.stop ~= nil then
    _G.LightroomClassicMcpServer.stop()
  end
  if _G.LightroomClassicMcpServer.logger ~= nil then
    _G.LightroomClassicMcpServer.logger:info("Lightroom Classic MCP bridge plugin shut down")
  end
end

_G.LightroomClassicMcpServer = nil
