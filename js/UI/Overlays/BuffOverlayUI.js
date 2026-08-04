// Sprite symbol per buff category — the fallback when a buff declares no icon
// of its own in data/metadata/buffs.json.
const BUFF_CATEGORY_ICONS = Object.freeze({
    energy: 'bolt',
    health: 'heart',
    satiety: 'bowl',
    fun: 'ball',
    mood: 'smile',
    boredom: 'sleep',
    comfort: 'bed',
    confidence: 'sparkle',
    social: 'social',
    play: 'ball',
    recovery: 'star',
    food: 'bowl',
    event: 'sparkle',
    aura: 'star',
    zone: 'pin',
    general: 'star'
});

// Fixed display order for exclusive groups — buffs in these groups always appear
// in this order relative to each other, regardless of which buff in the group is active.
const BUFF_GROUP_ORDER = [
    'zone',
    'time_of_day',
    'weather',
    'energy_tier',
    'satiety_tier',
    'mood_polarity',
    'confidence_polarity'
];

class BuffOverlayUI extends CompactChipStripUI {
    _getGroupOrder(buff) {
        const idx = BUFF_GROUP_ORDER.indexOf(buff.exclusiveGroup ?? '');
        return idx === -1 ? BUFF_GROUP_ORDER.length : idx;
    }

    getItems() {
        const activeMyte = this.parent.getActiveMyte?.();
        const buffs = activeMyte?.buffs?.getVisibleBuffs?.() ?? [];
        return [...buffs].sort((a, b) => {
            const ga = this._getGroupOrder(a);
            const gb = this._getGroupOrder(b);
            if (ga !== gb) return ga - gb;
            return (a.priority ?? 50) - (b.priority ?? 50);
        });
    }

    getIconName(buff) {
        return buff.icon || BUFF_CATEGORY_ICONS[buff.category] || null;
    }

    getShortLabel(buff) {
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
            icon: this.getIconName(buff),
            shortLabel: this.getShortLabel(buff),
            badgeText: buff.stacks > 1 ? String(buff.stacks) : null,
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
