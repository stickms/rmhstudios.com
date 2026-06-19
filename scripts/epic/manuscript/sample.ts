import type { Chapter } from './types';

export const SAMPLE_CHAPTER: Chapter = {
  n: 1,
  title: { zh: '第一回 玄圭失轨 諸侯起兵', en: 'Chapter 1: The Omen Stolen, the Lords Rise' },
  couplet: {
    type: 'couplet',
    zh: ['玄圭一失天下亂', '赤心三盟兄弟分'],
    en: ['One omen lost, all under heaven falls to war', 'Three oaths sworn in red, sworn brothers torn apart'],
  },
  passages: [
    { type: 'prose',
      zh: '話說洪荒之世，天賜玄圭于桑國，鎮其社稷。一夕，圭失，諸侯皆動，刀兵四起。',
      en: 'In the age of the great waste, Heaven granted the dark omen-tablet to the land of Sang to anchor its altars. One night the tablet vanished; the lords stirred, and weapons rose on every side.',
      redComment: [{ anchor: '圭失', zh: '此句已伏百回之淚。', en: 'This line already buries the tears of a hundred chapters.' }] },
    { type: 'verse',
      zh: ['君不見桑都旧苑草連天，', '玉砌雕欄一夜寒。'],
      en: ['Behold the old gardens of Sang, their grasses meeting the sky,', 'jade steps and carved rails gone cold in a single night.'] },
  ],
};
