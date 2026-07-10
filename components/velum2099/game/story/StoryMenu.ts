// @ts-nocheck
/* ═══════════════════════════════════════════
   VELUM2099: GHOST ROUTE — Story Menu Overlay
   Pre-game terminal-styled overlay: new game,
   continue, chapter select, evidence archive,
   mission briefing and save reset. Cyberpunk CRT
   styling to match the boot terminal and lobby.
   ═══════════════════════════════════════════ */

import {
    STORY_TITLE, STORY_MISSIONS, EVIDENCE, FIRST_MISSION_ID, getMission,
} from './StoryData';

const NEON_CYAN = '#00ffea';
const NEON_MAGENTA = '#ff00aa';
const NEON_DIM = '#5f7da0';

const ACT_NAMES = {
    1: 'ACT I — THE WRONG PACKAGE',
    2: 'ACT II — THE CITY RECORDS EVERYTHING',
    3: 'ACT III — GHOST ROUTE',
    4: 'ACT IV — BLACKBOX CITY',
    5: 'ACT V — THE LAST HUMAN DRIVER',
};

export class StoryMenu {
    /**
     * @param container host element
     * @param save StorySave instance
     * @param opts { onPlay(missionId), onExit() }
     */
    constructor(container, save, opts = {}) {
        this.container = container;
        this.save = save;
        this.onPlay = opts.onPlay || (() => {});
        this.onExit = opts.onExit || (() => {});
        this._buildDom();
    }

    show() { this.root.style.display = 'flex'; this._renderMain(); }
    hide() { this.root.style.display = 'none'; }

    dispose() {
        if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        this.root = null;
    }

    /* ── shell ── */

    _buildDom() {
        const root = document.createElement('div');
        root.className = 'velum-story-menu';
        root.style.cssText = `
            position:fixed; inset:0; z-index:410; display:none;
            align-items:center; justify-content:center;
            background:radial-gradient(ellipse at center, rgba(8,4,20,0.97), rgba(2,1,8,0.99));
            font-family:'VT323', monospace; color:${NEON_CYAN}; user-select:none;`;

        const panel = document.createElement('div');
        panel.style.cssText = `
            width:min(720px, 94vw); max-height:92vh; overflow:auto;
            border:2px solid ${NEON_CYAN}; border-radius:6px;
            box-shadow:0 0 24px rgba(0,255,234,0.35), inset 0 0 40px rgba(0,255,234,0.06);
            background:rgba(4,6,16,0.88); padding:22px 26px;`;
        root.appendChild(panel);
        this._panel = panel;

        const title = document.createElement('div');
        title.textContent = '◆ ' + STORY_TITLE + ' ◆';
        title.style.cssText = `font-size:30px; letter-spacing:3px; color:${NEON_MAGENTA};
            text-shadow:0 0 10px ${NEON_MAGENTA}; text-align:center; margin-bottom:4px;`;
        panel.appendChild(title);

        const tagline = document.createElement('div');
        tagline.textContent = 'Run the Ghost Route. Carry the package the city wants erased.';
        tagline.style.cssText = `text-align:center; color:${NEON_DIM}; font-size:16px; margin-bottom:16px;`;
        panel.appendChild(tagline);

        this._view = document.createElement('div');
        this._view.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        panel.appendChild(this._view);

        this.container.appendChild(root);
        this.root = root;
    }

    _button(label, color = NEON_CYAN, sub) {
        const b = document.createElement('button');
        b.style.cssText = `
            display:block; width:100%; text-align:left; cursor:pointer; font-family:inherit;
            background:rgba(0,255,234,0.05); border:1px solid ${color}; border-radius:6px;
            color:#eafcff; font-size:20px; letter-spacing:2px; padding:11px 16px;
            transition:background 0.12s;`;
        b.innerHTML = sub
            ? `${_esc(label)}<span style="display:block;font-size:14px;color:${NEON_DIM};letter-spacing:0;margin-top:2px;">${_esc(sub)}</span>`
            : _esc(label);
        b.addEventListener('mouseenter', () => { b.style.background = 'rgba(0,255,234,0.16)'; });
        b.addEventListener('mouseleave', () => { b.style.background = 'rgba(0,255,234,0.05)'; });
        return b;
    }

    _heading(text, color = NEON_CYAN) {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `font-size:18px; letter-spacing:2px; color:${color}; margin:6px 0 2px;`;
        return d;
    }

    _para(text, color = '#dcefff') {
        const d = document.createElement('div');
        d.textContent = text;
        d.style.cssText = `font-size:17px; line-height:1.35; color:${color}; white-space:pre-wrap;`;
        return d;
    }

    _clear() { this._view.innerHTML = ''; }

    /* ── main view ── */

    _renderMain() {
        this._clear();
        const has = this.save.exists();

        if (has) {
            const cur = getMission(this.save.data.currentMissionId) || STORY_MISSIONS[0];
            const cont = this._button(
                '▶  CONTINUE ROUTE',
                NEON_CYAN,
                `Act ${cur.act} // ${cur.title}`,
            );
            cont.addEventListener('click', () => this._renderBriefing(cur.id));
            this._view.appendChild(cont);
        } else {
            const ng = this._button('▶  BEGIN GHOST ROUTE', NEON_CYAN, 'Start a new campaign');
            ng.addEventListener('click', () => this._renderNewGame());
            this._view.appendChild(ng);
        }

        const chap = this._button('☰  CHAPTER SELECT', NEON_CYAN);
        chap.addEventListener('click', () => this._renderChapters());
        this._view.appendChild(chap);

        const arch = this._button('▤  EVIDENCE ARCHIVE', NEON_MAGENTA);
        arch.addEventListener('click', () => this._renderArchive());
        this._view.appendChild(arch);

        if (has) {
            const reset = this._button('⟲  RESET STORY SAVE', '#ff5a72');
            reset.addEventListener('click', () => this._renderReset());
            this._view.appendChild(reset);
        }

        const back = this._button('◂  BACK TO TERMINAL', NEON_DIM);
        back.addEventListener('click', () => this.onExit());
        this._view.appendChild(back);
    }

