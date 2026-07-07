local PluginBootstrap = require "PluginBootstrap"

PluginBootstrap.ensureStarted("MetadataProvider")

return {
  schemaVersion = 1,
  metadataFieldsForPhotos = {
    {
      id = "bridgeStatus",
      title = "Bridge Status",
      dataType = "string",
      searchable = false,
      browsable = false,
    },
  },
}
