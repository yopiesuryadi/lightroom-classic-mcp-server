local LrApplication = import "LrApplication"
local LrDialogs = import "LrDialogs"
local LrHttp = import "LrHttp"
local LrTasks = import "LrTasks"

local BridgeClient = {}

local bridgeHost = "127.0.0.1"
local bridgePort = "58765"
local running = true

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

local function updateJob(jobId, payload)
  post("/plugin/jobs/" .. jobId, payload)
end

local function runImport(job, logger)
  updateJob(job.id, {
    status = "running",
    progress = { message = "Starting Lightroom import" }
  })

  -- TODO: complete catalog import semantics:
  -- 1. Resolve job.request.paths to existing files/folders.
  -- 2. Use Lightroom SDK catalog APIs for import/add-to-catalog.
  -- 3. Add imported photos to job.request.collection when provided.
  -- 4. Send periodic progress updates so MCP clients can poll status.
  -- 5. Return imported photo ids/count in result.
  --
  -- This placeholder intentionally reports a clear failure instead of silently
  -- pretending that import work happened.
  logger:error("Import job received but Lua import implementation is not complete: " .. job.id)
  updateJob(job.id, {
    status = "failed",
    error = "Lightroom Lua import implementation is not complete yet."
  })
end

local function runExport(job, logger)
  updateJob(job.id, {
    status = "running",
    progress = { message = "Starting Lightroom export" }
  })

  -- TODO: wire export settings/presets to catalog:exportPhotos or rendition APIs.
  -- Default Node output_dir is ~/Documents/leica.
  logger:error("Export job received but Lua export implementation is not complete: " .. job.id)
  updateJob(job.id, {
    status = "failed",
    error = "Lightroom Lua export implementation is not complete yet."
  })
end

local function runEdit(job, logger)
  updateJob(job.id, {
    status = "running",
    progress = { message = "Starting Lightroom edit operation" }
  })

  -- TODO: implement operation dispatch for metadata and develop adjustments.
  logger:error("Edit job received but Lua edit implementation is not complete: " .. job.id)
  updateJob(job.id, {
    status = "failed",
    error = "Lightroom Lua edit implementation is not complete yet."
  })
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
    })
  end
end

function BridgeClient.start(logger)
  running = true

  LrTasks.startAsyncTask(function()
    logger:info("Starting poll loop for Lightroom Classic MCP bridge")

    while running do
      local ok, response = pcall(function()
        return post("/plugin/claim-next", {})
      end)

      if ok and response ~= nil and response.job ~= nil then
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
            })
          end
        end)
      elseif not ok then
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
