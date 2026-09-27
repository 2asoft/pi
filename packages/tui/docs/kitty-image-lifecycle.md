# Fullscreen Kitty image lifecycle

The fullscreen renderer uses one stable image ID and one explicit placement ID per image. A cache entry records the last transmitted generation; it cannot guarantee that the terminal still has the pixels.

- Reuse pixels with placement commands when their transmission generation matches. Movement, source-crop changes, and viewport reentry update placement ID 1 without retransmitting pixels.
- Request placement errors with `q=1`. On `ENOENT` for a cached image, invalidate its generation and schedule a redraw. Coalesce duplicate errors before recovery. Unknown IDs and other errors do not trigger recovery.
- Retransmit only when an image is first displayed, its content generation changes, its local cache entry was evicted, or the terminal reports it missing. Keep the same image ID.
- Remove only placements that leave the viewport. Preserve the existing bounded offscreen pixel cache and cleanup. Ordinary image redraws do not delete all placements.

Text-only redraws do not initiate image transfers. Full redraws retain the existing screen reset behavior. Initial transmission uses the existing quiet upload mode; persistent upload failures do not create an automatic retry loop.

## Multiplexer boundary

A multiplexer owns the graphics cache between itself and its host terminal. Pi can recover errors from its immediate endpoint; the multiplexer must recover errors from its own endpoint.

Zellij 0.45.1 has crop-cache and host-cache defects that this renderer does not work around. Zellij upstream includes the source rectangle in scaled-image cache keys. The companion Zellij corrections retire placements when their host image changes and recover host `ENOENT` responses without asking Pi to retransmit.

## Verification

Run `node --test test/tui-alt-screen.test.ts` from `packages/tui`. Tests cover stable placement reuse, viewport reentry, crop changes without pixel uploads, targeted missing-image recovery, duplicate errors, and bounded offscreen cleanup.

Live verification used actual Pi with a local faux provider, patched Zellij based on fc400dfef, and Alacritty 8a6f6513 in headless Sway. Two PNG tool results were scrolled through 65 steps and recorded at 60 fps. The ordinary run contained no frames without the measured image color. Separate runs deleted pixels from Zellij's store and directly from Alacritty; both recovered on the next scroll redraw. Host deletion required no extra Pi upload. This measurement detects fully blank image content, not every possible visual artifact.
