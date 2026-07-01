import type { PostTemplate, ToneSettings } from '../types';

const baseTone: ToneSettings = {
  voice: 'natural',
  ending: 'desu',
  length: 'standard',
  energy: 'standard',
  terminology: 'standard',
  emoji: 'few',
  hashtag: 'standard',
  strictness: 'standard',
  purpose: 'intro'
};

export const defaultToneSettings = baseTone;

export const defaultTemplates: PostTemplate[] = [
  ['short-note', '短文レビュー', 'Record', '{name}。{feature}で、満足度は{score}/6。コスパは{value}。{pairing}と合わせたい。'],
  ['photo-note', '写真付き記録', 'Record', '{name}\n{feature}\n満足度 {score}/6 / コスパ {value}\nおすすめペアリング：{pairing}'],
  ['polite-note', '丁寧レビュー', 'Record', '今日は{name}を記録しました。{feature}が印象的で、総合満足度は{score}/6です。{pairing}との相性も良さそうです。'],
  ['casual-note', '会話調レビュー', 'Record', '{name}、かなり良かった。{feature}。次は{pairing}と合わせてみたい。'],
  ['caption-note', '短い記録コメント', 'Record', '{name}\n特徴：{feature}\n満足度：{score}/6\nコスパ：{value}'],
  ['expert', '専門家風レビュー', 'Review', '{name}は{feature}が中心。価格印象を踏まえたコスパは{value}。食中では{pairing}に寄せると輪郭が出そうです。'],
  ['pairing', '食事ペアリング型', 'Pairing', '{name}は{pairing}と合わせたい一本。{feature}が料理の余韻を引き立てます。'],
  ['memo', '一言記録型', 'Memo', '{name}：{feature}。満足度{score}/6。'],
  ['strict', '辛口評価型', 'Review', '{name}。良さは{feature}。一方で価格との釣り合いは{value}評価として記録。'],
  ['recommend', 'おすすめメモ型', 'Record', '{name}は{feature}が好きな人におすすめ。コスパ{value}で、{pairing}と楽しみたい。']
].map(([templateId, templateName, targetSns, body]) => ({
  templateId,
  templateName,
  targetSns,
  body,
  tone: baseTone.voice,
  hashtagMode: baseTone.hashtag,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
}));
