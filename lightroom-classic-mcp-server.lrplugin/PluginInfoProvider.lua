local LrView = import "LrView"

local PluginInfoProvider = {}

function PluginInfoProvider.sectionsForTopOfDialog(_, propertyTable)
  local f = LrView.osFactory()
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
