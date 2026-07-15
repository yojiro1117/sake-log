import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const source = JSON.parse(await readFile(path.join(root, 'tests/fixtures/google-drive-test-manifest.json'), 'utf8'));

const r = (groupId, imageType, status, product, maker, alcoholType, extra = {}) => ({
  groupId, imageType, groundTruthStatus: status,
  expectedBrandFamily: product?.split(' ')[0], expectedProductName: product,
  expectedMakerName: maker, expectedAlcoholType: alcoholType, ...extra
});

// Values are transcribed only when they are legible in the temporary 72-image contact sheets.
// Multi-product and unreadable images deliberately remain partial/unknown.
const truth = [
  r('laphroaig-triple-wood','other','partially_confirmed','Laphroaig Triple Wood','Laphroaig Distillery','whisky',{ visibleText:'LAPHROAIG DISTILLERY' }),
  r('hibiki-harmony','frontLabel','confirmed','響 Japanese Harmony','サントリー','whisky',{ expectedBrandFamily:'響', visibleText:'HIBIKI SUNTORY WHISKY JAPANESE HARMONY' }),
  r('w-yamadanishiki','frontLabel','partially_confirmed','W 純米 山田錦','渡辺酒造店','sake',{ expectedBrandFamily:'W', visibleText:'W JUNMAI YAMADA NISHIKI' }),
  r('nabeshima-purple','frontLabel','confirmed','鍋島 純米吟醸','富久千代酒造','sake',{ expectedBrandFamily:'鍋島', visibleText:'鍋島 純米吟醸' }),
  r('kameshizuku','frontLabel','confirmed','甕雫','京屋酒造','shochu',{ visibleText:'本格焼酎 甕雫 KAMESHIZUKU' }),
  r('unknown-kikota','frontLabel','partially_confirmed','喜荒太',undefined,'sake',{ visibleText:'純米 喜荒太 初代', notes:'筆文字の読みは画像だけでは完全確定できない' }),
  r('laphroaig-triple-wood','frontLabel','confirmed','Laphroaig Triple Wood','Laphroaig Distillery','whisky',{ visibleText:'LAPHROAIG ISLAY SINGLE MALT SCOTCH WHISKY TRIPLE WOOD' }),
  r('nikka-coffey-malt','frontLabel','confirmed','ニッカ カフェモルト','ニッカウヰスキー','whisky',{ visibleText:'NIKKA COFFEY MALT WHISKY', expectedAbv:45 }),
  r('aramasa-2020','frontLabel','partially_confirmed','新政 2020 美山錦','新政酒造','sake',{ expectedBrandFamily:'新政', visibleText:'2020 新政酒造株式会社謹製 美山錦' }),
  r('karine-premium','frontLabel','partially_confirmed','香里音 karine PREMIUM',undefined,'sake',{ expectedBrandFamily:'香里音', visibleText:'香里音 karine PREMIUM' }),
  r('yamazaki','frontLabel','confirmed','山崎','サントリー','whisky',{ visibleText:'THE YAMAZAKI SINGLE MALT JAPANESE WHISKY 山崎' }),
  r('karine-premium','frontLabel','partially_confirmed','香里音 karine PREMIUM',undefined,'sake',{ expectedBrandFamily:'香里音', visibleText:'香里音 karine PREMIUM' }),
  r('kubota-senju','frontLabel','confirmed','久保田 千寿 純米吟醸','朝日酒造','sake',{ expectedBrandFamily:'久保田', expectedVariant:'千寿 純米吟醸', visibleText:'久保田 千寿 純米吟醸' }),
  r('multi-hibiki-miyagikyo','group','unknown',undefined,undefined,undefined,{ visibleText:'響 宮城峡', notes:'複数商品' }),
  r('miyagikyo','frontLabel','confirmed','シングルモルト 宮城峡','ニッカウヰスキー','whisky',{ expectedBrandFamily:'宮城峡', visibleText:'NIKKA WHISKY SINGLE MALT MIYAGIKYO 宮城峡' }),
  r('hibiki-harmony','frontLabel','confirmed','響 Japanese Harmony','サントリー','whisky',{ expectedBrandFamily:'響', visibleText:'HIBIKI JAPANESE HARMONY' }),
  r('store-yamazaki12','other','confirmed','山崎 12年','サントリー','whisky',{ expectedBrandFamily:'山崎', expectedVariant:'12年', visibleText:'THE YAMAZAKI 12 YEARS 山崎12年' }),
  r('store-chita-coffey','group','unknown',undefined,undefined,undefined,{ visibleText:'知多 NIKKA COFFEY MALT', notes:'複数商品' }),
  r('multi-nikka','group','unknown',undefined,undefined,undefined,{ visibleText:'NIKKA COFFEY MALT YOICHI CHITA', notes:'複数商品・上下反転' }),
  r('multi-nikka-upside-down','group','unknown',undefined,undefined,undefined,{ visibleText:'NIKKA COFFEY MALT', notes:'複数商品または上下反転のため正解銘柄を確定しない' }),
  r('nikka-coffey-malt','frontLabel','confirmed','ニッカ カフェモルト','ニッカウヰスキー','whisky',{ visibleText:'NIKKA COFFEY MALT WHISKY', expectedAbv:45 }),
  r('nikka-coffey-malt','frontLabel','confirmed','ニッカ カフェモルト','ニッカウヰスキー','whisky',{ visibleText:'NIKKA COFFEY MALT WHISKY', expectedAbv:45 }),
  r('nabeshima-purple','frontLabel','confirmed','鍋島 純米吟醸','富久千代酒造','sake',{ expectedBrandFamily:'鍋島', visibleText:'鍋島 純米吟醸' }),
  r('nabeshima-purple','frontLabel','confirmed','鍋島 純米吟醸','富久千代酒造','sake',{ expectedBrandFamily:'鍋島', visibleText:'鍋島 純米吟醸' }),
  r('unknown-kikota','frontLabel','partially_confirmed','喜荒太',undefined,'sake',{ visibleText:'純米 喜荒太 初代', notes:'筆文字の読みは画像だけでは完全確定できない' }),
  r('chita','frontLabel','confirmed','知多','サントリー','whisky',{ visibleText:'THE CHITA SINGLE GRAIN JAPANESE WHISKY 知多' }),
  r('chita','frontLabel','confirmed','知多','サントリー','whisky',{ visibleText:'THE CHITA SINGLE GRAIN JAPANESE WHISKY 知多' }),
  r('yoichi','frontLabel','confirmed','シングルモルト 余市','ニッカウヰスキー','whisky',{ expectedBrandFamily:'余市', visibleText:'NIKKA WHISKY SINGLE MALT YOICHI 余市' }),
  r('yoichi','frontLabel','confirmed','シングルモルト 余市','ニッカウヰスキー','whisky',{ expectedBrandFamily:'余市', visibleText:'NIKKA WHISKY SINGLE MALT YOICHI 余市' }),
  r('asian-beauty','frontLabel','partially_confirmed','Asian Beauty 純米吟醸',undefined,'sake',{ expectedBrandFamily:'Asian Beauty', visibleText:'Asian Beauty 純米吟醸' }),
  r('toko-genshu','frontLabel','confirmed','東光 純米吟醸原酒','小嶋総本店','sake',{ expectedBrandFamily:'東光', expectedVariant:'純米吟醸原酒', visibleText:'東光 純米吟醸原酒' }),
  r('nabeshima-new-moon','frontLabel','confirmed','鍋島 New Moon','富久千代酒造','sake',{ expectedBrandFamily:'鍋島', expectedVariant:'New Moon', visibleText:'Nabeshima New Moon 鍋島' }),
  r('nabeshima-new-moon','frontLabel','confirmed','鍋島 New Moon','富久千代酒造','sake',{ expectedBrandFamily:'鍋島', expectedVariant:'New Moon', visibleText:'Nabeshima New Moon 鍋島' }),
  r('takanome','frontLabel','confirmed','鷹ノ目','はつもみぢ','sake',{ visibleText:'鷹ノ目 HAWK EYE' }),
  r('kaze-no-mori','group','partially_confirmed','風の森','油長酒造','sake',{ visibleText:'風の森 Kaze no Mori', notes:'2バリエーションが同時に写る' }),
  r('taka','frontLabel','confirmed','貴 特別純米 60','永山本家酒造場','sake',{ expectedBrandFamily:'貴', visibleText:'貴 特別純米 60' }),
  r('taka','frontLabel','confirmed','貴 特別純米 60','永山本家酒造場','sake',{ expectedBrandFamily:'貴', visibleText:'貴 特別純米 60' }),
  r('daiyame','frontLabel','confirmed','だいやめ DAIYAME','濵田酒造','shochu',{ expectedBrandFamily:'だいやめ', visibleText:'DAIYAME HAMADA SYUZOU TRADITIONAL SHOCHU' }),
  r('koshu-wine','frontLabel','partially_confirmed','甲州 酸化防止剤無添加',undefined,'wine',{ expectedBrandFamily:'甲州', visibleText:'甲州 酸化防止剤無添加 中口' }),
  r('multi-six-sake','group','unknown',undefined,undefined,undefined,{ notes:'6本の複数商品' }),
  r('w-yamadanishiki','frontLabel','partially_confirmed','W 純米 山田錦','渡辺酒造店','sake',{ expectedBrandFamily:'W', visibleText:'W JUNMAI YAMADA NISHIKI' }),
  r('tentaka-1814','frontLabel','confirmed','天鷹 夢ささら 1814','天鷹酒造','sake',{ expectedBrandFamily:'天鷹', visibleText:'TENTAKA 1814' }),
  r('sharaku','frontLabel','confirmed','寫樂 純米吟醸','宮泉銘醸','sake',{ expectedBrandFamily:'寫樂', visibleText:'寫樂 純米吟醸' }),
  r('denshu','frontLabel','confirmed','田酒 純米吟醸','西田酒造店','sake',{ expectedBrandFamily:'田酒', visibleText:'田酒 山廃仕込' }),
  r('dassai45','frontLabel','confirmed','獺祭 純米大吟醸45','旭酒造','sake',{ expectedBrandFamily:'獺祭', expectedVariant:'純米大吟醸45', visibleText:'獺祭 純米大吟醸 磨き四割五分 45' }),
  r('akabu','frontLabel','confirmed','赤武 AKABU 純米吟醸','赤武酒造','sake',{ expectedBrandFamily:'赤武', visibleText:'AKABU 純米吟醸' }),
  r('multi-five-sake','group','unknown',undefined,undefined,undefined,{ notes:'5本の複数商品' }),
  r('tarumizu','frontLabel','partially_confirmed','垂氷',undefined,'sake',{ visibleText:'垂氷 吟醸生' }),
  r('takijiman','frontLabel','confirmed','瀧自慢 大吟醸','瀧自慢酒造','sake',{ expectedBrandFamily:'瀧自慢', expectedVariant:'大吟醸', visibleText:'瀧自慢 大吟醸 Takijiman' }),
  r('aramasa-2020','frontLabel','partially_confirmed','新政 2020 美山錦','新政酒造','sake',{ expectedBrandFamily:'新政', visibleText:'2020 新政酒造株式会社謹製 美山錦' }),
  r('aramasa-2020','frontLabel','partially_confirmed','新政 2020 美山錦','新政酒造','sake',{ expectedBrandFamily:'新政', visibleText:'2020 新政酒造株式会社謹製 美山錦' }),
  r('sharaku','backLabel','confirmed','寫樂 純米吟醸','宮泉銘醸','sake',{ expectedBrandFamily:'寫樂', expectedVolumeMl:720, expectedAbv:16, visibleText:'寫樂 720ml アルコール分16度 宮泉銘醸株式会社' }),
  r('akabu','frontLabel','confirmed','赤武 AKABU 純米吟醸','赤武酒造','sake',{ expectedBrandFamily:'赤武', visibleText:'AKABU 純米吟醸' }),
  r('multi-five-sake','group','unknown',undefined,undefined,undefined,{ notes:'5本の複数商品' }),
  r('multi-akabu-sharaku','group','unknown',undefined,undefined,undefined,{ visibleText:'AKABU 寫樂', notes:'2本の複数商品' }),
  r('no6-x','frontLabel','confirmed','新政 No.6 X-type','新政酒造','sake',{ expectedBrandFamily:'新政', expectedVariant:'No.6 X-type', visibleText:'No.6 X-type 新政' }),
  r('multi-four-sake','group','unknown',undefined,undefined,undefined,{ notes:'寫樂 No.6 AKABU 山本の複数商品' }),
  r('akabu','frontLabel','confirmed','赤武 AKABU MOUNTAIN 2021','赤武酒造','sake',{ expectedBrandFamily:'赤武', expectedVariant:'MOUNTAIN 2021', visibleText:'AKABU MOUNTAIN 2021' }),
  r('akabu','backLabel','confirmed','赤武 AKABU MOUNTAIN 2021','赤武酒造','sake',{ expectedBrandFamily:'赤武', expectedVariant:'MOUNTAIN 2021', expectedVolumeMl:720, expectedAbv:14, visibleText:'AKABU MOUNTAIN 2021 内容量720ml アルコール分14度 赤武酒造株式会社' }),
  r('yamamoto','frontLabel','confirmed','山本','山本酒造店','sake',{ visibleText:'山本' }),
  r('yamamoto','backLabel','confirmed','山本','山本酒造店','sake',{ expectedVolumeMl:1800, expectedAbv:15, visibleText:'株式会社山本酒造店 アルコール分15度' }),
  r('sharaku','frontLabel','confirmed','寫樂 純米吟醸','宮泉銘醸','sake',{ expectedBrandFamily:'寫樂', visibleText:'寫樂 純米吟醸' }),
  r('sharaku','backLabel','confirmed','寫樂 純米吟醸','宮泉銘醸','sake',{ expectedBrandFamily:'寫樂', expectedVolumeMl:720, expectedAbv:16, visibleText:'寫樂 720ml アルコール分16度 宮泉銘醸株式会社' }),
  r('no6-x','frontLabel','confirmed','新政 No.6 X-type','新政酒造','sake',{ expectedBrandFamily:'新政', expectedVariant:'No.6 X-type', visibleText:'No.6 X-type 新政' }),
  r('no6-x','backLabel','confirmed','新政 No.6 X-type','新政酒造','sake',{ expectedBrandFamily:'新政', expectedVariant:'No.6 X-type', visibleText:'要冷蔵 新政' }),
  r('no6-x','frontLabel','confirmed','新政 No.6 X-type','新政酒造','sake',{ expectedBrandFamily:'新政', expectedVariant:'No.6 X-type', visibleText:'No.6 X-type 新政' }),
  r('hououbiden','frontLabel','confirmed','鳳凰美田 純米吟醸 雄町','小林酒造','sake',{ expectedBrandFamily:'鳳凰美田', expectedVariant:'純米吟醸 雄町', visibleText:'鳳凰美田 純米吟醸 雄町' }),
  r('hououbiden','other','confirmed','鳳凰美田 純米吟醸 雄町','小林酒造','sake',{ expectedBrandFamily:'鳳凰美田', expectedVariant:'純米吟醸 雄町', visibleText:'製造者 小林酒造株式会社' }),
  r('hououbiden','backLabel','confirmed','鳳凰美田 純米吟醸 雄町','小林酒造','sake',{ expectedBrandFamily:'鳳凰美田', expectedVariant:'純米吟醸 雄町', expectedAbv:16, visibleText:'鳳凰美田 雄町 アルコール分16度以上17度未満 小林酒造株式会社' }),
  r('tapas-wine','frontLabel','partially_confirmed','THE TAPAS WINE COLLECTION TEMPRANILLO 2018',undefined,'wine',{ expectedBrandFamily:'THE TAPAS WINE COLLECTION', expectedVariant:'TEMPRANILLO 2018', visibleText:'THE TAPAS WINE COLLECTION TEMPRANILLO 2018' }),
  r('no6-x','backLabel','confirmed','新政 No.6 X-type','新政酒造','sake',{ expectedBrandFamily:'新政', expectedVariant:'No.6 X-type', visibleText:'No.6 X-type 要冷蔵保管' }),
  r('no6-x','backLabel','confirmed','新政 No.6 X-type','新政酒造','sake',{ expectedBrandFamily:'新政', expectedVariant:'No.6 X-type', visibleText:'No.6 X-type 要冷蔵保管' })
];

