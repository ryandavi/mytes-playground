class ActionSlotLedger {
	constructor(object) {
		this.object = object;
		this.actionOccupancy = new Map();
		this.actionSlotOccupancy = new Map();
	}

	getActionSlotDefinitions(actionId) {
		const actionConfig = this.object.getActionConfig(actionId, {}) ?? {};
		const facing = this.object.getConfig('facingDirection', this.object.facingDirection ?? 'S');
		let slots = [];

		if (Array.isArray(actionConfig.slots)) {
			slots = actionConfig.slots;
		} else if (actionConfig.slotsByFacing && typeof actionConfig.slotsByFacing === 'object') {
			slots = actionConfig.slotsByFacing[facing] ??
				actionConfig.slotsByFacing.default ??
				[];
		}

		if (!Array.isArray(slots) || slots.length === 0) {
			const mytePosition = this.object.getConfig('mytePosition', null);
			if (!mytePosition) return [];
			return [{
				id: 'default',
				restPosition: mytePosition,
				restFacing: this.object.getConfig('myteFacing', null) ?? undefined
			}];
		}

		return slots.map((slot, index) => ({
			id: slot?.id ?? `${actionId}_slot_${index}`,
			...slot
		}));
	}

	getActionOccupant(actionId) {
		return actionId ? (this.actionOccupancy.get(actionId) ?? null) : null;
	}

	getActionSlotOccupants(actionId) {
		if (!actionId) {
			return null;
		}

		let slotOccupants = this.actionSlotOccupancy.get(actionId);
		if (!slotOccupants) {
			slotOccupants = new Map();
			this.actionSlotOccupancy.set(actionId, slotOccupants);
		}

		return slotOccupants;
	}

	getActionSlotOccupant(actionId, slotId) {
		if (!actionId || !slotId) {
			return null;
		}

		return this.actionSlotOccupancy.get(actionId)?.get(slotId) ?? null;
	}

	isActionSlotOccupied(actionId, slotId, actor = null) {
		const occupant = this.getActionSlotOccupant(actionId, slotId);
		return !!occupant && occupant !== actor;
	}

	getAvailableActionSlots(actionId, actor = null) {
		return this.getActionSlotDefinitions(actionId)
			.filter(slot => !this.isActionSlotOccupied(actionId, slot.id, actor));
	}

	isActionOccupied(actionId, actor = null) {
		const slots = this.getActionSlotDefinitions(actionId);
		if (slots.length > 0) {
			return this.getAvailableActionSlots(actionId, actor).length === 0;
		}

		const occupant = this.getActionOccupant(actionId);
		return !!occupant && occupant !== actor;
	}

	claimActionSlot(actionId, slotId, actor = null) {
		if (!actionId || !slotId) {
			return false;
		}

		const slots = this.getActionSlotDefinitions(actionId);
		if (!slots.some(slot => slot.id === slotId)) {
			return false;
		}

		const occupant = this.getActionSlotOccupant(actionId, slotId);
		if (occupant && occupant !== actor) {
			return false;
		}

		if (actor) {
			this.getActionSlotOccupants(actionId).set(slotId, actor);
		}

		return true;
	}

	claimActionOccupancy(actionId, actor = null) {
		if (!actionId) {
			return true;
		}

		if (this.getActionSlotDefinitions(actionId).length > 0) {
			return !this.isActionOccupied(actionId, actor);
		}

		const actionConfig = this.object.getActionConfig(actionId, {}) ?? {};
		const exclusive = actionConfig.exclusive !== false;
		const occupant = this.getActionOccupant(actionId);

		if (exclusive && occupant && occupant !== actor) {
			return false;
		}

		if (actor) {
			this.actionOccupancy.set(actionId, actor);
		}

		return true;
	}

	releaseActionOccupancy(actionId, actor = null) {
		if (!actionId) {
			return false;
		}

		if (this.getActionSlotDefinitions(actionId).length > 0) {
			let released = false;
			const slotOccupants = this.actionSlotOccupancy.get(actionId);
			if (!slotOccupants) {
				return false;
			}

			for (const [slotId, occupant] of slotOccupants.entries()) {
				if (!actor || occupant === actor) {
					slotOccupants.delete(slotId);
					released = true;
				}
			}

			if (slotOccupants.size === 0) {
				this.actionSlotOccupancy.delete(actionId);
			}

			return released;
		}

		const occupant = this.getActionOccupant(actionId);
		if (!occupant) {
			return false;
		}

		if (actor && occupant !== actor) {
			return false;
		}

		this.actionOccupancy.delete(actionId);
		return true;
	}

	releaseActionSlot(actionId, slotId, actor = null) {
		if (!actionId || !slotId) {
			return false;
		}

		const slotOccupants = this.actionSlotOccupancy.get(actionId);
		if (!slotOccupants) {
			return false;
		}

		const occupant = slotOccupants.get(slotId);
		if (!occupant) {
			return false;
		}

		if (actor && occupant !== actor) {
			return false;
		}

		slotOccupants.delete(slotId);
		if (slotOccupants.size === 0) {
			this.actionSlotOccupancy.delete(actionId);
		}

		return true;
	}

	isInUse(actionId = null) {
		if (actionId) {
			const slotOccupants = this.actionSlotOccupancy.get(actionId);
			return this.getActionOccupant(actionId) != null || (slotOccupants?.size ?? 0) > 0;
		}

		if (this.actionOccupancy.size > 0) {
			return true;
		}

		for (const slotOccupants of this.actionSlotOccupancy.values()) {
			if ((slotOccupants?.size ?? 0) > 0) {
				return true;
			}
		}

		return false;
	}

	clear() {
		this.actionOccupancy.clear();
		this.actionSlotOccupancy.clear();
	}
}
