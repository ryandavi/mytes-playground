const BUFF_CATEGORY_LABELS = Object.freeze({
    energy: '⚡',
    health: '❤️',
    mood: '😊',
    boredom: '😴',
    comfort: '🛋️',
    confidence: '✨',
    social: '👥',
    play: '🎉',
    general: '⭐'
});

class BuffOverlayUI extends CompactChipStripUI {
    getItems() {
        const activeMyte = this.parent.getActiveMyte?.();
        return activeMyte?.buffs?.getVisibleBuffs?.() ?? [];
    }

    getShortLabel(buff) {
        if (buff.icon) {
            return buff.icon;
        }

        if (buff.category && BUFF_CATEGORY_LABELS[buff.category]) {
            return BUFF_CATEGORY_LABELS[buff.category];
        }

        const words = String(buff.label || '')
            .split(/[^a-zA-Z0-9]+/)
            .filter(Boolean);

        if (words.length === 0) return 'BF';
        if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
        return `${words[0][0]}${words[1][0]}`.toUpperCase();
    }

    getChipConfig(buff, index) {
        const tooltipLines = [
            buff.description || buff.tooltip || '',
            buff.stacks > 1 ? `Stacks: ${buff.stacks}` : '',
            `Duration: ${buff.remainingLabel}`,
            buff.cancellable ? 'Hold to cancel.' : ''
        ].filter(Boolean);

        return {
            key: buff.instanceId,
            item: buff,
            index,
            className: `buff-chip kind-${buff.kind} category-${buff.category}${buff.cancellable ? ' is-cancellable' : ''}`,
            label: buff.label,
            shortLabel: this.getShortLabel(buff),
            badgeText: buff.stacks > 1 ? String(buff.stacks) : (buff.kind === 'debuff' ? '!' : '+'),
            progressRatio: buff.progressRatio,
            cancellable: buff.cancellable,
            tooltipTitle: buff.label,
            tooltipLines
        };
    }

    cancelItem(buff) {
        const activeMyte = this.parent.getActiveMyte?.();
        return activeMyte?.buffs?.removeBuff?.(buff.instanceId, { reason: 'manual' }) ?? false;
    }
}
