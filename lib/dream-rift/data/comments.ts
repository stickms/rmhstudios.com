/**
 * Nico Nico–style scrolling "danmaku comments" for Dream Rift.
 *
 * Short bursts of (mostly Japanese) text fly right-to-left across the playfield
 * to celebrate streaks, spell captures, milestones and level starts — the same
 * way viewer comments stream over a Nico Nico video. In multiplayer the host
 * picks the comment and broadcasts it so the whole lobby sees the same流れる
 * text. English glosses are kept short on purpose; this is flavour, not UI.
 */

import { Rng } from '../rng';

export type CommentEvent =
    | 'stageStart'
    | 'bossStart'
    | 'spellCapture'
    | 'bomb'
    | 'death'
    | 'extend'
    | 'grazeStreak'
    | 'bossDefeat'
    | 'milestone'
    | 'victory'
    | 'playerJoin'
    | 'gameOver';

/** Pools of phrases per event. Mix of JP, kaomoji, net-slang and clap-counts. */
const POOLS: Record<CommentEvent, string[]> = {
    stageStart: ['いくぞ！', 'はじまた', 'ここからが本番', 'Stage Start!', '気合い入れろ', 'うぽつ', 'キタ━━━(゜∀゜)━━━!!'],
    bossStart: ['ボス来た！', '弾幕注意', 'ここ難所', 'BOSS!!', '避けゲー開始', '集中集中', '殺意の波動'],
    spellCapture: ['スペルカード取得！', 'ナイス回避！', 'ノーミス神', 'Capture!', 'うまE', 'GJ!!', '888888', 'すごE'],
    bomb: ['ボム！', '緊急回避', 'もったいない', 'BOMB!', '保険発動', 'ナイスボム'],
    death: ['被弾ｗ', 'ドンマイ', '死んだ', 'あっ…', 'おしい！', 'oh no', 'ﾅﾑ', 'まだいける'],
    extend: ['1UP！残機増加', 'エクステンド！', '生き返った', 'EXTEND!', 'ヒャッハー', 'ナイス！'],
    grazeStreak: ['グレイズ稼ぎ', 'かすりすぎｗ', '攻めてる！', 'GRAZE!!', '紙一重', 'やりおる', '神避け'],
    bossDefeat: ['撃破ァ！', 'ボス撃破！', 'よくやった', 'CLEAR!', '勝った！', 'お見事', 'wwwwww', 'ぐうかっこいい'],
    milestone: ['スコアやばE', 'ハイスコア更新', 'カンスト目前', 'NEW RECORD', '伸びてる！', 'プロかな？'],
    victory: ['全クリ！おめでとう', 'クリアおめ！', '夢、閉じた', 'ALL CLEAR!', '888888888', '感動した', 'GG'],
    playerJoin: ['参戦！', '助っ人キタ', 'よろしく！', 'JOIN!', '一緒に避けよ', 'うぽつ'],
    gameOver: ['ゲームオーバー', 'また挑戦しよ', 'おつかれ', 'GAME OVER', 'リベンジだ', 'ドンマイ'],
};

export function pickComment(event: CommentEvent, rng: Rng): string {
    const pool = POOLS[event];
    return pool[rng.int(0, pool.length - 1)];
}

/** Pick deterministically by a numeric salt (so all clients can agree). */
export function pickCommentBySalt(event: CommentEvent, salt: number): string {
    const pool = POOLS[event];
    return pool[((salt % pool.length) + pool.length) % pool.length];
}
