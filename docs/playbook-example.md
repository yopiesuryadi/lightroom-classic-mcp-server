# Example agent playbook — smart photo editing

Copy this into your agent's workspace (e.g. `~/.openclaw/workspace/LIGHTROOM-EDITING.md`) and adapt the taste section. It teaches an AI agent to edit photos through the Lightroom Classic MCP server: original pixels untouched, only non-destructive develop settings.

---

## Hard rules

- **Non-generative only.** Never use image generation for this lane. The deliverable is the user's original photo with Lightroom develop settings applied.
- Lightroom Classic must be open on the host machine. If a job stays `queued` for more than ~60 seconds, tell the user instead of retrying blindly.
- One editing session at a time (the server is single-process).

## Working loop (perceive → decide → act → verify)

1. `start_import` with the photo path (`collection` = a dated slug) → poll `job_status`.
2. `get_preview` → `job_result` → look at the image. Analyze: light direction and quality, subject and its condition, exposure, color cast, what mood fits.
3. Choose a look (see library below) and state it before editing.
4. Global edit: `start_edit_tracking` with `operation: apply_develop_settings`. UI scale: `exposure` in stops (±5); contrast/highlights/shadows/whites/blacks/vibrance/saturation/clarity in -100..100; `temperature`/`tint` relative for non-raw; `grain_amount` 0-100.
5. Per-area edit: `start_adaptive_edit` with `MaskGroupBasedCorrections` (full schema in the tool description). Hard rules:
   - XMP scale: `LocalExposure2012` ±1.0 equals ±4 stops (so +0.1 ≈ +0.4 stop). Out-of-range values are **silently dropped** by Lightroom — keep values small.
   - `MaskSubType`: 1 = Subject, 2 = Sky. Background = subject mask with `MaskInverted: true`.
   - A new adaptive edit **replaces all** previous mask corrections — always resend every correction you want to keep.
   - `CorrectionSyncID` / `MaskSyncID` = random 32-char uppercase hex.
6. `get_preview` again → critique your own result → correct. At most 3 iterations. Stop when it is good, not perfect.
7. `start_export` to the configured output folder → deliver the file to the user.
8. Report briefly: the look used + 2-3 key decisions. No slider dumps.

## Taste (CUSTOMIZE THIS)

- Restrained and natural. An edit that does not feel edited. No HDR look, no oversaturation, no Instagram-filter feel.
- Respect the original photo: correct first so it is right, then add character so it is alive.
- When unsure between two intensities, choose the subtler one.

## Look library — famous Leica photographer tones (interpretations, not official presets)

| Look | Recipe direction | Fits |
|---|---|---|
| Cartier-Bresson | B&W (`ConvertToGrayscale`), medium contrast, rich grays, no drama | street, moments, geometry |
| Salgado | high-contrast B&W, deep blacks, silvery highlights, raised clarity+texture | documentary, hard light, landscape |
| Koudelka | gritty B&W, heavy grain, harsh contrast | heavy mood, emotional |
| Ralph Gibson | extreme graphic B&W, crushed blacks, bright whites, suppressed midtones | abstract, shapes, detail |
| Alex Webb | saturated color (vibrance over saturation), deep shadows, lowered blacks, dramatized sky via mask | color street, layered hard light |
| Eggleston | dye-transfer color, prominent reds, bold saturation with gentle tonality | vernacular, daily life |
| Erwitt | soft B&W, low-medium contrast | candid, family, humor |
| Overgaard (color default) | subtle micro-contrast, muted but deep color (saturation slightly down, vibrance slightly up), held highlights, soft glow | everyday color |

Pick the look that fits the photo — never force one. If the user names a look, follow it; otherwise choose and give a one-sentence reason.
