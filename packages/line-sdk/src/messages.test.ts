import { describe, it, expect } from 'vitest';
import {
  buttonsTemplate,
  carouselTemplate,
  confirmTemplate,
  flexBox,
  flexBubble,
  flexButton,
  flexImage,
  flexMessage,
  flexText,
  imageMapMessage,
  imageMessage,
  productCard,
  quickReply,
  receiptMessage,
  textMessage,
  withQuickReply,
} from './messages.js';

describe('message builders', () => {
  it('builds text messages', () => {
    const message = textMessage('hello');

    expect(message).toEqual({ type: 'text', text: 'hello' });
  });

  it('builds image messages with original and preview URLs', () => {
    const message = imageMessage('https://example.com/original.png', 'https://example.com/preview.png');

    expect(message).toMatchObject({
      type: 'image',
      originalContentUrl: 'https://example.com/original.png',
      previewImageUrl: 'https://example.com/preview.png',
    });
  });

  it('builds flex messages with alt text and contents', () => {
    const contents = flexBubble({ body: flexBox('vertical', [flexText('body')]) });
    const message = flexMessage('alt text', contents);

    expect(message).toMatchObject({
      type: 'flex',
      altText: 'alt text',
      contents,
    });
  });

  it('builds buttons templates with primary fields', () => {
    const action = { type: 'uri' as const, label: 'Open', uri: 'https://example.com' };
    const message = buttonsTemplate({
      altText: 'choose',
      title: 'Title',
      text: 'Pick one',
      thumbnailImageUrl: 'https://example.com/thumb.png',
      actions: [action],
    });

    expect(message.type).toBe('template');
    expect(message.altText).toBe('choose');
    expect(message.template.type).toBe('buttons');
    expect(message.template.title).toBe('Title');
    expect(message.template.text).toBe('Pick one');
    expect(message.template.thumbnailImageUrl).toBe('https://example.com/thumb.png');
    expect(message.template.actions).toEqual([action]);
  });

  it('builds confirm templates with yes and no actions in order', () => {
    const yesAction = { type: 'message' as const, label: 'Yes', text: 'yes' };
    const noAction = { type: 'message' as const, label: 'No', text: 'no' };
    const message = confirmTemplate({
      altText: 'confirm',
      text: 'Continue?',
      yesAction,
      noAction,
    });

    expect(message.type).toBe('template');
    expect(message.altText).toBe('confirm');
    expect(message.template.type).toBe('confirm');
    expect(message.template.text).toBe('Continue?');
    expect(message.template.actions).toEqual([yesAction, noAction]);
  });

  it('builds carousel templates with columns', () => {
    const columns = [
      {
        title: 'First',
        text: 'Column text',
        actions: [{ type: 'postback' as const, label: 'Select', data: 'id=1' }],
      },
    ];
    const message = carouselTemplate('carousel', columns);

    expect(message.type).toBe('template');
    expect(message.altText).toBe('carousel');
    expect(message.template.type).toBe('carousel');
    expect(message.template.columns).toEqual(columns);
  });

  it('builds imagemap messages with base URL and actions', () => {
    const actions = [
      {
        type: 'uri' as const,
        linkUri: 'https://example.com',
        area: { x: 0, y: 0, width: 520, height: 1040 },
      },
    ];
    const message = imageMapMessage({
      baseUrl: 'https://example.com/imagemap',
      altText: 'image map',
      baseSize: { width: 1040, height: 1040 },
      actions,
    });

    expect(message.type).toBe('imagemap');
    expect(message.baseUrl).toBe('https://example.com/imagemap');
    expect(message.altText).toBe('image map');
    expect(message.baseSize).toEqual({ width: 1040, height: 1040 });
    expect(message.actions).toEqual(actions);
  });

  it('builds quick replies and attaches them to messages', () => {
    const item = {
      type: 'action' as const,
      imageUrl: 'https://example.com/icon.png',
      action: { type: 'message' as const, label: 'Reply', text: 'reply' },
    };
    const reply = quickReply([item]);
    const message = withQuickReply(textMessage('question'), reply);

    expect(reply).toEqual({ items: [item] });
    expect(message.type).toBe('text');
    expect(message.quickReply).toBe(reply);
  });

  it('builds product cards with hero, body, and footer structures', () => {
    const card = productCard({
      imageUrl: 'https://example.com/product.png',
      name: 'Product',
      price: '¥1,000',
      description: 'Description',
      actionUrl: 'https://example.com/product',
    });

    expect(card.type).toBe('bubble');
    expect(card.hero).toMatchObject({
      type: 'image',
      url: 'https://example.com/product.png',
      aspectRatio: '20:13',
      aspectMode: 'cover',
      size: 'full',
    });
    expect(card.body?.type).toBe('box');
    expect(card.body?.layout).toBe('vertical');
    expect(card.footer?.contents[0]).toMatchObject({
      type: 'button',
      style: 'primary',
      action: { type: 'uri', label: '詳細を見る', uri: 'https://example.com/product' },
    });
  });

  it('builds receipt messages with store, item list, and total structures', () => {
    const receipt = receiptMessage({
      storeName: 'Store',
      items: [{ name: 'Item', quantity: 2, price: 1200 }],
      total: 2400,
    });

    expect(receipt.type).toBe('bubble');
    expect(receipt.body?.type).toBe('box');
    expect(receipt.body?.layout).toBe('vertical');
    expect(receipt.body?.contents[0]).toMatchObject({ type: 'text', text: 'Store' });
    expect(receipt.body?.contents[2]).toMatchObject({ type: 'box', layout: 'vertical' });
    expect(receipt.body?.contents[4]).toMatchObject({ type: 'box', layout: 'horizontal' });
  });

  it('builds flex components with expected type fields', () => {
    const action = { type: 'uri' as const, label: 'Open', uri: 'https://example.com' };
    const text = flexText('Hello');
    const image = flexImage('https://example.com/image.png');
    const button = flexButton(action);
    const box = flexBox('vertical', [text, image, button]);
    const bubble = flexBubble({ body: box });

    expect(bubble.type).toBe('bubble');
    expect(box.type).toBe('box');
    expect(text.type).toBe('text');
    expect(image.type).toBe('image');
    expect(button.type).toBe('button');
  });
});