    /* ── new game ── */

    _renderNewGame() {
        this._clear();
        this._view.appendChild(this._heading('BEGIN GHOST ROUTE?', NEON_MAGENTA));
        this._view.appendChild(this._para(
            'This starts a separate campaign save. Free Roam progress will not be affected.',
            NEON_DIM,
        ));
        const go = this._button('✓  CONFIRM — START CAMPAIGN', NEON_CYAN);
        go.addEventListener('click', () => {
            this.save.startNew(FIRST_MISSION_ID);
            this._renderBriefing(FIRST_MISSION_ID);
        });
        this._view.appendChild(go);
        this._view.appendChild(this._backButton(() => this._renderMain()));
    }

    /* ── chapter select ── */

    _renderChapters() {
        this._clear();
        this._view.appendChild(this._heading('CHAPTER SELECT', NEON_CYAN));

        let lastAct = 0;
        for (const m of STORY_MISSIONS) {
            if (m.act !== lastAct) {
                lastAct = m.act;
                this._view.appendChild(this._heading(ACT_NAMES[m.act] || `ACT ${m.act}`, NEON_MAGENTA));
            }
            const done = this.save.isCompleted(m.id);
            const unlocked = this.save.isUnlocked(m.id) || done;
            const mark = done ? '✓' : (unlocked ? '▶' : '🔒');
            const color = done ? '#7dffae' : (unlocked ? NEON_CYAN : NEON_DIM);
            const b = this._button(`${mark}  ${m.title}`, color, m.subtitle);
            if (unlocked) {
                b.addEventListener('click', () => this._renderBriefing(m.id));
            } else {
                b.disabled = true;
                b.style.opacity = '0.5';
                b.style.cursor = 'not-allowed';
            }
            this._view.appendChild(b);
        }
        this._view.appendChild(this._backButton(() => this._renderMain()));
    }

    /* ── briefing ── */

    _renderBriefing(missionId) {
        const m = getMission(missionId);
        if (!m) { this._renderMain(); return; }
        this._clear();

        this._view.appendChild(this._heading(`ACT ${m.act} · ${m.title}`, NEON_MAGENTA));
        if (m.subtitle) this._view.appendChild(this._para(m.subtitle, NEON_CYAN));
        this._view.appendChild(this._para(m.briefing, '#dcefff'));

        this._view.appendChild(this._heading('OBJECTIVES', NEON_CYAN));
        const ol = document.createElement('div');
        ol.style.cssText = 'font-size:16px; color:#bfe0f5; line-height:1.4;';
        for (let i = 0; i < m.objectives.length; i++) {
            const line = document.createElement('div');
            line.textContent = `${i + 1}. ${m.objectives[i].label}`;
            ol.appendChild(line);
        }
        this._view.appendChild(ol);

        const go = this._button('▶  BEGIN ROUTE', NEON_CYAN);
        go.style.marginTop = '8px';
        go.addEventListener('click', () => {
            this.save.setCurrentMission(m.id, m.act);
            this.onPlay(m.id);
        });
        this._view.appendChild(go);
        this._view.appendChild(this._backButton(() => this._renderChapters()));
    }

    /* ── evidence archive ── */

    _renderArchive() {
        this._clear();
        this._view.appendChild(this._heading('EVIDENCE ARCHIVE', NEON_MAGENTA));

        const ids = Object.keys(EVIDENCE).filter(id => this.save.hasEvidence(id));
        if (!ids.length) {
            this._view.appendChild(this._para('No evidence recovered yet. Complete story missions to unlock archive entries.', NEON_DIM));
        } else {
            for (const id of ids) {
                const ev = EVIDENCE[id];
                const b = this._button('▤  ' + ev.title, NEON_CYAN);
                b.addEventListener('click', () => this._renderEvidence(id));
                this._view.appendChild(b);
            }
        }
        this._view.appendChild(this._backButton(() => this._renderMain()));
    }

    _renderEvidence(id) {
        const ev = EVIDENCE[id];
        if (!ev) { this._renderArchive(); return; }
        this._clear();
        this._view.appendChild(this._heading(ev.title, NEON_MAGENTA));
        this._view.appendChild(this._para(ev.body, '#cfe9ff'));
        this._view.appendChild(this._backButton(() => this._renderArchive()));
    }

    /* ── reset ── */

    _renderReset() {
        this._clear();
        this._view.appendChild(this._heading('RESET STORY SAVE?', '#ff5a72'));
        this._view.appendChild(this._para('This permanently erases your Ghost Route campaign progress. Free Roam is unaffected.', NEON_DIM));
        const go = this._button('⚠  CONFIRM — ERASE CAMPAIGN', '#ff5a72');
        go.addEventListener('click', () => { this.save.reset(); this._renderMain(); });
        this._view.appendChild(go);
        this._view.appendChild(this._backButton(() => this._renderMain()));
    }

    _backButton(fn) {
        const b = this._button('◂  BACK', NEON_DIM);
        b.style.marginTop = '4px';
        b.addEventListener('click', fn);
        return b;
    }
}

function _esc(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
