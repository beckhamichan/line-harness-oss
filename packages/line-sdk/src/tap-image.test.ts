import { describe, it, expect } from 'vitest';
import { tapImageMessage } from './tap-image.js';
import type { FlexBox, FlexImage, FlexText } from './messages.js';

describe('tapImageMessage', () => {
  it('renders a bubble with the image and no overlays when areas is empty', () => {
    const bubble = tapImageMessage({ imageUrl: 'https://example.com/banner.png', areas: [] });

    expect(bubble.type).toBe('bubble');
    const body = bubble.body!;
    expect(body.contents).toHaveLength(1);

    const image = body.contents[0] as FlexImage;
    expect(image.type).toBe('image');
    expect(image.url).toBe('https://example.com/banner.png');
    expect(image.aspectRatio).toBe('1:1');
    expect(image.aspectMode).toBe('cover');
    expect(image.size).toBe('full');
  });

  it('defaults aspectRatio to 1:1 and allows overriding it', () => {
    const custom = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      aspectRatio: '20:13',
      areas: [],
    });
    const image = custom.body!.contents[0] as FlexImage;
    expect(image.aspectRatio).toBe('20:13');
  });

  it('adds one absolutely-positioned overlay box per tap area, in order, after the image', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [
        { xPercent: 0, yPercent: 0, widthPercent: 100, heightPercent: 20, uri: 'https://example.com/top' },
        { xPercent: 10, yPercent: 40, widthPercent: 80, heightPercent: 15, uri: 'https://example.com/session' },
        { xPercent: 10, yPercent: 80, widthPercent: 80, heightPercent: 15, uri: 'https://example.com/detail' },
      ],
    });

    const contents = bubble.body!.contents;
    expect(contents).toHaveLength(4); // image + 3 overlays

    const overlays = contents.slice(1) as FlexBox[];
    expect(overlays.map((o) => (o.action as { uri: string }).uri)).toEqual([
      'https://example.com/top',
      'https://example.com/session',
      'https://example.com/detail',
    ]);
  });

  it('expresses tap area position/size as percent strings, not raw numbers', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [{ xPercent: 12.5, yPercent: 40, widthPercent: 75, heightPercent: 8, uri: 'https://example.com/a' }],
    });

    const overlay = bubble.body!.contents[1] as FlexBox;
    expect(overlay.type).toBe('box');
    expect(overlay.position).toBe('absolute');
    expect(overlay.offsetStart).toBe('12.5%');
    expect(overlay.offsetTop).toBe('40%');
    expect(overlay.width).toBe('75%');
    expect(overlay.height).toBe('8%');
  });

  it('attaches a uri action to each overlay box with the area uri', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [{ xPercent: 0, yPercent: 0, widthPercent: 50, heightPercent: 10, uri: 'https://example.com/link' }],
    });

    const overlay = bubble.body!.contents[1] as FlexBox;
    expect(overlay.action).toEqual({ type: 'uri', label: 'https://example.com/link', uri: 'https://example.com/link' });
  });

  it('uses a custom label when provided, truncated to 40 chars', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [{
        xPercent: 0,
        yPercent: 0,
        widthPercent: 50,
        heightPercent: 10,
        uri: 'https://example.com/link',
        label: 'a'.repeat(60),
      }],
    });

    const overlay = bubble.body!.contents[1] as FlexBox;
    expect((overlay.action as { label: string }).label).toHaveLength(40);
  });

  it('omits the alt text node entirely when altText is not provided', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [{ xPercent: 0, yPercent: 0, widthPercent: 50, heightPercent: 10, uri: 'https://example.com/a' }],
    });
    expect(bubble.body!.contents).toHaveLength(2); // image + 1 overlay, no altText node
  });

  it('embeds altText as a trailing text node pushed off-canvas (not relying on alpha color) so extractFlexAltText() can find it', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [{ xPercent: 0, yPercent: 0, widthPercent: 50, heightPercent: 10, uri: 'https://example.com/a' }],
      altText: 'ナースまつり2026にbe Navigatorが参加します',
    });

    const contents = bubble.body!.contents;
    expect(contents).toHaveLength(3); // image + 1 overlay + altText node

    const altTextBox = contents[2] as FlexBox;
    expect(altTextBox.type).toBe('box');
    expect(altTextBox.position).toBe('absolute');
    // Pushed far above the bubble's visible frame — clipped by the card's
    // own bounds regardless of text/box sizing. Not an alpha-color hack:
    // LINE's Flex text `color` spec is 6-digit #RRGGBB only.
    expect(altTextBox.offsetTop).toBe('-9999px');
    expect(altTextBox.width).toBe('1px');
    expect(altTextBox.height).toBe('1px');

    const textNode = altTextBox.contents[0] as FlexText;
    expect(textNode.type).toBe('text');
    expect(textNode.text).toBe('ナースまつり2026にbe Navigatorが参加します');
    expect(textNode.color).toBeUndefined();
  });

  it('produces JSON-serializable output matching the shape stored in message_content', () => {
    const bubble = tapImageMessage({
      imageUrl: 'https://example.com/banner.png',
      areas: [{ xPercent: 10, yPercent: 10, widthPercent: 30, heightPercent: 10, uri: 'https://example.com/x' }],
    });

    const roundTripped = JSON.parse(JSON.stringify(bubble));
    expect(roundTripped).toEqual(bubble);
    expect(roundTripped.type).toBe('bubble');
  });
});
