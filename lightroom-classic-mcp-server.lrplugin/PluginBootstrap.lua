local LrFileUtils = import "LrFileUtils"
local LrLogger = import "LrLogger"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local PluginBootstrap = {}

local function homePath()
  if os.getenv ~= nil then
    local envHome = os.getenv("HOME")
    if envHome ~= nil and envHome ~= "" then
      return envHome
    end
  end

  local ok, path = pcall(function()
    return LrPathUtils.getStandardFilePath("home")
  end)
  if ok and path ~= nil and path ~= "" then
    return path
  end

  return "/tmp"
end

local function appendDebug(message)
  local path = homePath() .. "/Documents/LrClassicLogs"
  pcall(function()
    LrFileUtils.createAllDirectories(path)
  end)
  path = path .. "/LightroomClassicMCPServer.log"
  local file = io.open(path, "a")
  if file ~= nil then
    file:write(os.date("%Y-%m-%d %H:%M:%S"), "\t", tostring(message), "\n")
    file:close()
  end
end

local function createLogger()
  local logger = LrLogger("lightroom-classic-mcp-server")
  logger:enable("logfile")
  return logger
end

function PluginBootstrap.ensureStarted(source)
  local existing = _G.LightroomClassicMcpServer
  if existing ~= nil and existing.started == true then
    pcall(appendDebug, "Bridge already started; source=" .. tostring(source))
    return existing
  end

  local logger = createLogger()
  pcall(appendDebug, "Starting bridge; source=" .. tostring(source))

  local ok, err = LrTasks.pcall(function()
    local BridgeClient = require "BridgeClient"

    _G.LightroomClassicMcpServer = {
      logger = logger,
      source = source,
      started = true,
      stop = BridgeClient.start(logger)
    }

    logger:info("Lightroom Classic MCP bridge plugin initialized from " .. tostring(source))
    pcall(appendDebug, "Lightroom Classic MCP bridge plugin initialized from " .. tostring(source))
  end)

  if not ok then
    logger:error("Lightroom Classic MCP bridge plugin init failed: " .. tostring(err))
    pcall(appendDebug, "Lightroom Classic MCP bridge plugin init failed: " .. tostring(err))
  end

  return _G.LightroomClassicMcpServer
end

return PluginBootstrap