if (truth.length !== source.length) throw new Error(`Ground truth length ${truth.length} does not match source ${source.length}`);

const groupSizes = truth.reduce((map, item) => map.set(item.groupId, (map.get(item.groupId) ?? 0) + 1), new Map());
const splitTargets = { tuning: Math.round(source.length * 0.6), validation: Math.round(source.length * 0.2), holdout: source.length - Math.round(source.length * 0.6) - Math.round(source.length * 0.2) };
const splitCounts = { tuning: 0, validation: 0, holdout: 0 };
const groupSplits = new Map();
const splitNames = /** @type {const} */ (['tuning', 'validation', 'holdout']);
const orderedGroups = [...groupSizes].sort(([left], [right]) => createHash('sha256').update(`sake-log-v2:${left}`).digest('hex').localeCompare(createHash('sha256').update(`sake-log-v2:${right}`).digest('hex')));
for (const [groupId, size] of orderedGroups) {
  const selected = [...splitNames].sort((left, right) => {
    const leftNeed = (splitTargets[left] - splitCounts[left]) / splitTargets[left];
    const rightNeed = (splitTargets[right] - splitCounts[right]) / splitTargets[right];
    return rightNeed - leftNeed;
  })[0];
  groupSplits.set(groupId, selected);
  splitCounts[selected] += size;
}

