import { alcoholProfiles } from '../data/alcoholProfiles';
import type { PostTemplate, SakeLog, ToneSettings } from '../types';
import { getDominantFeature, pairingSuggestions } from './scoring';

export function generatePostText(log: Pick<SakeLog, 'productName' | 'alcoholType' | 'baseScores' | 'satisfactionScore' | 'valueScore'>, template: PostTemplate, tone: ToneSettings) {
  const profile = alcoholProfiles[log.alcoholType];
  const labelMap = Object.fromEntries(profile.axes.map((axis) => [axis.key, axis.label]));
  const feature = getDominantFeature(log.baseScores, labelMap);
  const pairings = pairingSuggestions(log.alcoholType, log.baseScores);
  const hashtags = buildHashtags(profile.label, tone, log.valueScore);
  const body = template.body
    .replace(/\{name\}/g, log.productName || '今日のお酒')
    .replace(/\{type\}/g, profile.label)
    .replace(/\{feature\}/g, feature)
    .replace(/\{score\}/g, String(log.satisfactionScore))
    .replace(/\{value\}/g, log.valueScore ?? 'B')
    .replace(/\{pairing\}/g, pairings.join('、'));

  const safetyNote = 'お酒は20歳になってから。飲酒運転はやめましょう。';
  const emoji = tone.emoji === 'many' ? ' 🍶✨' : tone.emoji === 'few' ? ' 🍶' : '';
  const sns = `${body}${emoji}\n${hashtags.join(' ')}\n${safetyNote}`.trim();

  return {
    sns,
    oneLine: `${log.productName || '今日のお酒'}は${feature}。`,
    hashtags
  };
}

function buildHashtags(typeLabel: string, tone: ToneSettings, value?: string) {
  if (tone.hashtag === 'none') return [];
  const base = ['#SAKEログ', `#${typeLabel}`, '#お酒は20歳になってから'];
  if (tone.hashtag === 'few') return base.slice(0, 2);
  if (tone.hashtag === 'many') return [...base, '#家飲み記録', '#ペアリング', `#コスパ${value ?? 'B'}`];
  return [...base, '#飲酒記録'];
}
