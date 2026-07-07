local LrApplication = import "LrApplication"
local LrExportSession = import "LrExportSession"
local LrFileUtils = import "LrFileUtils"
local LrFunctionContext = import "LrFunctionContext"
local LrHttp = import "LrHttp"
local LrPathUtils = import "LrPathUtils"
local LrTasks = import "LrTasks"

local BridgeClient = {}

local bridgeHost = "127.0.0.1"
local bridgePort = "58765"
local running = true
local lastImportedPhotos = {}

local function appendDebug(message)
  local path = (os.getenv("HOME") or "/tmp") .. "/Library/Logs/Adobe/Lightroom/LrClassicLogs/LightroomClassicMCPServer.log"
  local file = io.open(path, "a")
  if file ~= nil then
    file:write(os.date("%Y-%m-%d %H:%M:%S"), "\t", tostring(message), "\n")
    file:close()
  end
end

local allowedDevelopSettings = {
  Blacks2012 = true,
  Clarity2012 = true,
  Contrast2012 = true,
  CropAngle = true,
  CropBottom = true,
  CropLeft = true,
  CropRight = true,
  CropTop = true,
  Dehaze = true,
  Exposure2012 = true,
  GrainAmount = true,
  Highlights2012 = true,
  Saturation = true,
  Shadows2012 = true,
  Temperature = true,
  Texture = true,
  Tint = true,
  Vibrance = true,
  Whites2012 = true,
}

local settingAliases = {
  blacks = "Blacks2012",
  clarity = "Clarity2012",
  contrast = "Contrast2012",
  crop_angle = "CropAngle",
  crop_bottom = "CropBottom",
  crop_left = "CropLeft",
  crop_right = "CropRight",
  crop_top = "CropTop",
  dehaze = "Dehaze",
  exposure = "Exposure2012",
  grain = "GrainAmount",
  grain_amount = "GrainAmount",
  highlights = "Highlights2012",
  saturation = "Saturation",
  shadows = "Shadows2012",
  temperature = "Temperature",
  texture = "Texture",
  tint = "Tint",
  vibrance = "Vibrance",
  whites = "Whites2012",
}

local function jsonEncode(value)
  if type(value) == "table" and import("LrJson") ~= nil then
    return import("LrJson").encode(value)
  end
  return "{}"
end

local function jsonDecode(value)
  if value == nil or value == "" then
    return nil
  end
  if import("LrJson") ~= nil then
    return import("LrJson").decode(value)
  end
  return nil
end

local function post(path, payload)
  local body = jsonEncode(payload or {})
  local response, headers = LrHttp.post(
    "http://" .. bridgeHost .. ":" .. bridgePort .. path,
    body,
    {
      { field = "Content-Type", value = "application/json" }
    }
  )
  return jsonDecode(response), headers
end

local function updateJob(jobId, payload, logger)
  if logger ~= nil and payload ~= nil and payload.status ~= nil then
    logger:info("Reporting MCP job status " .. jobId .. ": " .. tostring(payload.status))
  end
  post("/plugin/jobs/" .. jobId, payload)
end

local function failJob(jobId, message, logger)
  if logger ~= nil then
    logger:error("MCP job " .. tostring(jobId) .. " failed: " .. message)
  end
  updateJob(jobId, {
    status = "failed",
    error = message
  }, logger)
end

local function expandHome(path)
  if path == nil then
    return nil
  end
  if path == "~" then
    return os.getenv("HOME")
  end
  if string.sub(path, 1, 2) == "~/" then
    return LrPathUtils.child(os.getenv("HOME"), string.sub(path, 3))
  end
  return path
end

