export async function numbingTouch({ args, workflow }) {
  if (args?.[0]?.tag !== 'OnUse') return;
  if (args[0].macroPass !== 'postActiveEffects') return;
  if (!game.modules.get('sequencer')?.active) return;
  if (!workflow?.token || !workflow?.targets?.size) return;
  const seq = new Sequence({ moduleName: 'tylers-premade-kit', softFail: true });
  for (const target of workflow.targets) seq.effect().file('jb2a.energy_strands.range.standard.purple').atLocation(workflow.token).stretchTo(target).fadeIn(150).fadeOut(400).wait(50);
  await seq.play();
}
