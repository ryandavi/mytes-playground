



Drives/Needs:
can we remove the Home drive for mytes? I don't think they have a desire to be at home. I feel like enrichment and play derived drives are the same thing as the fun need - do we need both? How is comfort a need and derived drive? Are drives just for the myte AI? Do we need a confidence need? The needs should drive actions. Should a derived drive be when energy is low, we have hunger? Should we hae an environment drive? Can we audit the need/drive system.

Maybe confidence determines which actions a myte will attempt on its own. A low-confidence myte won't greet other mytes, won't open chests, won't explore far. A high-confidence myte does all of these freely. The player builds confidence by interacting positively and placing mytes in enriched environments. Mytes can portal autonomously when confident enough (high confidence stat) and their AI drives push them toward what's on the other side.
The sims does Hunger, Fun, Comfort, Social, Bladder, Hygiene, Energy, Evironment. I dont want potty mechanics, so not that.




Can anything from MyteStats.js become a buff/debuff? Just to surface why something is happening.

In MyteStats.js:
const isStimulating = [
	'inspect',
	'deep_inspect',
	'smell_flower',
	'drink_fountain',
	'water_plant',
	'harvest',
	'interact_object',
	'open_chest',
	'eat_element'
].includes(actionId);
const isPlayful = [
	'run_laps',
	'circle',
	'zigzag',
	'jump',
	'dance',
	'play_tag',
	'play_fetch',
	'nudge_ball'
].includes(actionId);
const isSocial = [
	'show_affection',
	'greet',
	'greet_receive',
	'watch',
	'play_tag'
].includes(actionId);
const isPurposefulMovement = [
	'go_to_object',
	'astar-move',
	'move',
	'follow_object'
].includes(actionId);

Should these be hardcoded? Should this information be in the action metadata? What is missing?