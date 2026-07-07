return {
  LrSdkVersion = 8.0,
  LrSdkMinimumVersion = 8.0,
  LrToolkitIdentifier = "com.yopiesuryadi.lightroom-classic-mcp-server",
  LrPluginName = "Lightroom Classic MCP Server Bridge",
  LrInitPlugin = "PluginInit.lua",
  LrForceInitPlugin = true,
  LrShutdownPlugin = "PluginShutdown.lua",
  LrLibraryMenuItems = {
    {
      title = "Lightroom Classic MCP Server Bridge",
      file = "MenuShowStatus.lua",
    },
  },
  LrExportMenuItems = {
    {
      title = "Lightroom Classic MCP Server Bridge",
      file = "MenuShowStatus.lua",
    },
  },
  VERSION = {
    major = 0,
    minor = 1,
    revision = 0,
    build = 2
  }
}