local function appendValue(values, value)
  values[#values + 1] = value
end

local function appendPhotosFromPath(paths, path)
  local expanded = expandHome(path)
  local exists = LrFileUtils.exists(expanded)

  if exists == "file" then
    appendValue(paths, expanded)
  elseif exists == "directory" then
    for filePath in LrFileUtils.files(expanded) do
      appendValue(paths, filePath)
    end
  else
    error("Import path does not exist: " .. tostring(path))
  end
end

local function collectImportPaths(request)
  local paths = {}
  if type(request.paths) ~= "table" then
    error("Import request must include a paths array.")
  end

  for _, path in ipairs(request.paths) do
    appendPhotosFromPath(paths, path)
  end

  if #paths == 0 then
    error("No files were found to import.")
  end
  return paths
end

local function collectPhotoSummary(photos)
  local result = {}
  for _, photo in ipairs(photos) do
    appendValue(result, {
      local_id = photo.localIdentifier,
      path = photo:getRawMetadata("path"),
      file_name = photo:getFormattedMetadata("fileName")
    })
  end
  return result
end

local function findTopLevelCollection(catalog, name)
  local collections = catalog:getChildCollections()
  for _, collection in ipairs(collections) do
    if collection:getName() == name then
      return collection
    end
  end
  return nil
end

local function getOrCreateCollection(catalog, name)
  if name == nil or name == "" then
    return nil
  end
  local existing = findTopLevelCollection(catalog, name)
  if existing ~= nil then
    return existing
  end
  return catalog:createCollection(name, nil, true)
end

local function photosFromCollection(catalog, name)
  local collection = findTopLevelCollection(catalog, name)
  if collection == nil then
    error("Collection not found: " .. tostring(name))
  end
  return collection:getPhotos()
end

local function targetPhotos(request)
  local catalog = LrApplication.activeCatalog()
  local target = request.target

  if request.collection ~= nil and request.collection ~= "" then
    return photosFromCollection(catalog, request.collection), "collection:" .. request.collection
  end

  if target == "last_import" or target == "last_imported" or request.last_imported == true then
    if #lastImportedPhotos == 0 then
      error("No photos have been imported by this plugin session yet.")
    end
    return lastImportedPhotos, "last_import"
  end

  if target == "selection" or target == "selected" or request.selected_only == true then
    local selected = catalog:getTargetPhotos()
    if selected == nil or #selected == 0 then
      error("No Lightroom photos are currently selected.")
    end
    return selected, "selection"
  end

  if #lastImportedPhotos > 0 then
    return lastImportedPhotos, "last_import"
  end

  local selected = catalog:getTargetPhotos()
  if selected ~= nil and #selected > 0 then
    return selected, "selection"
  end

  error("No export/edit target was supplied. Use selected_only, collection, or import a photo first.")
end

local function normalizeDevelopSettings(parameters)
  local source = parameters
  if type(parameters) ~= "table" then
    source = {}
  end
  if type(parameters) == "table" and type(parameters.settings) == "table" then
    source = parameters.settings
  elseif type(parameters) == "table" and type(parameters.develop_settings) == "table" then
    source = parameters.develop_settings
  end

  local settings = {}
  local applied = {}

  for key, value in pairs(source or {}) do
    local lrKey = settingAliases[key] or key
    if allowedDevelopSettings[lrKey] then
      if type(value) ~= "number" then
        error("Develop setting " .. tostring(key) .. " must be a number.")
      end
      settings[lrKey] = value
      appendValue(applied, lrKey)
    end
  end

  if type(source.white_balance) == "table" then
    for key, value in pairs(source.white_balance) do
      local lrKey = settingAliases[key] or key
      if lrKey == "Temperature" or lrKey == "Tint" then
        if type(value) ~= "number" then
          error("White balance setting " .. tostring(key) .. " must be a number.")
        end
        settings[lrKey] = value
        appendValue(applied, lrKey)
      end
    end
  end

  if type(source.crop) == "table" then
    local cropAliases = {
      angle = "CropAngle",
      bottom = "CropBottom",
      left = "CropLeft",
      right = "CropRight",
      top = "CropTop"
    }

    for key, value in pairs(source.crop) do
      local lrKey = cropAliases[key] or settingAliases[key] or key
      if allowedDevelopSettings[lrKey] then
        if type(value) ~= "number" then
          error("Crop setting " .. tostring(key) .. " must be a number.")
        end
        settings[lrKey] = value
        appendValue(applied, lrKey)
      end
    end
  end

  if #applied == 0 then
    error("No supported develop settings were supplied.")
  end

  return settings, applied
end

local function requestDevelopParameters(request)
  if type(request) ~= "table" then
    return nil
  end
  if type(request.parameters) == "table" then
    return request.parameters
  end
  if type(request.develop_settings) == "table" then
    return request.develop_settings
  end
  if type(request.settings) == "table" then
    return request.settings
  end
  return nil
end

local function defaultExportSettings(outputDir)
  return {
    LR_collisionHandling = "rename",
    LR_export_colorSpace = "sRGB",
    LR_export_destinationPathPrefix = outputDir,
    LR_export_destinationType = "specificFolder",
    LR_export_useSubfolder = false,
    LR_format = "JPEG",
    LR_jpeg_quality = 0.92,
    LR_minimizeEmbeddedMetadata = false,
    LR_outputSharpeningOn = false,
    LR_removeLocationMetadata = false,
    LR_size_doConstrain = false,
  }
end

local function runImport(job, logger)
  updateJob(job.id, {
    status = "running",
    progress = { message = "Starting Lightroom import" }
  }, logger)
  logger:info("Starting import job " .. job.id)

  local ok, result = pcall(function()
    local catalog = LrApplication.activeCatalog()
    local paths = collectImportPaths(job.request)
    local imported = {}
    local appliedSettings = {}
    local reused = 0

    catalog:withWriteAccessDo("Lightroom MCP import", function()
      local collection = getOrCreateCollection(catalog, job.request.collection)

      for index, path in ipairs(paths) do
        updateJob(job.id, {
          status = "running",
          progress = {
            current = index,
            total = #paths,
            message = "Importing " .. LrPathUtils.leafName(path)
          }
        }, logger)

        local photo = catalog:findPhotoByPath(path)
        if photo == nil then
          photo = catalog:addPhoto(path)
        else
          reused = reused + 1
        end

        appendValue(imported, photo)
      end

      if collection ~= nil and #imported > 0 then
        collection:addPhotos(imported)
      end

      if #imported > 0 then
        local additional = {}
        for index = 2, #imported do
          appendValue(additional, imported[index])
        end
        catalog:setSelectedPhotos(imported[1], additional)
      end
    end, { timeout = 30 })

    local developParameters = requestDevelopParameters(job.request)
    if developParameters ~= nil then
      local settings
      settings, appliedSettings = normalizeDevelopSettings(developParameters)
      catalog:withWriteAccessDo("Lightroom MCP import develop settings", function()
        local preset = LrApplication.addDevelopPresetForPlugin(_PLUGIN, "Lightroom MCP Import Settings", settings)

        for index, photo in ipairs(imported) do
          updateJob(job.id, {
            status = "running",
            progress = {
              current = index,
              total = #imported,
              message = "Applying develop settings to imported photo"
            }
          }, logger)
          if photo.applyDevelopPresetFromPlugin ~= nil then
            photo:applyDevelopPresetFromPlugin(preset, _PLUGIN)
          else
            photo:applyDevelopPreset(preset, _PLUGIN)
          end
        end
      end, { timeout = 30 })
    end

    lastImportedPhotos = imported

    return {
      imported_count = #imported,
      reused_existing_count = reused,
      collection = job.request.collection,
      settings = appliedSettings,
      photos = collectPhotoSummary(imported)
    }
  end)

  if not ok then
    failJob(job.id, "Lightroom import failed: " .. tostring(result), logger)
    return
  end

  updateJob(job.id, {
    status = "succeeded",
    result = result,
    progress = {
      current = result.imported_count,
      total = result.imported_count,
      message = "Import completed"
    }
  }, logger)
end

local function runExport(job, logger)
  updateJob(job.id, {
    status = "running",
    progress = { message = "Starting Lightroom export" }
  }, logger)
  logger:info("Starting export job " .. job.id)

  local ok, result = pcall(function()
    local outputDir = expandHome(job.request.output_dir or "~/Documents/leica")
    LrFileUtils.createAllDirectories(outputDir)

    local photos, source = targetPhotos(job.request)
    if #photos == 0 then
      error("Export target resolved to zero photos.")
    end

    local exportSettings = defaultExportSettings(outputDir)
    if type(job.request.export_settings) == "table" then
      for key, value in pairs(job.request.export_settings) do
        exportSettings[key] = value
      end
    end

    local session = LrExportSession({
      photosToExport = photos,
      exportSettings = exportSettings
    })

    local exported = {}
    local failures = {}
    local total = session:countRenditions()

    for index, rendition in session:renditions() do
      updateJob(job.id, {
        status = "running",
        progress = {
          current = index,
          total = total,
          message = "Exporting photo " .. tostring(index) .. " of " .. tostring(total)
        }
      }, logger)

      local success, pathOrMessage = rendition:waitForRender()
      if success then
        appendValue(exported, pathOrMessage)
      else
        appendValue(failures, pathOrMessage)
      end
    end

    if #failures > 0 then
      error("One or more exports failed: " .. table.concat(failures, "; "))
    end

    return {
      exported_count = #exported,
      output_dir = outputDir,
      source = source,
      files = exported
    }
  end)

  if not ok then
    failJob(job.id, "Lightroom export failed: " .. tostring(result), logger)
    return
  end

  updateJob(job.id, {
    status = "succeeded",
    result = result,
    progress = {
      current = result.exported_count,
      total = result.exported_count,
      message = "Export completed"
    }
  }, logger)
end

local function runEdit(job, logger)
  updateJob(job.id, {
    status = "running",
    progress = { message = "Starting Lightroom edit operation" }
  }, logger)
  logger:info("Starting develop/edit job " .. job.id .. " operation=" .. tostring(job.request.operation))

  local ok, result = pcall(function()
    local operation = job.request.operation
    if operation ~= "apply_develop_settings" and operation ~= "apply_settings" and operation ~= "develop_settings" and operation ~= "develop" then
      error("Unsupported edit operation: " .. tostring(operation) .. ". Supported operation: apply_develop_settings.")
    end

    local catalog = LrApplication.activeCatalog()
    local photos, source = targetPhotos(job.request)
    local parameters = requestDevelopParameters(job.request) or {}
    local settings, applied = normalizeDevelopSettings(parameters)
    local presetName = parameters.preset_name or "Lightroom MCP Settings"

    catalog:withWriteAccessDo("Lightroom MCP develop settings", function()
      local preset = LrApplication.addDevelopPresetForPlugin(_PLUGIN, presetName, settings)

      for index, photo in ipairs(photos) do
        updateJob(job.id, {
          status = "running",
          progress = {
            current = index,
            total = #photos,
            message = "Applying develop settings"
          }
        }, logger)
        if photo.applyDevelopPresetFromPlugin ~= nil then
          photo:applyDevelopPresetFromPlugin(preset, _PLUGIN)
        else
          photo:applyDevelopPreset(preset, _PLUGIN)
        end
      end
    end, { timeout = 30 })

    return {
      edited_count = #photos,
      source = source,
      settings = applied
    }
  end)

  if not ok then
    failJob(job.id, "Lightroom edit failed: " .. tostring(result), logger)
    return
  end

  updateJob(job.id, {
    status = "succeeded",
    result = result,
    progress = {
      current = result.edited_count,
      total = result.edited_count,
      message = "Develop settings applied"
    }
  }, logger)
end

local function runJob(job, logger)
  if job.kind == "import" then
    runImport(job, logger)
  elseif job.kind == "export" then
    runExport(job, logger)
  elseif job.kind == "edit" then
    runEdit(job, logger)
  else
    updateJob(job.id, {
      status = "failed",
      error = "Unsupported job kind: " .. tostring(job.kind)
    }, logger)
  end
end

function BridgeClient.start(logger)
  running = true

  LrFunctionContext.postAsyncTaskWithContext("LightroomClassicMcpServerPollLoop", function()
    appendDebug("Starting poll loop")
    logger:info("Starting poll loop for Lightroom Classic MCP bridge")

    while running do
      local ok, response = pcall(function()
        return post("/plugin/claim-next", {})
      end)

      if ok and response ~= nil and response.job ~= nil then
        appendDebug("Claimed MCP job " .. response.job.id .. " (" .. response.job.kind .. ")")
        logger:info("Claimed MCP job " .. response.job.id .. " (" .. response.job.kind .. ")")
        LrTasks.startAsyncTask(function()
          local success, err = pcall(function()
            runJob(response.job, logger)
          end)
          if not success then
            logger:error("Job failed with Lua exception: " .. tostring(err))
            updateJob(response.job.id, {
              status = "failed",
              error = tostring(err)
            }, logger)
          end
        end)
      elseif not ok then
        appendDebug("Bridge poll failed: " .. tostring(response))
        logger:trace("Bridge poll failed: " .. tostring(response))
      end

      LrTasks.sleep(2)
    end
  end)

  return function()
    running = false
  end
end

return BridgeClient
