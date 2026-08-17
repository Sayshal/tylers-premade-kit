/**
 * Bloodburn — 1st-level evocation. Self-damaging fire save spell.
 *
 * Passes:
 *  - OnUse / preItemRoll: filter immune creature types, prompt for HP cost, apply self-damage.
 *  - DamageBonus / damageBonus: add HP-spent as bonus fire damage.
 *  - OnUse / postActiveEffects: play crimson ray + blood impact animation.
 */
export async function bloodburn({ actor, args, workflow } = {}) {
  // DEBUG entry — confirm macro fires at all and inspect args shape.
  console.error('[Bloodburn] entered', {
    args0: args?.[0],
    tag: args?.[0]?.tag,
    macroPass: args?.[0]?.macroPass,
    hasWorkflow: !!workflow,
    actorName: actor?.name
  });

  if (typeof args?.[0] === 'string') {
    console.error('[Bloodburn] DAE on/off path — exiting');
    return; // DAE apply/remove path — no-op.
  }

  const tag = args[0].tag;
  const pass = args[0].macroPass;
  const IMMUNE = new Set(['construct', 'elemental', 'undead']);

  if (tag === 'OnUse' && pass === 'preItemRoll') {
    console.error('[Bloodburn] preItemRoll pass');
    const kept = [];
    const dropped = [];
    for (const t of workflow.targets) {
      const ttype = t.actor?.system?.details?.type?.value ?? '';
      if (IMMUNE.has(ttype)) dropped.push(t.name);
      else kept.push(t);
    }
    if (dropped.length) {
      await ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content: `<p><em>Bloodburn has no effect on ${dropped.join(', ')} (constructs, elementals, and undead are immune).</em></p>`
      });
      workflow.targets = new Set(kept);
    }
    if (workflow.targets.size === 0) {
      ui.notifications?.warn('Bloodburn: no valid targets after immunity filter.');
      return false;
    }

    const currentHP = actor.system.attributes.hp.value;
    const maxSpend = currentHP - 1;
    if (maxSpend < 1) {
      ui.notifications?.warn('Bloodburn: at least 2 HP required to cast.');
      return false;
    }

    const hpSpent = await foundry.applications.api.DialogV2.wait({
      window: { title: 'Bloodburn — Spend Hit Points' },
      content: `
        <div class="form-group">
          <label>HP</label>
          <div class="form-fields">
            <input type="number" name="hp" value="1" min="1" max="${maxSpend}" autofocus>
          </div>
          <p class="hint">Max: ${maxSpend}. Each HP spent increases fire damage by 1.</p>
        </div>
      `,
      buttons: [
        {
          action: 'cast',
          label: 'Cast',
          default: true,
          callback: (_event, button) => {
            const raw = Number(button.form.elements.hp.value) || 1;
            return Math.clamp(raw, 1, maxSpend);
          }
        },
        { action: 'cancel', label: 'Cancel', callback: () => null }
      ],
      rejectClose: false,
      modal: true
    });
    console.error('[Bloodburn] dialog resolved with hpSpent =', hpSpent);
    if (hpSpent == null) return false;

    await actor.applyDamage(hpSpent);
    await actor.setFlag('tylers-premade-kit', 'bloodburnHP', hpSpent);
    console.error('[Bloodburn] HP flag set to', hpSpent, '— current flag value:', actor.getFlag('tylers-premade-kit', 'bloodburnHP'));
    return;
  }

  if (tag === 'DamageBonus' && pass === 'DamageBonus') {
    const hp = actor.getFlag('tylers-premade-kit', 'bloodburnHP') ?? 0;
    console.error('[Bloodburn] damageBonus pass — read flag =', hp);
    if (!hp) return;
    await actor.unsetFlag('tylers-premade-kit', 'bloodburnHP');
    const ret = [{ damageRoll: `${hp}[fire]`, flavor: `Bloodburn (${hp} HP spent)` }];
    console.error('[Bloodburn] damageBonus returning', ret);
    return ret;
  }

  if (tag === 'OnUse' && pass === 'postActiveEffects') {
    console.error('[Bloodburn] postActiveEffects pass — flag at start:', actor.getFlag('tylers-premade-kit', 'bloodburnHP'));
    if (!game.modules.get('sequencer')?.active) {
      console.warn('[Bloodburn] Sequencer module not active — skipping animation. Install: https://github.com/fantasycalendar/FoundryVTT-Sequencer');
      return;
    }
    if (!workflow?.token || !workflow?.targets?.size) {
      console.warn('[Bloodburn] no token/targets at postActiveEffects — skipping animation');
      return;
    }
    const patreon = game.modules.get('jb2a_patreon')?.active;
    const rayFile = patreon ? 'jb2a.energy_strands.range.standard.crimsonred' : 'jb2a.scorching_ray.01.orange';
    const impactFile = patreon ? 'jb2a.impact.blood.01' : 'jb2a.impact.013.orangeyellow';
    const seq = new Sequence({ moduleName: 'tylers-premade-kit', softFail: true });
    for (const target of workflow.targets) {
      seq.effect().file(rayFile).atLocation(workflow.token).stretchTo(target).waitUntilFinished(-500).effect().file(impactFile).atLocation(target).scale(0.8);
    }
    await seq.play();
    return;
  }

  // Catch-all: log unhandled tag/pass combos so we know what midi-qol is sending.
  console.error('[Bloodburn] UNHANDLED tag/pass:', tag, pass);
}
