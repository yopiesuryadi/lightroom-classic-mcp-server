local PluginBootstrap = require "PluginBootstrap"

local PluginInfoProvider = {}

PluginBootstrap.ensureStarted("PluginInfoProvider")

function PluginInfoProvider.sectionsForTopOfDialog(f, propertyTable)
  return {
    {
      title = "Lightroom Classic MCP Server Bridge",
      f:row {
        f:static_text {
          title = "Bridge plugin is installed and starts automatically with Lightroom Classic.",
          fill_horizontal = 1,
        },
      },
    },
  }
end

return PluginInfoProvider
