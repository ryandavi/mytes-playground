// Petting gesture for the world-myte sprite. Gesture detection lives in the
// shared RubbingComponent (InputSystem-driven, same as rubbable map objects);
// this class only wires the myte-specific reactions — expressions and the
// petted/overstimulated buffs.
class MyteRubbingHandler extends MyteBaseHandler {
	constructor(myte) {
		super(myte);

		const rubbing = SiteConfig.interaction.rubbing;
		this.component = new RubbingComponent(myte, {
			element: myte.pointerTarget,
			enabled: true,
			minRubs: rubbing.minRubs,
			maxRubs: rubbing.maxRubsMyte,
			canRub: (event) =>
				myte.parent.ui?.isTool?.(UIToolModes.PET) === true &&
				myte.containsScreenPoint(
					event.position.clientX,
					event.position.clientY,
					'hit'
				),
			onRubComplete: (event) => this._applyPettingResult(event.count, false),
			onRubOverdone: (event) => this._applyPettingResult(event.count, true)
		});
		this.component.initialize();
	}

	_applyPettingResult(rubCount, overdone) {
		const sounds = SiteConfig.ui.interactionSounds;
		this.myte.parent?.core?.soundManager?.playWhenReady?.(
			overdone ? sounds.petOverdone : sounds.pet,
			{ source: this.myte }
		);

		this.myte.queue.interrupt('expression', {
			actionType: overdone ? 'dizzy' : 'happy'
		});

		this.myte.buffs?.applyBuff?.(
			overdone ? 'overstimulated' : 'petted',
			{
				source: 'petting',
				payload: { rubCount }
			}
		);
	}

	dispose() {
		this.component?.destroy();
		this.component = null;
		super.dispose();
	}
}
