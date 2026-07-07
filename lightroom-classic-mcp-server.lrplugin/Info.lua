return {
  LrSdkVersion = 8.0,
  LrSdkMinimumVersion = 8.0,
  LrToolkitIdentifier = "com.yopiesuryadi.lightroomclassicmcpserver",
  LrPluginName = "Lightroom Classic MCP Server Bridge",
  LrPluginInfoUrl = "https://github.com/yopiesuryadi/lightroom-classic-mcp-server",
  VERSION = {
    major = 0,
    minor = 1,
    revision = 0,
    build = 3
  },
  LrPluginInfoProvider = "PluginInfoProvider.lua",
  LrMetadataProvider = "MetadataProvider.lua",
  LrInitPlugin = "PluginInit.lua",
  LrForceInitPlugin = true,
  LrShutdownPlugin = "PluginShutdown.lua",
  LrShutdownApp = "PluginShutdown.lua",
  LrLibraryMenuItems = {
    {
      title = "Lightroom Classic MCP Server Bridge - Show Status",
      file = "MenuShowStatus.lua",
    },
  }
}
