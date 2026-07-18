export interface LibraryLesson {
  number: number;
  title: string;
  videoId: string;
  description: string;
}

export const LIBRARY_LESSONS: LibraryLesson[] = [
  {
    number: 1,
    title: '波形の名前',
    videoId: 'M1NPkrOrVE4',
    description: 'P波・QRS・T波…まずは波の名前と役割から。ここが全部の土台になります。',
  },
  {
    number: 2,
    title: 'P波の愛くるしさ',
    videoId: 'giZeyuUAnGQ',
    description: '心房のがんばりを映すP波。小さな波の見どころをやさしく解説します。',
  },
  {
    number: 3,
    title: 'QRSはどうできる？',
    videoId: 'y39GXCzJQA0',
    description: 'いちばん目立つQRS波はどうやって生まれる？成り立ちがわかると読み方が変わります。',
  },
  {
    number: 4,
    title: '正常洞調律',
    videoId: 'HY2YIcfOmvs',
    description: '「正常」がわかるから、異常に気づける。すべての判読の出発点です。',
  },
  {
    number: 5,
    title: '心拍計測の極意',
    videoId: '0cbyOzbDqVk',
    description: 'マス目から心拍数をパッと出すコツ。明日の現場でそのまま使えます。',
  },
];
