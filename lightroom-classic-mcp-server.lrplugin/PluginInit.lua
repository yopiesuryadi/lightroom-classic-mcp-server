local LrLogger = import "LrLogger"
local LrFileUtils = import "LrFileUtils"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local function appendDebug(message)
  local path = LrPathUtils.child(
    LrPathUtils.child(
      LrPathUtils.child(
        LrPathUtils.child(LrPathUtils.child(LrPathUtils.getStandardFilePath("home"), "Library"), "Logs"),
        "Adobe"
      ),
      "Lightroom"
    ),
    "LrClassicLogs"
  )
  LrFileUtils.createAllDirectories(path)
  path = LrPathUtils.child(path, "LightroomClassicMCPServer.log")
  local file = io.open(path, "a")
  if file ~= nil then
    file:write(os.date("%Y-%m-%d %H:%M:%S"), "\t", tostring(message), "\n")
    file:close()
  end
end

local logger = LrLogger("lightroom-classic-mcp-server")
logger:enable("logfile")

appendDebug("PluginInit started")

local ok, err = LrTasks.pcall(function()
  local BridgeClient = require "BridgeClient"

  _G.LightroomClassicMcpServer = {
    logger = logger,
    stop = BridgeClient.start(logger)
  }

  logger:info("Lightroom Classic MCP bridge plugin initialized")
  appendDebug("Lightroom Classic MCP bridge plugin initialized")
end)

if not ok then
  logger:error("Lightroom Classic MCP bridge plugin init failed: " .. tostring(err))
  appendDebug("Lightroom Classic MCP bridge plugin init failed: " .. tostring(err))
end
