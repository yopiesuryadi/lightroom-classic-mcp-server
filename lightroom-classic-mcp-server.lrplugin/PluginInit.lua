local LrLogger = import "LrLogger"
local BridgeClient = require "BridgeClient"

local logger = LrLogger("lightroom-classic-mcp-server")
logger:enable("logfile")

_G.LightroomClassicMcpServer = {
  logger = logger,
  stop = BridgeClient.start(logger)
}

logger:info("Lightroom Classic MCP bridge plugin initialized")
