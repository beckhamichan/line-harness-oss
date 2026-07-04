// =============================================================================
// Tap Image — single hero image with multiple tappable link areas.
//
// Built as a Flex bubble (image + absolutely-positioned transparent overlay
// boxes, each carrying a uri action) instead of an imagemap message. LINE's
// imagemap message requires baseUrl to serve the image at 5 fixed widths
// (240/300/460/700/1040px), which needs a dedicated resize pipeline. This
// approach reuses the existing flex delivery path (DB message_type='flex',
// buildMessage()) with no schema or delivery changes. See Issue #33.
// =============================================================================

import { flexBubble, flexBox, flexImage, flexText } from './messages.js';
import type { FlexBubble, FlexBox, FlexComponent } from './messages.js';

export interface TapImageArea {
  /** Left edge of the tap area, as a percentage (0-100) of the image width. */
  xPercent: number;
  /** Top edge of the tap area, as a percentage (0-100) of the image height. */
  yPercent: number;
  /** Width of the tap area, as a percentage (0-100) of the image width. */
  widthPercent: number;
  /** Height of the tap area, as a percentage (0-100) of the image height. */
  heightPercent: number;
  /** URL opened when this area is tapped. */
  uri: string;
  /** Accessibility label for the tap action (not shown visually). Defaults to the uri. */
  label?: string;
}

export interface TapImageOptions {
  imageUrl: string;
  /** LINE Flex image aspectRatio, e.g. '1:1', '4:3', '20:13'. Defaults to '1:1'. */
  aspectRatio?: string;
  areas: TapImageArea[];
  /**
   * Alt text shown in push notifications and on clients that can't render
   * Flex messages. scenario_steps / broadcasts only store the FlexBubble
   * ("contents"), not a top-level altText field, so this is embedded as a
   * text node positioned far outside the bubble's visible frame. LINE's
   * Flex bubble clips content to its outer card bounds, so this text never
   * becomes visible on screen. apps/worker's extractFlexAltText() walks the
   * bubble tree and picks up the first text node it finds, so this is
   * delivered without any schema change.
   *
   * This intentionally avoids relying on an 8-digit alpha hex color
   * (e.g. '#FFFFFF00') to "hide" the text: LINE's documented Flex text
   * `color` format is 6-digit `#RRGGBB` (alpha is only documented for
   * `box.backgroundColor`), so a transparent-color approach is not a
   * spec-guaranteed way to hide text and risks either a visible artifact or
   * a rejected message. Pushing the node off-canvas does not depend on
   * color/alpha support at all.
   */
  altText?: string;
}

function toPercent(value: number): string {
  return `${value}%`;
}

/**
 * Builds a Flex bubble representing a single image with tappable overlay
 * regions, each linking to a different URL. Percent-based offsets/sizes are
 * used (not px) so tap areas stay aligned across different device widths.
 *
 * The returned value is the FlexBubble ("contents"), matching what
 * scenario_steps.message_content / broadcasts.message_content store for
 * message_type = 'flex' (see buildMessage() in apps/worker).
 */
export function tapImageMessage(opts: TapImageOptions): FlexBubble {
  const image = flexImage(opts.imageUrl, {
    size: 'full',
    aspectMode: 'cover',
    aspectRatio: opts.aspectRatio ?? '1:1',
  });

  const overlays: FlexBox[] = opts.areas.map((area) =>
    flexBox('vertical', [{ type: 'spacer', size: 'xs' }], {
      position: 'absolute',
      offsetStart: toPercent(area.xPercent),
      offsetTop: toPercent(area.yPercent),
      width: toPercent(area.widthPercent),
      height: toPercent(area.heightPercent),
      action: { type: 'uri', label: (area.label ?? area.uri).slice(0, 40), uri: area.uri },
    }),
  );

  const bodyContents: FlexComponent[] = [image, ...overlays];
  if (opts.altText) {
    bodyContents.push(
      flexBox('vertical', [flexText(opts.altText, { size: 'xxs', wrap: false })], {
        position: 'absolute',
        // Pushed far above the bubble's visible frame so it's clipped by
        // the card's own bounds, regardless of text/box sizing behavior.
        offsetTop: '-9999px',
        offsetStart: '0px',
        width: '1px',
        height: '1px',
      }),
    );
  }

  return flexBubble({
    body: flexBox('vertical', bodyContents, { paddingAll: '0px' }),
  });
}
