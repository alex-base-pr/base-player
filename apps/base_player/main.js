'use strict';
/* Base Player — app entry point for the MGU app kit. GPL-3.0-or-later.
 *
 * This build is the interface only: there is no receiver behind it yet, so
 * the screen says so instead of pretending to wait for a phone. */

const mgu = require('./kit/mgu');
const { drawHome } = require('./view');
const { t } = require('./i18n');
const { wrap } = require('./kit_canvas');

const W = 1600, H = 520;
const BUTTONS = ['BTN_START', 'BTN_END_VIDEO', 'BTN_MIRROR', 'BTN_STOP', 'BTN_CLOSE'];

mgu.run({
    async start(ctx) {
        t.set('en'); // the kit's fonts have no Cyrillic; see docs/STORE.md
        const state = { phase: 'idle', pin: '', connected: false, notice: t('preview_only') };
        BUTTONS.forEach(id => ctx.ui.onClick(id, () => { state.notice = t('preview_only'); }));
        ctx.loop('MAIN', 2, () => {
            const cv = ctx.canvas(W, H);
            drawHome(wrap(cv, W, H), state, t);
            return ctx.ui.image('MAIN_GFX', cv);
        });
        ctx.log.info('Base Player interface build started (no receiver)');
    },
});
