import type { AlcoholProductCatalogEntry, AlcoholType } from '../types';

const builtAt = '2026-07-15T00:00:00.000Z';
const entry = (productId: string, brandFamily: string, canonicalProductName: string, makerName: string, alcoholType: AlcoholType, options: Partial<AlcoholProductCatalogEntry> = {}): AlcoholProductCatalogEntry => ({
  productId, brandFamily, canonicalProductName, makerName, alcoholType,
  aliases: [brandFamily, canonicalProductName], kanaAliases: [], latinAliases: [], commonOcrErrors: [],
  volumesMl: [], janCodes: [], keywords: [], exclusionKeywords: [], referenceImageIds: [],
  source: 'built-in', userConfirmed: false, createdAt: builtAt, updatedAt: builtAt, ...options
});

export const builtInAlcoholProductCatalog: AlcoholProductCatalogEntry[] = [
  entry('sake-dassai-45','獺祭','獺祭 純米大吟醸45','旭酒造','sake',{ variantName:'純米大吟醸45', aliases:['獺祭45','獺祭 磨き四割五分'], latinAliases:['DASSAI 45'], commonOcrErrors:['DAS5AI 45'], volumesMl:[180,300,720,1800], abvMin:16, abvMax:16, keywords:['純米大吟醸','45','四割五分'] }),
  entry('sake-dassai-39','獺祭','獺祭 純米大吟醸 磨き三割九分','旭酒造','sake',{ variantName:'磨き三割九分', latinAliases:['DASSAI 39'], keywords:['39','三割九分'] }),
  entry('sake-dassai-23','獺祭','獺祭 純米大吟醸 磨き二割三分','旭酒造','sake',{ variantName:'磨き二割三分', latinAliases:['DASSAI 23'], keywords:['23','二割三分'] }),
  entry('whisky-hibiki','響','響','サントリー','whisky',{ latinAliases:['HIBIKI'], abvMin:43, abvMax:43, volumesMl:[700] }),
  entry('whisky-yamazaki','山崎','山崎','サントリー','whisky',{ latinAliases:['THE YAMAZAKI','YAMAZAKI'], abvMin:43, abvMax:43, exclusionKeywords:['12年','18年','LIMITED'] }),
  entry('whisky-yamazaki-12','山崎','山崎 12年','サントリー','whisky',{ variantName:'12年', latinAliases:['THE YAMAZAKI 12 YEARS','YAMAZAKI 12'], keywords:['12年','12 YEARS'], abvMin:43, abvMax:43 }),
  entry('whisky-yamazaki-18','山崎','山崎 18年','サントリー','whisky',{ variantName:'18年', latinAliases:['THE YAMAZAKI 18 YEARS'], keywords:['18年','18 YEARS'], abvMin:43, abvMax:43 }),
  entry('whisky-miyagikyo','宮城峡','シングルモルト 宮城峡','ニッカウヰスキー','whisky',{ latinAliases:['MIYAGIKYO','NIKKA MIYAGIKYO'], keywords:['SINGLE MALT'], abvMin:45, abvMax:45 }),
  entry('whisky-yoichi','余市','シングルモルト 余市','ニッカウヰスキー','whisky',{ latinAliases:['YOICHI','NIKKA YOICHI'], keywords:['SINGLE MALT'], abvMin:45, abvMax:45 }),
  entry('whisky-chita','知多','知多','サントリー','whisky',{ latinAliases:['THE CHITA','CHITA'], keywords:['SINGLE GRAIN'], abvMin:43, abvMax:43 }),
  entry('whisky-nikka-coffey-malt','ニッカ','ニッカ カフェモルト','ニッカウヰスキー','whisky',{ latinAliases:['NIKKA COFFEY MALT','COFFEY MALT WHISKY'], commonOcrErrors:['NIKKA COFFEE MALT'], abvMin:45, abvMax:45 }),
  entry('whisky-laphroaig-triple-wood','Laphroaig','Laphroaig Triple Wood','Laphroaig Distillery','whisky',{ latinAliases:['LAPHROAIG TRIPLE WOOD'], keywords:['ISLAY','TRIPLE WOOD'] }),
  entry('sake-w-yamadanishiki','W','W 純米 山田錦','渡辺酒造店','sake',{ latinAliases:['W JUNMAI YAMADA NISHIKI'], keywords:['山田錦','YAMADA NISHIKI'] }),
  entry('sake-nabeshima-junmai-ginjo','鍋島','鍋島 純米吟醸','富久千代酒造','sake',{ latinAliases:['NABESHIMA'], keywords:['純米吟醸'], exclusionKeywords:['NEW MOON'] }),
  entry('sake-nabeshima-new-moon','鍋島','鍋島 New Moon','富久千代酒造','sake',{ variantName:'New Moon', latinAliases:['NABESHIMA NEW MOON'], keywords:['NEW MOON'] }),
  entry('sake-kubota','久保田','久保田','朝日酒造','sake',{ latinAliases:['KUBOTA'] }),
  entry('sake-toko-genshu','東光','東光 純米吟醸原酒','小嶋総本店','sake',{ latinAliases:['TOKO'], keywords:['純米吟醸原酒'] }),
  entry('shochu-daiyame','だいやめ','だいやめ DAIYAME','濵田酒造','shochu',{ latinAliases:['DAIYAME','HAMADA SYUZOU'], keywords:['本格焼酎','TRADITIONAL SHOCHU'] }),
  entry('shochu-kuro-kirishima','黒霧島','黒霧島','霧島酒造','shochu',{ latinAliases:['KURO KIRISHIMA'], commonOcrErrors:['黒霧鳥','黑霧島'], keywords:['本格焼酎'], volumesMl:[200,720,900,1800], abvMin:20, abvMax:25 }),
  entry('sake-sharaku-junmai-ginjo','寫樂','寫樂 純米吟醸','宮泉銘醸','sake',{ aliases:['寫樂','写楽','寫樂 純米吟醸'], latinAliases:['SHARAKU'], commonOcrErrors:['冩樂'], keywords:['純米吟醸'], volumesMl:[720,1800], abvMin:16, abvMax:16 }),
  entry('sake-denshu','田酒','田酒 純米吟醸','西田酒造店','sake',{ latinAliases:['DENSHU','DENSYU'], keywords:['純米吟醸'] }),
  entry('sake-akabu','赤武','赤武 AKABU 純米吟醸','赤武酒造','sake',{ latinAliases:['AKABU'], keywords:['純米吟醸'], exclusionKeywords:['MOUNTAIN'] }),
  entry('sake-akabu-mountain','赤武','赤武 AKABU MOUNTAIN 2021','赤武酒造','sake',{ variantName:'MOUNTAIN 2021', latinAliases:['AKABU MOUNTAIN 2021'], keywords:['MOUNTAIN','2021'], volumesMl:[720], abvMin:14, abvMax:14 }),
  entry('sake-aramasa-no6','新政','新政 No.6','新政酒造','sake',{ aliases:['新政 No.6','No.6'], latinAliases:['NO.6','NO6','JAPAN BREWING SOCIETY NO.6'], commonOcrErrors:['N0.6'], keywords:['6'] }),
  entry('sake-yamamoto','山本','山本','山本酒造店','sake',{ latinAliases:['YAMAMOTO'] }),
  entry('sake-hououbiden-omachi','鳳凰美田','鳳凰美田 純米吟醸 雄町','小林酒造','sake',{ variantName:'純米吟醸 雄町', aliases:['鳳凰美田 雄町'], latinAliases:['HOUOU BIDEN'], keywords:['雄町','純米吟醸'], abvMin:16, abvMax:17 }),
  entry('sake-takijiman-daiginjo','瀧自慢','瀧自慢 大吟醸','瀧自慢酒造','sake',{ variantName:'大吟醸', latinAliases:['TAKIJIMAN'], keywords:['大吟醸'] }),
  entry('sake-takanome','鷹ノ目','鷹ノ目','はつもみぢ','sake',{ latinAliases:['TAKANOME','HAWK EYE'] }),
  entry('sake-kaze-no-mori','風の森','風の森','油長酒造','sake',{ latinAliases:['KAZE NO MORI'] }),
  entry('shochu-kameshizuku','甕雫','甕雫','京屋酒造','shochu',{ latinAliases:['KAMESHIZUKU'], keywords:['本格焼酎'] }),
  entry('sake-kikota','喜荒太','喜荒太','不明','sake',{ aliases:['喜荒太','純米 喜荒太','喜荒太 初代'], keywords:['純米','初代'] }),
  entry('sake-karine-premium','香里音','香里音 karine PREMIUM','不明','sake',{ aliases:['香里音','香里音 PREMIUM'], latinAliases:['KARINE PREMIUM'], keywords:['PREMIUM'] }),
  entry('sake-asian-beauty','Asian Beauty','Asian Beauty 純米吟醸','不明','sake',{ latinAliases:['ASIAN BEAUTY'], keywords:['純米吟醸'] }),
  entry('sake-taka-60','貴','貴 特別純米 60','永山本家酒造場','sake',{ aliases:['貴 特別純米','貴 60'], latinAliases:['TAKA'], keywords:['特別純米','60'] }),
  entry('wine-koshu-no-antioxidant','甲州','甲州 酸化防止剤無添加','不明','wine',{ aliases:['甲州 無添加'], keywords:['酸化防止剤無添加','中口'] }),
  entry('sake-tentaka-1814','天鷹','天鷹 夢ささら 1814','天鷹酒造','sake',{ latinAliases:['TENTAKA 1814'], keywords:['夢ささら','1814'] }),
  entry('sake-tarumizu','垂氷','垂氷','不明','sake',{ aliases:['垂氷 吟醸生'], keywords:['吟醸生'] }),
  entry('wine-tapas-tempranillo-2018','THE TAPAS WINE COLLECTION','THE TAPAS WINE COLLECTION TEMPRANILLO 2018','不明','wine',{ latinAliases:['TAPAS WINE','TEMPRANILLO 2018'], keywords:['TEMPRANILLO','2018'] })
];

export function mergeCatalogEntries(stored: AlcoholProductCatalogEntry[] = []) {
  const map = new Map(builtInAlcoholProductCatalog.map((item) => [item.productId, item]));
  for (const item of stored) map.set(item.productId, item);
  return [...map.values()].filter((item) => !item.hidden);
}
