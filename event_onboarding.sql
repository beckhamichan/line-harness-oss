INSERT INTO scenarios (id, name, description, trigger_type, trigger_tag_id, is_active, delivery_mode)
VALUES (
  '3fc03f4a-29f7-4014-b8d4-99c109b13f8c',
  'イベント情報ルート 導入（2日間）',
  'Hubで『イベント』選択→R:イベント付与→tag_addedで自動起動。情報購読型2日・つながるきっかけ・個別告知は層2 broadcast。',
  'tag_added',
  '91733e50-e511-4353-96f5-906c54230f95',
  1,
  'relative'
);

INSERT INTO scenario_steps (id, scenario_id, step_order, delay_minutes, message_type, message_content)
VALUES
('3f5914ed-022c-4f36-8f37-05e0a640a951','3fc03f4a-29f7-4014-b8d4-99c109b13f8c',1,0,'text','ようこそ、be Navigatorへ🎉
「イベント情報がほしい」を選んでくれて、ありがとうございます。

ここは、ナースまつり・セミナー・勉強会・オフ会など——“学び”と“人との出会い”につながる場の情報が届くLINEです。
be Navigatorのイベントに共通しているのは、同じ想いを持つ仲間と出会えること。ひとりで頑張らなくていい、そんな“つながるきっかけ”をお届けします。

次のイベントが決まったら、ここでいちばんにお知らせしますね。参加はもちろん、「まずは見るだけ」も大歓迎です😊
——be Navigator'),
('492c9922-7ba1-43a0-b559-572100842047','3fc03f4a-29f7-4014-b8d4-99c109b13f8c',2,2880,'text','イベントは、学びの「きっかけ」。
同じ現場の仲間と顔を合わせて話すと、ひとりの勉強より、ぐっと楽しく続きます。

もし「イベントだけじゃなく、日々の学びも“ゆるく”はじめたい」と思ったら、心電図や循環器などの入口はこちらに👇
https://liff.line.me/2010453320-O9UsF9z4?page=hub

次のイベントが決まったら、またここでお知らせします。
——be Navigator');
