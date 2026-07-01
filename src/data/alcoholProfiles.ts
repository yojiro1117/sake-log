import type { AlcoholProfile, AlcoholType } from '../types';

export const alcoholProfiles: Record<AlcoholType, AlcoholProfile> = {
  sake: {
    type: 'sake',
    label: '日本酒',
    axes: [
      { key: 'aroma', label: '香り', question: '香りはどの程度華やかですか？' },
      { key: 'sweetness', label: '甘味', question: '甘味はどの程度感じますか？' },
      { key: 'acidity', label: '酸味', question: '酸味はどの程度感じますか？' },
      { key: 'umami', label: '旨味', question: '米の旨味・コクはどの程度ありますか？' },
      { key: 'finish', label: 'キレ', question: '後味のキレはどの程度ありますか？' },
      { key: 'afterglow', label: '余韻', question: '余韻はどの程度残りますか？' }
    ]
  },
  wine: {
    type: 'wine',
    label: 'ワイン',
    axes: [
      { key: 'aroma', label: '香り', question: '香りの強さはどの程度ですか？' },
      { key: 'fruit', label: '果実味', question: '果実味はどの程度感じますか？' },
      { key: 'acidity', label: '酸味', question: '酸味はどの程度感じますか？' },
      { key: 'tannin', label: '渋味・苦味', question: '渋味・苦味はどの程度感じますか？' },
      { key: 'body', label: 'ボディ', question: '味わいの厚みはどの程度ありますか？' },
      { key: 'afterglow', label: '余韻', question: '余韻はどの程度残りますか？' }
    ]
  },
  shochu: {
    type: 'shochu',
    label: '焼酎',
    axes: [
      { key: 'materialAroma', label: '原料香', question: '原料由来の香りはどの程度感じますか？' },
      { key: 'sweetAroma', label: '甘香', question: '甘い香り・果実香はどの程度ありますか？' },
      { key: 'roast', label: '香ばしさ', question: '香ばしさはどの程度ありますか？' },
      { key: 'sweetness', label: '甘味', question: '甘味はどの程度感じますか？' },
      { key: 'body', label: '濃さ', question: '味の濃さ・厚みはどの程度ありますか？' },
      { key: 'finish', label: 'キレ', question: '後味のキレはどの程度ありますか？' }
    ]
  },
  beer: {
    type: 'beer',
    label: 'ビール',
    axes: [
      { key: 'aroma', label: '香り', question: '香りはどの程度感じますか？' },
      { key: 'bitterness', label: '苦味', question: '苦味はどの程度ありますか？' },
      { key: 'malt', label: 'モルト感', question: '麦芽感・コクはどの程度ありますか？' },
      { key: 'hop', label: 'ホップ感', question: 'ホップ感・爽快感はどの程度ありますか？' },
      { key: 'mouthfeel', label: '口当たり', question: '炭酸・口当たりはどの程度印象的ですか？' },
      { key: 'afterglow', label: '余韻', question: '後味・余韻はどの程度残りますか？' }
    ]
  }
};

export const alcoholOptions = Object.values(alcoholProfiles);
