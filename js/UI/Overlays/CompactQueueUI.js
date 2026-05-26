const ACTION_CHIP_LABELS = Object.freeze({
    'astar-move': '🏃',
    'move': '🏃',
    'go_to_object': '🏃',
    'idle': '💤',
    'expression': '😊',
    'dance': '💃',
    'simple_sleep': '😴',
    'sleep': '😴',
    'jump': '⬆️',
    'circle': '🔄',
    'zigzag': '↔️',
    'run_laps': '🔁',
    'patrol': '👀',
    'wander': '🌀',
    'guard': '🛡️',
    'follow_mouse': '🖱️',
    'follow_object': '🔗',
    'inspect': '🔍',
    'deep_inspect': '🔬',
    'interact_object': '👆',
    'use_surface_slot': '🛏️',
    'nudge_ball': '⚽',
    'eat_element': '🍽️',
    'open_chest': '📦',
    'close_chest': '🔒',
    'pick_flower': '🌸',
    'trample_flower': '👟',
    'smell_flower': '🌺',
    'drink_fountain': '💧',
    'water_plant': '🪣',
    'harvest': '🌾',
    'shake_tree': '🌳',
    'chop_tree': '🪓',
    'remove_stump': '🪵',
    'show_affection': '❤️',
    'greet': '👋',
    'greet_receive': '👋',
    'watch': '👁️',
    'chase': '🏃',
    'emote_at': '💬',
    'play_tag': '🏷️',
    'play_fetch': '🎾',
    'carry_pickup': '🤲',
    'carry': '🫂',
    'being_carried': '🪁',
    'carry_putdown': '📍',
    'pickup_item': '🤲',
    'hold_item': '✊',
    'drop_item': '📤',
    'give_item': '🎁',
    'run_away': '🏃',
    'run_from': '🚪',
    'hide': '🙈'
});

class CompactQueueUI extends CompactChipStripUI {
    getItems() {
        const activeMyte = this.parent.getActiveMyte?.();
        return activeMyte?.queue?.queue ?? [];
    }

    getQueueTitle(item) {
        return item.getQueueTitle?.() ||
            item.constructor?.metadata?.label ||
            item.constructor?.name?.replace(/Action$/, '') ||
            'Action';
    }

    getQueueDescription(item) {
        return item.getQueueDescription?.() || '';
    }

    getShortLabel(item) {
        const explicitIcon = item.constructor?.metadata?.icon;
        if (explicitIcon) {
            return explicitIcon;
        }

        const explicit = item.constructor?.metadata?.labelShort;
        if (explicit) {
            return explicit;
        }

        const actionId = item.constructor?.metadata?.id;
        if (actionId && ACTION_CHIP_LABELS[actionId]) {
            return ACTION_CHIP_LABELS[actionId];
        }

        const words = this.getQueueTitle(item)
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean);

        if (words.length === 0) return 'Q';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    getProgressRatio(item, index) {
        if (index !== 0) {
            return null;
        }

        if (typeof item.getProgress === 'function') {
            const p = item.getProgress();
            // Only show if progress has meaningfully started (avoids stuck-at-0 meter)
            return p > 0 ? Utility.clamp(p, 0, 1) : null;
        }

        if (!item.duration || item.duration <= 0 || item.currentDuration === -1) {
            return null;
        }

        // Only reveal meter once the action has actually started ticking down
        if (item.currentDuration >= item.duration) {
            return null;
        }

        return Utility.clamp(1 - (item.currentDuration / Math.max(item.duration, 1)), 0, 1);
    }

    getChipConfig(item, index) {
        const title = this.getQueueTitle(item);
        const description = this.getQueueDescription(item);
        const progressRatio = this.getProgressRatio(item, index);
        const progressPercent = progressRatio == null ? null : Math.round(progressRatio * 100);
        const tooltipLines = [];

        if (description) {
            tooltipLines.push(description);
        }

        tooltipLines.push(index === 0 ? 'Current action' : `Queued #${index + 1}`);

        if (progressPercent != null) {
            tooltipLines.push(`Progress: ${progressPercent}%`);
        }

        tooltipLines.push('Hold to cancel.');

        return {
            key: `queue-${index}`,
            item,
            index,
            className: `queue-chip ${item.constructor?.metadata?.category || ''} action-${item.constructor?.metadata?.id || 'unknown'}${index === 0 ? ' is-current' : ''}`,
            label: title,
            shortLabel: this.getShortLabel(item),
            badgeText: String(index + 1),
            progressRatio,
            cancellable: true,
            tooltipTitle: title,
            tooltipLines
        };
    }

    cancelItem(item, index) {
        const activeMyte = this.parent.getActiveMyte?.();
        if (!activeMyte?.queue) {
            return false;
        }

        if (index === 0) {
            activeMyte.queue.removeCurrentAction?.();
            return true;
        }

        if (Array.isArray(activeMyte.queue.queue)) {
            activeMyte.queue.queue.splice(index, 1);
            return true;
        }

        return false;
    }
}