function splitFor(groupId) {
  return groupSplits.get(groupId);
}

const output = source.map((item, index) => ({
  fileName: item.fileName,
  fileId: item.driveFileId,
  imageHash: item.sha256,
  ...truth[index],
  expectedVariant: truth[index].expectedVariant,
  expectedVolumeMl: truth[index].expectedVolumeMl,
  expectedAbv: truth[index].expectedAbv,
  expectedJanCode: truth[index].expectedJanCode,
  labelOrientation: item.orientation ?? 'unknown',
  difficulty: truth[index].imageType === 'group' ? 'hard' : (truth[index].groundTruthStatus === 'confirmed' ? 'medium' : 'hard'),
  split: splitFor(truth[index].groupId)
}));

const leakage = new Map();
for (const item of output) {
  const values = leakage.get(item.groupId) ?? new Set();
  values.add(item.split);
  leakage.set(item.groupId, values);
}
if ([...leakage.values()].some((splits) => splits.size !== 1)) throw new Error('groupId leakage detected');

const target = path.join(root, 'tests/fixtures/brand-identification-ground-truth.json');
await writeFile(target, `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({
  target,
  total: output.length,
  groups: leakage.size,
  status: Object.fromEntries(['confirmed','partially_confirmed','unknown'].map((status) => [status, output.filter((item) => item.groundTruthStatus === status).length])),
  splits: Object.fromEntries(['tuning','validation','holdout'].map((split) => [split, output.filter((item) => item.split === split).length]))
}, null, 2));
