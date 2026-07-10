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
    | 'gameOver'
    | 'ambient';

/** Pools of phrases per event. Mix of JP, kaomoji, net-slang and clap-counts. */
const POOLS: Record<CommentEvent, string[]> = {
    stageStart: ['いくぞ！', 'はじまた', 'ここからが本番', 'Stage Start!', '気合い入れろ', 'うぽつ', 'キタ━━━(゜∀゜)━━━!!', 'wktk', '待機', '始まったか', 'レッツゴー'],
    bossStart: ['ボス来た！', '弾幕注意', 'ここ難所', 'BOSS!!', '避けゲー開始', '集中集中', '殺意の波動', '弾幕ヤバスギ', 'うわぁぁぁ', 'ファイト！', '構えろ', '来るぞ…'],
    spellCapture: ['スペルカード取得！', 'ナイス回避！', 'ノーミス神', 'Capture!', 'うまE', 'GJ!!', '888888', 'すごE', 'てえてえ', '完璧だ', 'プロの動き', 'CAPTURE!!', '神回避ｗ', 'うますぎぃ'],
    bomb: ['ボム！', '緊急回避', 'もったいない', 'BOMB!', '保険発動', 'ナイスボム', 'ボムゲー', '溶けたｗ', 'やむなし', 'ナイス判断'],
    death: ['被弾ｗ', 'ドンマイ', '死んだ', 'あっ…', 'おしい！', 'oh no', 'ﾅﾑ', 'まだいける', 'ｱｰｰｰ', 'おっと', 'ご愁傷様', 'どんまい！', '次いこ次'],
    extend: ['1UP！残機増加', 'エクステンド！', '生き返った', 'EXTEND!', 'ヒャッハー', 'ナイス！', '残機UP', '保険増えた', 'やったね'],
    grazeStreak: ['グレイズ稼ぎ', 'かすりすぎｗ', '攻めてる！', 'GRAZE!!', '紙一重', 'やりおる', '神避け', 'かすってけ', 'スレスレｗ', 'えぐい避け', '攻めの稼ぎ', '度胸ある'],
    bossDefeat: ['撃破ァ！', 'ボス撃破！', 'よくやった', 'CLEAR!', '勝った！', 'お見事', 'wwwwww', 'ぐうかっこいい', '討伐完了', 'お疲れ！', 'やったー', 'ナイスファイト'],
    milestone: ['スコアやばE', 'ハイスコア更新', 'カンスト目前', 'NEW RECORD', '伸びてる！', 'プロかな？', 'スコアラー', '稼いでるねぇ', '記録更新だ', 'つよE'],
    victory: ['全クリ！おめでとう', 'クリアおめ！', '夢、閉じた', 'ALL CLEAR!', '888888888', '感動した', 'GG', 'お見事でした', '完走おめ', '神プレイ', 'GGWP', 'エンディングだ'],
    playerJoin: ['参戦！', '助っ人キタ', 'よろしく！', 'JOIN!', '一緒に避けよ', 'うぽつ', '仲間が来た', 'たすかる'],
    gameOver: ['ゲームオーバー', 'また挑戦しよ', 'おつかれ', 'GAME OVER', 'リベンジだ', 'ドンマイ', '次があるさ', '惜しかった', 'もう一回！'],
    // Generic crowd chatter streamed continuously; frequency scales with difficulty.
    ambient: [
        'ｗｗｗ', '草', 'うまい', 'がんば', 'いけいけ', 'あぶな！', 'うぉぉ', '集中', 'ナイス', 'ここすき',
        'すごE', 'てえてえ', 'かわE', '弾幕綺麗', '888', 'GJ', 'ファイト', 'よけてー', 'ぐっと避けろ', 'おお',
        'のこり残機は？', '攻めて', 'いいぞ', 'やべえ', 'うますぎ', 'おしい', 'どんまい', 'がんばれー', '熱い', '神',
        '(´∀｀)', '＼(^o^)／', '(ﾟ∀ﾟ)', 'wktk', 'ktkr', 'うぽつ', 'おつ', 'プロ', 'えぐい', 'やるなあ',
    ],
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
